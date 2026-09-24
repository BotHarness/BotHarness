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
export const LOG_DB_VERSION = 1;

/** Locked retention defaults (ADR-0063): 50k rows, 30 days. */
export const LOG_DEFAULT_MAX_ROWS = 50_000;
export const LOG_DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

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
  close(): void;
}

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
      trace_id TEXT
    ) STRICT;
    CREATE INDEX log_entries_ts ON log_entries (ts);
    CREATE INDEX log_entries_plugin_owner ON log_entries (plugin, owner);
    CREATE INDEX log_entries_trace ON log_entries (trace_id);
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
  const migrations = options.migrations ?? [];
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
      const step = migrations.find((m) => m.from === version);
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
        if (version === LOG_DB_VERSION) return database;
        if (version !== undefined && migrateForward(database, version)) return database;
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
        'INSERT INTO log_entries (ts, plugin, owner, kind, detail, principal, bot, orchestrator_session, assignment_session, trace_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        at,
        entry.plugin,
        entry.owner,
        entry.kind,
        entry.detail,
        entry.principal ?? null,
        entry.bot ?? null,
        entry.orchestratorSession ?? null,
        entry.assignmentSession ?? null,
        entry.traceId ?? null,
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
    close(): void {
      database.close();
    },
  };
}
