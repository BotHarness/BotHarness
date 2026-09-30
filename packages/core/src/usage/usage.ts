import type { DatabaseSync } from 'node:sqlite';

import { deriveTurnTokenUsage } from '@deepseek-ai/dsh-token-meter/client';
import type { SessionEvent } from '@deepseek-ai/dsh-session/types';

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
  return owner.provenance === 'created' ? owner.rootRole : owner.provenance;
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
  return buckets;
}

function routeOf(routes: readonly { provider: string; model: string }[] | undefined): {
  provider: string;
  model: string;
} {
  if (routes === undefined || routes.length === 0) return { provider: 'unknown', model: 'unknown' };
  if (
    routes.some(
      (route) => route.provider !== routes[0]!.provider || route.model !== routes[0]!.model,
    )
  )
    return { provider: 'mixed', model: 'mixed' };
  return { provider: routes[0]!.provider, model: routes[0]!.model };
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

  const buffers = new Map<string, DshSessionEvent[]>();

  let rebuilding = false;
  const queuedTurns: Array<{ sessionId: string; events: DshSessionEvent[] }> = [];

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

  const record = (
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
    database.transaction(
      (connection) => {
        upsert(connection, botSlug, day, purpose, provider, model, usage);
      },
      ['usage'],
    );
  };

  const foldTurn = (
    sessionId: string,
    events: readonly DshSessionEvent[],
    connection?: DatabaseSync,
  ): boolean => {
    const usage = deriveTurnTokenUsage(events as unknown as readonly SessionEvent[]);
    const settlements = events.filter(
      (event) => event.type === 'assistant/message' || event.type === 'assistant/attempt',
    );
    if (usage === undefined && settlements.length === 0) return false;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return false;
    const end = events[events.length - 1];
    const day = usageLocalDay(end?.time ?? Date.now());
    const observedRoutes = settlements.flatMap((event) => {
      if (typeof event.data !== 'object' || event.data === null || !('message' in event.data))
        return [];
      const message = event.data.message;
      if (typeof message !== 'object' || message === null || !('source' in message)) return [];
      const source = message.source;
      if (
        typeof source !== 'object' ||
        source === null ||
        !('provider' in source) ||
        !('model' in source)
      )
        return [];
      if (typeof source.provider !== 'string' || typeof source.model !== 'string') return [];
      return [{ provider: source.provider, model: source.model }];
    });
    const route = routeOf(usage?.routes ?? observedRoutes);
    const reported = usage ?? (settlements.length === 1 ? reportedBuckets(settlements[0]!) : {});
    const purpose = purposeOf(owner);
    if (connection === undefined) {
      record(owner.botSlug, day, purpose, route.provider, route.model, reported);
    } else {
      upsert(connection, owner.botSlug, day, purpose, route.provider, route.model, reported);
    }
    return true;
  };

  const foldLog = (
    sessionId: string,
    events: readonly DshSessionEvent[],
    connection: DatabaseSync,
  ): number => {
    let folded = 0;
    let current: DshSessionEvent[] | undefined;
    for (const event of events) {
      if (event.type === 'turn/start') {
        current = [event];
        continue;
      }
      if (current === undefined) continue;
      current.push(event);
      if (event.type === 'turn/end') {
        if (foldTurn(sessionId, current, connection)) folded += 1;
        current = undefined;
      }
    }
    return folded;
  };

  return {
    handleSessionEvent(sessionId, event) {
      if (event.type === 'turn/start') {
        buffers.set(sessionId, [event]);
        return;
      }
      const buffer = buffers.get(sessionId);
      if (buffer === undefined) return;
      buffer.push(event);
      if (event.type !== 'turn/end') return;
      buffers.delete(sessionId);
      if (rebuilding) queuedTurns.push({ sessionId, events: buffer });
      else foldTurn(sessionId, buffer);
    },
    async rebuild(sessionIds, readLog) {
      rebuilding = true;
      queuedTurns.length = 0;
      let folded = 0;
      let failed = 0;
      const logs = new Map<string, DshUsageSessionLog>();
      for (const sessionId of sessionIds) {
        if (ownership.resolve(sessionId) === undefined) continue;
        try {
          const log = await readLog(sessionId);
          if (log === undefined) {
            failed += 1;
            continue;
          }
          logs.set(sessionId, log);
        } catch {
          failed += 1;
        }
      }
      const snapshotHasTurn = (
        log: DshUsageSessionLog | undefined,
        events: readonly DshSessionEvent[],
      ): boolean => {
        if (log === undefined) return false;
        const endTime = events.at(-1)?.time;
        return log.events.some((event) => event.type === 'turn/end' && event.time === endTime);
      };
      try {
        database.transaction(
          (connection) => {
            connection.prepare('DELETE FROM usage_daily').run();
            for (const [sessionId, log] of logs) {
              folded += foldLog(
                sessionId,
                log.inheritedEventCount > 0
                  ? log.events.slice(log.inheritedEventCount)
                  : log.events,
                connection,
              );
            }

            for (const turn of queuedTurns) {
              if (snapshotHasTurn(logs.get(turn.sessionId), turn.events)) continue;
              if (foldTurn(turn.sessionId, turn.events, connection)) folded += 1;
            }
          },
          ['usage'],
        );
      } finally {
        queuedTurns.length = 0;
        rebuilding = false;
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
