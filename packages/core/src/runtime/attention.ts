import type { ChannelStore } from '../channels/store.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type BotAttentionState = 'pending' | 'observed' | 'deferred' | 'needs-repair' | 'handled';

/** A Bot-owned Inbox fact projected from one canonical admission and Source Event. */
export interface BotAttentionItem {
  id: string;
  botSlug: string;
  reason: string;
  state: BotAttentionState;
  createdAt: string;
  observedAt?: string;
  handledAt?: string;
  sourceKind: string;
  sourceChannelId?: string;
  sourceChannelName?: string;
  sourceMessageId?: string;
  sourceAvailable: boolean;
  authorKind: 'human' | 'bot' | 'bridged' | 'system';
  authorBotSlug?: string;
  summary: string;
}

export interface BotAttentionPage {
  items: BotAttentionItem[];
  nextCursor?: string;
}

export interface BotAttentionQuery {
  list(input: {
    botSlug: string;
    limit?: number;
    cursor?: string;
    state?: BotAttentionState;
  }): BotAttentionPage;
}

interface AttentionRow {
  source_event_id: string;
  bot_slug: string;
  reason: string;
  attempt_state: string;
  observed_at: string | null;
  handled_at: string | null;
  source_kind: string;
  channel_id: string | null;
  message_id: string | null;
  placed_message_id: string | null;
  body: string;
  created_at: string;
  author_kind: string | null;
  author_slug: string | null;
  state: BotAttentionState;
}

/** No second Inbox store: every page is rebuilt from committed Messaging facts. */
export function createBotAttentionQuery(
  database: OperationalDatabaseModulePort,
  channels: ChannelStore,
): BotAttentionQuery {
  return {
    list(input) {
      const limit = input.limit ?? 30;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Bot attention limit must be 1–100');
      const cursor = input.cursor;
      const anchor =
        cursor === undefined
          ? undefined
          : database.read(
              (db) =>
                db
                  .prepare(`
          SELECT e.created_at, e.source_event_id FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          WHERE a.bot_slug = ? AND e.source_event_id = ?
        `)
                  .get(input.botSlug, cursor) as
                  | { created_at: string; source_event_id: string }
                  | undefined,
            );
      if (input.cursor !== undefined && anchor === undefined)
        throw new Error('Bot attention cursor is unavailable');
      const rows = database.read(
        (db) =>
          db
            .prepare(`
        WITH attention AS (
          SELECT a.source_event_id, a.bot_slug, a.reason, a.attempt_state,
                 a.observed_at, a.handled_at, e.source_kind, e.channel_id,
                 e.message_id, p.message_id AS placed_message_id, e.body,
                 e.created_at, json_extract(e.payload_json, '$.author.kind') AS author_kind,
                 json_extract(e.payload_json, '$.author.slug') AS author_slug,
                 CASE
                   WHEN a.attempt_state = 'needs-repair' THEN 'needs-repair'
                   WHEN a.attempt_state = 'handled' THEN 'handled'
                   WHEN a.attempt_state = 'retryable' OR
                        (a.reason = 'group-ordinary' AND a.attempt_state = 'pending')
                     THEN 'deferred'
                   WHEN a.observed_at IS NOT NULL THEN 'observed'
                   ELSE 'pending'
                 END AS state
          FROM inbox_admissions a
          JOIN source_events e ON e.source_event_id = a.source_event_id
          LEFT JOIN channel_placements p ON p.source_event_id = e.source_event_id
          WHERE a.bot_slug = ?
        )
        SELECT * FROM attention
        WHERE (? IS NULL OR state = ?)
          AND (? IS NULL OR created_at < ? OR
               (created_at = ? AND source_event_id < ?))
        ORDER BY created_at DESC, source_event_id DESC
        LIMIT ?
      `)
            .all(
              input.botSlug,
              input.state ?? null,
              input.state ?? null,
              anchor?.created_at ?? null,
              anchor?.created_at ?? null,
              anchor?.created_at ?? null,
              anchor?.source_event_id ?? null,
              limit + 1,
            ) as unknown as AttentionRow[],
      );
      const page = rows.slice(0, limit);
      const items = page.map((row): BotAttentionItem => {
        const channel = row.channel_id === null ? undefined : channels.get(row.channel_id);
        const authorKind =
          row.author_kind === 'human' || row.author_kind === 'bot' || row.author_kind === 'bridged'
            ? row.author_kind
            : 'system';
        return {
          id: row.source_event_id,
          botSlug: row.bot_slug,
          reason: row.reason,
          state: row.state,
          createdAt: row.created_at,
          ...(row.observed_at === null ? {} : { observedAt: row.observed_at }),
          ...(row.handled_at === null ? {} : { handledAt: row.handled_at }),
          sourceKind: row.source_kind,
          ...(row.channel_id === null ? {} : { sourceChannelId: row.channel_id }),
          ...(channel === undefined ? {} : { sourceChannelName: channel.name }),
          ...(row.placed_message_id === null ? {} : { sourceMessageId: row.placed_message_id }),
          sourceAvailable: channel !== undefined && row.placed_message_id !== null,
          authorKind,
          ...(authorKind === 'bot' && row.author_slug !== null
            ? { authorBotSlug: row.author_slug }
            : {}),
          summary: row.body.slice(0, 240),
        };
      });
      return {
        items,
        ...(rows.length > limit && page.length > 0
          ? { nextCursor: page[page.length - 1]!.source_event_id }
          : {}),
      };
    },
  };
}
