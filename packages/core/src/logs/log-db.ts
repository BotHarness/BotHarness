import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Lightweight owner for the operational log database (`logs.db`), separate
 * from the owner-managed main database by ADR-0063: append-only debugging
 * facts with no backup, no leases, and rebuild-empty worst case. A logging
 * module owns these tables; readers never receive SQL, only rows.
 * @module @botharness/core/logs/log-db
 */

/** Log database filename inside the BotHarness profile directory. */
export const LOG_DB_FILENAME = 'logs.db';

/** Schema generation this code reads and writes. */
export const LOG_DB_VERSION = 2;

/** Locked retention defaults (ADR-0063): 50k rows, 30 days. */
export const LOG_DEFAULT_MAX_ROWS = 50_000;
export const LOG_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/** Cap for stored details; longer text is truncated with a marker. */
export const LOG_DETAIL_MAX_CHARS = 4000;
const TRUNCATION_MARKER = '…[truncated]';

/** Truncate overlong details so one noisy writer cannot bloat the file. */
export function truncateDetail(detail: string): string {
  if (detail.length <= LOG_DETAIL_MAX_CHARS) return detail;
  return `${detail.slice(0, LOG_DETAIL_MAX_CHARS)}${TRUNCATION_MARKER}`;
}

/** Who may read an entry: shared profile resources or one bot. */
export type LogOwnerScope = 'profile-shared' | `bot:${string}`;

/** One operational log fact. */
export interface LogEntryInput {
  readonly plugin: string;
  readonly owner: LogOwnerScope;
  readonly kind: string;
  readonly detail: string;
  /** Epoch milliseconds; defaults to now. */
  readonly ts?: number;
  /**
   * Causation links, orthogonal to the read-scoping `owner`: a row can be
   * profile-readable yet attributed to the bot/session/run that caused it.
   * All nullable — computer's own rows carry none today.
   */
  readonly principal?: string;
  /** PersonaBot slug that caused this entry, if any. */
  readonly bot?: string;
  /** Orchestrator Session id (1:1 with its PersonaBot), if any. */
  readonly orchestratorSession?: string;
  /** Assignment Session id, if any. */
  readonly assignmentSession?: string;
  /** One end-to-end operation instance spanning plugins, if any. */
  readonly traceId?: string;
  /**
   * Plugin-specific structured extras as JSON text. Fixed dimensions live
   * in columns; this is the documented overflow for per-plugin shapes the
   * table does not model. Must be valid JSON when present (enforced).
   */
  readonly payload?: string;
}

/** One forward-migration step from a previous generation. */
export interface LogMigration {
  /** Source generation this step upgrades from; each step advances exactly one. */
  readonly from: number;
  /** Applies the upgrade in place. */
  readonly migrate: (database: DatabaseSync) => void;
}

export interface OpenLogDatabaseOptions {
  /** BotHarness profile directory; the file lives directly inside it. */
  readonly dir: string;
  readonly now?: () => number;
  /** Row cap before oldest-first pruning; defaults to LOG_DEFAULT_MAX_ROWS. */
  readonly maxRows?: number;
  /** Age cap before pruning; defaults to LOG_DEFAULT_MAX_AGE_MS. */
  readonly maxAgeMs?: number;
  /** Forward migrations, consulted oldest-first; defaults to none. */
  readonly migrations?: readonly LogMigration[];
}

export interface LogDatabase {
  /** Append one entry and lazily prune past retention. Synchronous. */
  write(entry: LogEntryInput): void;
  /** Read newest-first; filters are all optional AND-ed matches. Synchronous. */
  query(filter?: LogQuery): LogEntry[];
  close(): void;
}

/** One stored row: the written fact plus its identity. */
export interface LogEntry extends LogEntryInput {
  readonly id: number;
  readonly ts: number;
}

/** Default read window; absurd or invalid limits fall back here, never error. */
export const LOG_QUERY_DEFAULT_LIMIT = 100;
/** Upper bound on a single read so a viewer cannot ask for the whole file. */
export const LOG_QUERY_MAX_LIMIT = 1000;

/** Optional AND-ed filters for a newest-first read. */
export interface LogQuery {
  readonly plugin?: string;
  readonly owner?: LogOwnerScope;
  /**
   * Causation-entity match: equals against principal, bot,
   * orchestrator_session, or assignment_session (OR). Trace lookup stays
   * exact-match capable through this same field when callers pass a trace id.
   */
  readonly entity?: string;
  /** Epoch milliseconds; only rows with ts at or after this. */
  readonly since?: number;
  readonly limit?: number;
}

/** Shipped forward migrations, oldest first — always consulted. */
const BUILTIN_MIGRATIONS: readonly LogMigration[] = [
  {
    from: 1,
    migrate: (database) => {
      database.exec(`
        ALTER TABLE log_entries ADD COLUMN payload TEXT CHECK (payload IS NULL OR json_valid(payload));
      `);
    },
  },
];

function dbPath(dir: string): string {
  return join(dir, LOG_DB_FILENAME);
}

function createSchema(database: DatabaseSync): void {
  database.exec(`
    CREATE TABLE log_schema (
      singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
      version INTEGER NOT NULL
    ) STRICT;
    INSERT INTO log_schema (singleton, version) VALUES (1, ${LOG_DB_VERSION});
    CREATE TABLE log_entries (
      id INTEGER PRIMARY KEY,
      ts INTEGER NOT NULL,
      plugin TEXT NOT NULL,
      owner TEXT NOT NULL,
      kind TEXT NOT NULL,
      detail TEXT NOT NULL,
      principal TEXT,
      bot TEXT,
      orchestrator_session TEXT,
      assignment_session TEXT,
      trace_id TEXT,
      payload TEXT CHECK (payload IS NULL OR json_valid(payload))
    ) STRICT;
    CREATE INDEX log_entries_ts ON log_entries (ts);
    CREATE INDEX log_entries_plugin_owner ON log_entries (plugin, owner);
    CREATE INDEX log_entries_trace ON log_entries (trace_id);
    CREATE INDEX log_entries_owner ON log_entries (owner);
  `);
}

/**
 * Indexes are performance-only, not versioned: heal them idempotently on
 * every open so pre-index databases gain them without a migration.
 */
function ensureIndexes(database: DatabaseSync): void {
  database.exec(`
    CREATE INDEX IF NOT EXISTS log_entries_ts ON log_entries (ts);
    CREATE INDEX IF NOT EXISTS log_entries_plugin_owner ON log_entries (plugin, owner);
    CREATE INDEX IF NOT EXISTS log_entries_trace ON log_entries (trace_id);
    CREATE INDEX IF NOT EXISTS log_entries_owner ON log_entries (owner);
  `);
}

function readVersion(database: DatabaseSync): number | undefined {
  try {
    const row = database.prepare('SELECT version FROM log_schema WHERE singleton = 1').get() as
      | { version?: unknown }
      | undefined;
    return typeof row?.version === 'number' ? row.version : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Open (or rebuild) the log database. Corrupt files, unknown versions, and
 * newer-than-supported generations rebuild empty — a disposable debug store
 * never blocks boot and never enters recovery mode.
 */
export function openLogDatabase(options: OpenLogDatabaseOptions): LogDatabase {
  const now = options.now ?? Date.now;
  const maxRows = options.maxRows ?? LOG_DEFAULT_MAX_ROWS;
  const maxAgeMs = options.maxAgeMs ?? LOG_DEFAULT_MAX_AGE_MS;
  // Built-in history first, caller extras after: every shipped generation
  // stays reachable no matter which options the caller passes.
  const chain = [...BUILTIN_MIGRATIONS, ...(options.migrations ?? [])].sort(
    (a, b) => a.from - b.from,
  );
  const path = dbPath(options.dir);

  /** Destroy and recreate; the only recovery this store knows. */
  const rebuildEmpty = (): DatabaseSync => {
    rmSync(path, { force: true });
    rmSync(`${path}-wal`, { force: true });
    rmSync(`${path}-shm`, { force: true });
    mkdirSync(options.dir, { recursive: true });
    const database = new DatabaseSync(path);
    database.exec('PRAGMA journal_mode = WAL;');
    createSchema(database);
    return database;
  };

  const migrateForward = (database: DatabaseSync, from: number): boolean => {
    if (from > LOG_DB_VERSION) return false;
    let version = from;
    while (version < LOG_DB_VERSION) {
      const step = chain.find((m) => m.from === version);
      if (step === undefined) return false;
      step.migrate(database);
      version += 1;
      database.prepare('UPDATE log_schema SET version = ? WHERE singleton = 1').run(version);
    }
    return true;
  };

  const openOrRebuild = (): DatabaseSync => {
    try {
      if (!existsSync(path)) return rebuildEmpty();
      const database = new DatabaseSync(path);
      try {
        database.exec('PRAGMA journal_mode = WAL;');
        const version = readVersion(database);
        if (version === LOG_DB_VERSION) {
          ensureIndexes(database);
          return database;
        }
        if (version !== undefined && migrateForward(database, version)) {
          ensureIndexes(database);
          return database;
        }
      } catch {
        // Fall through to rebuild below.
      }
      database.close();
    } catch {
      // Fall through to rebuild below.
    }
    return rebuildEmpty();
  };

  let database = openOrRebuild();

  const swap = (next: DatabaseSync): void => {
    try {
      database.close();
    } catch {
      // Already dead; the replacement is what matters.
    }
    database = next;
  };

  const writeRow = (entry: LogEntryInput): void => {
    const at = entry.ts ?? now();
    database
      .prepare(
        'INSERT INTO log_entries (ts, plugin, owner, kind, detail, principal, bot, orchestrator_session, assignment_session, trace_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        at,
        entry.plugin,
        entry.owner,
        entry.kind,
        truncateDetail(entry.detail),
        entry.principal ?? null,
        entry.bot ?? null,
        entry.orchestratorSession ?? null,
        entry.assignmentSession ?? null,
        entry.traceId ?? null,
        entry.payload ?? null,
      );
    database.prepare('DELETE FROM log_entries WHERE ts < ?').run(at - maxAgeMs);
    database
      .prepare(
        'DELETE FROM log_entries WHERE id NOT IN (SELECT id FROM log_entries ORDER BY ts DESC, id DESC LIMIT ?)',
      )
      .run(maxRows);
  };

  return {
    write(entry: LogEntryInput): void {
      try {
        // A file deleted mid-run keeps accepting writes into an orphan inode;
        // reopen first so the rows land somewhere readable.
        if (!existsSync(path)) swap(openOrRebuild());
        writeRow(entry);
      } catch {
        swap(openOrRebuild());
        writeRow(entry);
      }
    },
    query(filter?: LogQuery): LogEntry[] {
      const conditions: string[] = [];
      const params: (string | number)[] = [];
      if (filter?.plugin !== undefined && filter.plugin !== '') {
        conditions.push('plugin = ?');
        params.push(filter.plugin);
      }
      if (filter?.owner !== undefined) {
        conditions.push('owner = ?');
        params.push(filter.owner);
      }
      if (filter?.entity !== undefined && filter.entity !== '') {
        conditions.push(
          '(principal = ? OR bot = ? OR orchestrator_session = ? OR assignment_session = ? OR trace_id = ?)',
        );
        params.push(filter.entity, filter.entity, filter.entity, filter.entity, filter.entity);
      }
      if (filter?.since !== undefined && Number.isFinite(filter.since)) {
        conditions.push('ts >= ?');
        params.push(filter.since);
      }
      const limit =
        filter?.limit !== undefined &&
        Number.isInteger(filter.limit) &&
        filter.limit > 0 &&
        filter.limit <= LOG_QUERY_MAX_LIMIT
          ? filter.limit
          : LOG_QUERY_DEFAULT_LIMIT;
      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      try {
        const rows = database
          .prepare(
            `SELECT id, ts, plugin, owner, kind, detail, principal, bot, orchestrator_session, assignment_session, trace_id, payload FROM log_entries ${where} ORDER BY ts DESC, id DESC LIMIT ?`,
          )
          .all(...params, limit) as {
          id: number;
          ts: number;
          plugin: string;
          owner: string;
          kind: string;
          detail: string;
          principal: string | null;
          bot: string | null;
          orchestrator_session: string | null;
          assignment_session: string | null;
          trace_id: string | null;
          payload: string | null;
        }[];
        return rows.map((row): LogEntry => ({
          id: row.id,
          ts: row.ts,
          plugin: row.plugin,
          owner: row.owner as LogOwnerScope,
          kind: row.kind,
          detail: row.detail,
          ...(row.principal === null ? {} : { principal: row.principal }),
          ...(row.bot === null ? {} : { bot: row.bot }),
          ...(row.orchestrator_session === null
            ? {}
            : { orchestratorSession: row.orchestrator_session }),
          ...(row.assignment_session === null ? {} : { assignmentSession: row.assignment_session }),
          ...(row.trace_id === null ? {} : { traceId: row.trace_id }),
          ...(row.payload === null ? {} : { payload: row.payload }),
        }));
      } catch {
        return [];
      }
    },
    close(): void {
      database.close();
    },
  };
}
