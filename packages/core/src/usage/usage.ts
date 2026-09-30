import type { DatabaseSync } from 'node:sqlite';

import {
  attachOperationalModule,
  type OperationalDatabaseModulePort,
  type OperationalDatabaseOwner,
} from '../database/owner.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';

export interface UsageDayRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalTokens?: number | null;
  unknownBuckets?: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

export interface UsageRebuildReport {
  folded: number;

  failed: number;
}

export interface DshUsageSessionLog {
  events: readonly DshSessionEvent[];
  inheritedEventCount: number;
}

export type DshUsageSessionLogReader = (
  sessionId: string,
) => Promise<DshUsageSessionLog | undefined>;

export interface UsageProjection {
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;

  primeSession(sessionId: string, events: readonly DshSessionEvent[]): void;

  rebuild(
    sessionIds: readonly string[],
    readLog: DshUsageSessionLogReader,
  ): Promise<UsageRebuildReport>;

  activity(botSlug: string, sinceIso: string): UsageDayRow[];
}

interface UsageDailyDbRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  unknown_input: number;
  unknown_output: number;
  unknown_cache_read: number;
  unknown_cache_write: number;
  total_tokens: number;
  unknown_total: number;
}

export function usageLocalDay(timeMs: number): string {
  const date = new Date(timeMs);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function purposeOf(owner: { rootRole: string; provenance: string }): string {
  return owner.provenance === 'subagent' ? 'subagent' : owner.rootRole;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function reportedBuckets(event: DshSessionEvent): {
  uncachedInputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalTokens?: number;
} {
  const data = recordOf(event.data);
  const stream = Array.isArray(data?.['stream']) ? data['stream'] : [];
  const last = stream.findLast(
    (entry) => recordOf(recordOf(entry)?.['chunk'])?.['type'] === 'usage',
  );
  const sample = recordOf(data?.['usage'] ?? recordOf(recordOf(last)?.['chunk'])?.['usage']);
  const count = (key: string): number | undefined => {
    const value = sample?.[key];
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
      ? value
      : undefined;
  };
  const buckets: Partial<
    Record<
      | 'uncachedInputTokens'
      | 'outputTokens'
      | 'cacheReadTokens'
      | 'cacheWriteTokens'
      | 'totalTokens',
      number
    >
  > = {};
  for (const [key, source] of [
    ['uncachedInputTokens', 'inputTokens'],
    ['outputTokens', 'outputTokens'],
    ['cacheReadTokens', 'cacheReadTokens'],
    ['cacheWriteTokens', 'cacheWriteTokens'],
    ['totalTokens', 'totalTokens'],
  ] as const) {
    const value = count(source);
    if (value !== undefined) buckets[key] = value;
  }
  const known = [
    buckets.uncachedInputTokens,
    buckets.outputTokens,
    buckets.cacheReadTokens,
    buckets.cacheWriteTokens,
  ];
  const sum = known.reduce<number>((total, value) => total + (value ?? 0), 0);
  if (
    buckets.totalTokens !== undefined &&
    (buckets.totalTokens < sum ||
      (known.every((value) => value !== undefined) && buckets.totalTokens !== sum))
  )
    delete buckets.totalTokens;
  if (
    sample?.['totalTokens'] === undefined &&
    known.every((value) => value !== undefined) &&
    Number.isSafeInteger(sum)
  )
    buckets.totalTokens = sum;
  return buckets;
}

interface UsageRoute {
  provider: string;
  model: string;
}

function routeOf(value: unknown): UsageRoute | undefined {
  const record = recordOf(value);
  return typeof record?.['provider'] === 'string' &&
    record['provider'].length > 0 &&
    typeof record['model'] === 'string' &&
    record['model'].length > 0
    ? { provider: record['provider'], model: record['model'] }
    : undefined;
}

function requestRoute(event: DshSessionEvent): UsageRoute | undefined {
  if (event.type === 'request/context') return routeOf(event.data);
  if (event.type === 'request/header')
    return routeOf(recordOf(recordOf(event.data)?.['header'])?.['config']);
  return undefined;
}

export function createUsageProjection(options: {
  ownership: SessionOwnership;
  database: OperationalDatabaseOwner;
  now?: () => Date;
}): UsageProjection {
  const database: OperationalDatabaseModulePort = attachOperationalModule(
    options.database,
    'usage',
  );
  const { ownership } = options;
  const routes = new Map<string, Map<number, UsageRoute>>();
  let seen = new Set<string>();
  let rebuilding = false;
  const queuedEvents: Array<{ sessionId: string; event: DshSessionEvent; route?: UsageRoute }> = [];

  const upsert = (
    connection: DatabaseSync,
    botSlug: string,
    day: string,
    purpose: string,
    provider: string,
    model: string,
    usage: {
      uncachedInputTokens?: number;
      outputTokens?: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
      totalTokens?: number;
    },
  ): void => {
    connection
      .prepare(
        `INSERT INTO usage_daily
           (bot_slug, day, provider, model, purpose,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            unknown_input, unknown_output, unknown_cache_read, unknown_cache_write, total_tokens, unknown_total)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (bot_slug, day, provider, model, purpose) DO UPDATE SET
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
           cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens,
           unknown_input = unknown_input + excluded.unknown_input,
           unknown_output = unknown_output + excluded.unknown_output,
           unknown_cache_read = unknown_cache_read + excluded.unknown_cache_read,
           unknown_cache_write = unknown_cache_write + excluded.unknown_cache_write,
           total_tokens = total_tokens + excluded.total_tokens,
           unknown_total = unknown_total + excluded.unknown_total`,
      )
      .run(
        botSlug,
        day,
        provider,
        model,
        purpose,
        usage.uncachedInputTokens ?? 0,
        usage.outputTokens ?? 0,
        usage.cacheReadTokens ?? 0,
        usage.cacheWriteTokens ?? 0,
        usage.uncachedInputTokens === undefined ? 1 : 0,
        usage.outputTokens === undefined ? 1 : 0,
        usage.cacheReadTokens === undefined ? 1 : 0,
        usage.cacheWriteTokens === undefined ? 1 : 0,
        usage.totalTokens ?? 0,
        usage.totalTokens === undefined ? 1 : 0,
      );
  };

  const foldEvent = (
    sessionId: string,
    event: DshSessionEvent,
    route: UsageRoute | undefined,
    connection: DatabaseSync,
    processed: Set<string>,
  ): boolean => {
    if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return false;
    if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') return false;
    if (event.seq === undefined || !Number.isSafeInteger(event.seq) || event.seq < 0) return false;
    const key = JSON.stringify([sessionId, event.seq]);
    if (processed.has(key)) return false;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return false;
    const source = routeOf(recordOf(recordOf(event.data)?.['message'])?.['source']);
    const actual = source ?? route ?? { provider: 'unknown', model: 'unknown' };
    upsert(
      connection,
      owner.botSlug,
      usageLocalDay(event.time),
      purposeOf(owner),
      actual.provider,
      actual.model,
      reportedBuckets(event),
    );
    processed.add(key);
    return true;
  };

  const observe = (sessionId: string, event: DshSessionEvent): UsageRoute | undefined => {
    if (event.seq === undefined || !Number.isSafeInteger(event.seq) || event.seq < 0)
      return undefined;
    const route = requestRoute(event);
    let history = routes.get(sessionId);
    if (route !== undefined) {
      if (history === undefined) {
        history = new Map();
        routes.set(sessionId, history);
      }
      history.set(event.seq, route);
    }
    let latest = -1;
    let resolved: UsageRoute | undefined;
    for (const [seq, candidate] of history ?? []) {
      if (seq <= event.seq && seq > latest) {
        latest = seq;
        resolved = candidate;
      }
    }
    return resolved;
  };

  const writeLive = (
    sessionId: string,
    event: DshSessionEvent,
    route: UsageRoute | undefined,
  ): void => {
    if (seen.has(JSON.stringify([sessionId, event.seq]))) return;
    const processed = new Set<string>();
    database.transaction(
      (connection) => foldEvent(sessionId, event, route, connection, processed),
      ['usage'],
    );
    for (const key of processed) seen.add(key);
  };

  return {
    primeSession(sessionId, events) {
      for (const event of events) observe(sessionId, event);
    },
    handleSessionEvent(sessionId, event) {
      const route = observe(sessionId, event);
      if (event.type !== 'assistant/message' && event.type !== 'assistant/attempt') return;
      if (rebuilding) {
        queuedEvents.push({ sessionId, event, ...(route === undefined ? {} : { route }) });
        return;
      }
      writeLive(sessionId, event, route);
    },
    async rebuild(sessionIds, readLog) {
      if (rebuilding) throw new Error('Usage reconciliation already running');
      rebuilding = true;
      let folded = 0;
      let failed = 0;
      try {
        const logs = new Map<string, DshUsageSessionLog>();
        for (const sessionId of sessionIds) {
          if (ownership.resolve(sessionId) === undefined) continue;
          try {
            const log = await readLog(sessionId);
            if (log === undefined) failed += 1;
            else logs.set(sessionId, log);
          } catch {
            failed += 1;
          }
        }
        const processed = new Set<string>();
        database.transaction(
          (connection) => {
            connection.prepare('DELETE FROM usage_daily').run();
            for (const [sessionId, log] of logs) {
              let route: UsageRoute | undefined;
              for (let index = 0; index < log.events.length; index += 1) {
                const event = log.events[index]!;
                route = requestRoute(event) ?? route;
                if (index < log.inheritedEventCount) continue;
                if (foldEvent(sessionId, event, route, connection, processed)) folded += 1;
              }
            }
            for (const queued of queuedEvents)
              if (foldEvent(queued.sessionId, queued.event, queued.route, connection, processed))
                folded += 1;
          },
          ['usage'],
        );
        seen = processed;
      } finally {
        rebuilding = false;
        const pending = queuedEvents.splice(0);
        for (const queued of pending) writeLive(queued.sessionId, queued.event, queued.route);
      }
      return { folded, failed };
    },
    activity(botSlug, sinceIso) {
      const sinceDay = usageLocalDay(Date.parse(sinceIso));
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT day, purpose, provider, model, input_tokens, output_tokens,
                    cache_read_tokens, cache_write_tokens,
                    unknown_input, unknown_output, unknown_cache_read, unknown_cache_write, total_tokens, unknown_total
               FROM usage_daily
              WHERE bot_slug = ? AND day >= ?
              ORDER BY day`,
          )
          .all(botSlug, sinceDay),
      ) as unknown as UsageDailyDbRow[];
      return rows.map((row) => ({
        day: row.day,
        purpose: row.purpose,
        provider: row.provider,
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        cacheReadTokens: row.cache_read_tokens,
        cacheWriteTokens: row.cache_write_tokens,
        totalTokens: row.unknown_total > 0 ? null : row.total_tokens,
        ...([
          row.unknown_input,
          row.unknown_output,
          row.unknown_cache_read,
          row.unknown_cache_write,
        ].some((count) => count > 0)
          ? {
              unknownBuckets: {
                inputTokens: row.unknown_input,
                outputTokens: row.unknown_output,
                cacheReadTokens: row.unknown_cache_read,
                cacheWriteTokens: row.unknown_cache_write,
              },
            }
          : {}),
      }));
    },
  };
}
