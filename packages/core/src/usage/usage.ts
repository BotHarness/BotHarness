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

/** One Host-local day of billed tokens, split by the route and purpose that produced it. */
export interface UsageDayRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface UsageRebuildReport {
  /** Turns whose usage was folded into the projection. */
  folded: number;
  /** Owned Sessions whose log could not be read; their buckets stay unknown. */
  failed: number;
}

/** One durable Session log cut: full events plus the fork-inherited prefix length. */
export interface DshUsageSessionLog {
  events: readonly DshSessionEvent[];
  inheritedEventCount: number;
}

export type DshUsageSessionLogReader = (
  sessionId: string,
) => Promise<DshUsageSessionLog | undefined>;

export interface UsageProjection {
  /** Live `session/event` sink; folds each completed turn exactly once. */
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;
  /**
   * Cold rebuild from durable logs; replaces the whole derived projection.
   * Ownership decides the candidate Sessions; the reader supplies their
   * durable Session Query logs with exact fork-inherited prefix lengths.
   */
  rebuild(
    sessionIds: readonly string[],
    readLog: DshUsageSessionLogReader,
  ): Promise<UsageRebuildReport>;
  /** Host-local daily buckets for one PersonaBot since an instant. */
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
}

/** Host-local calendar day of one epoch-ms instant, matching the Profile day boundary. */
export function usageLocalDay(timeMs: number): string {
  const date = new Date(timeMs);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function purposeOf(owner: { rootRole: string; provenance: string }): string {
  return owner.provenance === 'created' ? owner.rootRole : owner.provenance;
}

function routeOf(routes: readonly { provider: string; model: string }[] | undefined): {
  provider: string;
  model: string;
} {
  if (routes === undefined || routes.length === 0) return { provider: 'unknown', model: 'unknown' };
  if (routes.length > 1) return { provider: 'mixed', model: 'mixed' };
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
  /** Turn-local buffers, keyed by Session; only complete turns are folded. */
  const buffers = new Map<string, DshSessionEvent[]>();

  const upsert = (
    connection: DatabaseSync,
    botSlug: string,
    day: string,
    purpose: string,
    provider: string,
    model: string,
    usage: {
      uncachedInputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
    },
  ): void => {
    connection
      .prepare(
        `INSERT INTO usage_daily
           (bot_slug, day, provider, model, purpose,
            input_tokens, output_tokens, cache_read_tokens, cache_write_tokens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (bot_slug, day, provider, model, purpose) DO UPDATE SET
           input_tokens = input_tokens + excluded.input_tokens,
           output_tokens = output_tokens + excluded.output_tokens,
           cache_read_tokens = cache_read_tokens + excluded.cache_read_tokens,
           cache_write_tokens = cache_write_tokens + excluded.cache_write_tokens`,
      )
      .run(
        botSlug,
        day,
        provider,
        model,
        purpose,
        usage.uncachedInputTokens,
        usage.outputTokens,
        usage.cacheReadTokens ?? 0,
        usage.cacheWriteTokens ?? 0,
      );
  };

  const record = (
    botSlug: string,
    day: string,
    purpose: string,
    provider: string,
    model: string,
    usage: {
      uncachedInputTokens: number;
      outputTokens: number;
      cacheReadTokens?: number;
      cacheWriteTokens?: number;
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
    if (usage === undefined) return false;
    const owner = ownership.resolve(sessionId);
    if (owner === undefined) return false;
    const end = events[events.length - 1];
    const day = usageLocalDay(end?.time ?? Date.now());
    const route = routeOf(usage.routes);
    const purpose = purposeOf(owner);
    if (connection === undefined) {
      record(owner.botSlug, day, purpose, route.provider, route.model, usage);
    } else {
      upsert(connection, owner.botSlug, day, purpose, route.provider, route.model, usage);
    }
    return true;
  };

  /** Split a durable log into complete `turn/start` … `turn/end` windows. */
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
      foldTurn(sessionId, buffer);
    },
    async rebuild(sessionIds, readLog) {
      buffers.clear();
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
      database.transaction(
        (connection) => {
          connection.prepare('DELETE FROM usage_daily').run();
          for (const [sessionId, log] of logs) {
            folded += foldLog(
              sessionId,
              log.inheritedEventCount > 0 ? log.events.slice(log.inheritedEventCount) : log.events,
              connection,
            );
          }
        },
        ['usage'],
      );
      return { folded, failed };
    },
    activity(botSlug, sinceIso) {
      const sinceDay = usageLocalDay(Date.parse(sinceIso));
      const rows = database.read((connection) =>
        connection
          .prepare(
            `SELECT day, purpose, provider, model, input_tokens, output_tokens,
                    cache_read_tokens, cache_write_tokens
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
      }));
    },
  };
}
