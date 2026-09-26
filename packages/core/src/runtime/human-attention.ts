import type { OperationalDatabaseModulePort } from '../database/owner.js';

export type HumanAttentionCategory = 'action' | 'info';
export type HumanAttentionSort = 'newest' | 'oldest';

export interface HumanAttentionItem {
  id: string;
  category: HumanAttentionCategory;
  kind:
    | 'group-join-request'
    | 'user-question'
    | 'tool-approval'
    | 'bot-dm-message'
    | 'assignment-waiting-human'
    | 'assignment-report';
  createdAt: string;
  channelId?: string;
  channelName?: string;
  botSlug: string;
  summary: string;
  requestId?: string;
  messageId?: string;
  assignmentSessionId?: string;
  sourceEventId?: string;
}

export interface HumanAttentionPage {
  items: HumanAttentionItem[];
  nextCursor?: string;
}

export interface HumanAttentionQuery {
  list(input: {
    category?: HumanAttentionCategory;
    sort?: HumanAttentionSort;
    botSlug?: string;
    channelId?: string;
    cursor?: string;
    limit?: number;
  }): HumanAttentionPage;
}

interface AttentionRow {
  id: string;
  category: HumanAttentionCategory;
  kind: HumanAttentionItem['kind'];
  created_at: string;
  channel_id: string | null;
  channel_name: string | null;
  bot_slug: string;
  summary: string;
  request_id: string | null;
  message_id: string | null;
  assignment_session_id: string | null;
  source_event_id: string | null;
}

interface Cursor {
  version: 1;
  filters: string;
  createdAt: string;
  id: string;
}

function decodeCursor(value: string, filters: string): Cursor {
  try {
    if (value.length > 1024) throw new Error('oversized');
    const parsed: unknown = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('version' in parsed) ||
      parsed.version !== 1 ||
      !('filters' in parsed) ||
      parsed.filters !== filters ||
      !('createdAt' in parsed) ||
      typeof parsed.createdAt !== 'string' ||
      !('id' in parsed) ||
      typeof parsed.id !== 'string'
    )
      throw new Error('invalid');
    return parsed as Cursor;
  } catch {
    throw new Error('Human attention cursor is invalid for these filters');
  }
}

/** Projects Human attention from canonical Channel requests, messages, and read positions. */
export function createHumanAttentionQuery(
  database: OperationalDatabaseModulePort,
  activeQuestionMessageIds: () => readonly string[] = () => [],
  activeToolApprovalMessageIds: () => readonly string[] = () => [],
): HumanAttentionQuery {
  return {
    list(input) {
      const limit = input.limit ?? 30;
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new Error('Human attention limit must be 1-100');
      const category = input.category ?? 'action';
      const sort = input.sort ?? 'newest';
      if (sort !== 'newest' && sort !== 'oldest') throw new Error('Invalid Human attention sort');
      const direction = sort === 'newest' ? 'DESC' : 'ASC';
      const cursorComparison = sort === 'newest' ? '<' : '>';
      const filters = JSON.stringify([
        category,
        input.botSlug ?? null,
        input.channelId ?? null,
        sort,
      ]);
      const cursor = input.cursor === undefined ? undefined : decodeCursor(input.cursor, filters);
      const rows = database.read(
        (db) =>
          db
            .prepare(`
        WITH attention AS (
          SELECT 'join:' || json_extract(j.value, '$.id') AS id,
                 'action' AS category, 'group-join-request' AS kind,
                 json_extract(j.value, '$.createdAt') AS created_at,
                 c.channel_id, json_extract(c.record_json, '$.name') AS channel_name,
                 json_extract(j.value, '$.requesterBotSlug') AS bot_slug,
                 '' AS summary, json_extract(j.value, '$.id') AS request_id,
                 NULL AS message_id, NULL AS assignment_session_id,
                 NULL AS source_event_id
            FROM channel_records c, json_each(c.record_json, '$.joinRequests') j
           WHERE json_extract(c.record_json, '$.type') = 'group'
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND json_extract(j.value, '$.status') = 'pending'
          UNION ALL
          SELECT 'question:' || e.source_event_id AS id,
                 'action' AS category, 'user-question' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') IS NOT NULL
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.userQuestionRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events resolution
                WHERE resolution.channel_id = e.channel_id
                  AND json_extract(resolution.payload_json,
                    '$.userQuestionResolution.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'approval:' || e.source_event_id AS id,
                 'action' AS category, 'tool-approval' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
           WHERE json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') IS NOT NULL
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.toolApprovalRequest') IS NOT NULL
             AND e.message_id IN (SELECT value FROM json_each(?))
             AND NOT EXISTS (
               SELECT 1 FROM source_events decision
                WHERE decision.channel_id = e.channel_id
                  AND json_extract(decision.payload_json,
                    '$.toolApprovalDecision.requestMessageId') = e.message_id
             )
          UNION ALL
          SELECT 'assignment:' || a.session_id AS id,
                 'action' AS category, 'assignment-waiting-human' AS kind,
                 a.latest_report_at AS created_at, NULL AS channel_id,
                 NULL AS channel_name, a.bot_slug,
                 a.latest_report_summary AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 a.open_ask_source_event_id AS source_event_id
            FROM assignments a
           WHERE a.latest_report_state = 'waiting-human'
             AND a.open_ask_source_event_id IS NOT NULL
             AND a.stop_state = 'running'
             AND a.latest_report_at IS NOT NULL
          UNION ALL
          SELECT 'report:' || e.source_event_id AS id,
                 'info' AS category, 'assignment-report' AS kind,
                 e.created_at, NULL AS channel_id, NULL AS channel_name,
                 e.bot_slug, e.body AS summary, NULL AS request_id,
                 NULL AS message_id, a.session_id AS assignment_session_id,
                 e.source_event_id
            FROM assignments a
            JOIN source_events e ON e.source_event_id = (
              SELECT latest.source_event_id FROM source_events latest
               WHERE latest.assignment_session_id = a.session_id
                 AND latest.source_kind = 'assignment-report'
               ORDER BY latest.rowid DESC LIMIT 1
            )
            LEFT JOIN human_attention_decisions d ON d.source_event_id = e.source_event_id
           WHERE a.latest_report_state = 'completed'
             AND d.source_event_id IS NULL
          UNION ALL
          SELECT 'message:' || e.source_event_id AS id,
                 'info' AS category, 'bot-dm-message' AS kind,
                 e.created_at, c.channel_id,
                 json_extract(c.record_json, '$.name') AS channel_name,
                 e.bot_slug, e.body, NULL AS request_id, e.message_id,
                 NULL AS assignment_session_id, e.source_event_id
            FROM source_events e
            JOIN channel_placements p ON p.source_event_id = e.source_event_id
            JOIN channel_records c ON c.channel_id = p.channel_id
            LEFT JOIN channel_read_positions r ON r.channel_id = p.channel_id
           WHERE json_extract(c.record_json, '$.type') = 'dm'
             AND json_extract(c.record_json, '$.botSlug') IS NOT NULL
             AND json_extract(c.record_json, '$.deletedAt') IS NULL
             AND e.source_kind = 'bot-message'
             AND json_extract(e.payload_json, '$.author.kind') = 'bot'
             AND json_extract(e.payload_json, '$.sessionFailure') IS NULL
             AND json_extract(e.payload_json, '$.toolApprovalRequest') IS NULL
             AND json_extract(e.payload_json, '$.toolApprovalDecision') IS NULL
             AND json_extract(e.payload_json, '$.userQuestionRequest') IS NULL
             AND json_extract(e.payload_json, '$.userQuestionResolution') IS NULL
             AND json_extract(e.payload_json, '$.grantRequest') IS NULL
             AND length(trim(e.body)) > 0
             AND p.revision > coalesce(r.revision, 0)
        )
        SELECT * FROM attention
         WHERE category = ?
           AND (? IS NULL OR bot_slug = ?)
           AND (? IS NULL OR channel_id = ?)
           AND (? IS NULL OR created_at ${cursorComparison} ? OR
                (created_at = ? AND id ${cursorComparison} ?))
         ORDER BY created_at ${direction}, id ${direction}
         LIMIT ?
      `)
            .all(
              JSON.stringify(activeQuestionMessageIds()),
              JSON.stringify(activeToolApprovalMessageIds()),
              category,
              input.botSlug ?? null,
              input.botSlug ?? null,
              input.channelId ?? null,
              input.channelId ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.createdAt ?? null,
              cursor?.id ?? null,
              limit + 1,
            ) as unknown as AttentionRow[],
      );
      const page = rows.slice(0, limit);
      const items = page.map((row): HumanAttentionItem => ({
        id: row.id,
        category: row.category,
        kind: row.kind,
        createdAt: row.created_at,
        ...(row.channel_id === null ? {} : { channelId: row.channel_id }),
        ...(row.channel_name === null ? {} : { channelName: row.channel_name }),
        botSlug: row.bot_slug,
        summary: row.summary,
        ...(row.request_id === null ? {} : { requestId: row.request_id }),
        ...(row.message_id === null ? {} : { messageId: row.message_id }),
        ...(row.assignment_session_id === null
          ? {}
          : { assignmentSessionId: row.assignment_session_id }),
        ...(row.source_event_id === null ? {} : { sourceEventId: row.source_event_id }),
      }));
      const last = page.at(-1);
      return {
        items,
        ...(rows.length > limit && last !== undefined
          ? {
              nextCursor: Buffer.from(
                JSON.stringify({
                  version: 1,
                  filters,
                  createdAt: last.created_at,
                  id: last.id,
                } satisfies Cursor),
              ).toString('base64url'),
            }
          : {}),
      };
    },
  };
}

/** Human decisions record only a disposition, never another copy of Inbox content. */
export interface HumanAttentionDecisions {
  ignoreAssignmentReport(sourceEventId: string): boolean;
}

export function createHumanAttentionDecisions(
  database: OperationalDatabaseModulePort,
  now: () => Date = () => new Date(),
): HumanAttentionDecisions {
  return {
    ignoreAssignmentReport(sourceEventId) {
      return database.transaction(
        (db) => {
          const latest = db
            .prepare(`
            SELECT e.source_event_id
              FROM source_events e
              JOIN assignments a ON a.session_id = e.assignment_session_id
             WHERE e.source_event_id = ?
               AND e.source_kind = 'assignment-report'
               AND a.latest_report_state = 'completed'
               AND e.source_event_id = (
                 SELECT newer.source_event_id FROM source_events newer
                  WHERE newer.assignment_session_id = a.session_id
                    AND newer.source_kind = 'assignment-report'
                  ORDER BY newer.rowid DESC LIMIT 1
               )
          `)
            .get(sourceEventId);
          if (latest === undefined) return false;
          db.prepare(`
            INSERT OR IGNORE INTO human_attention_decisions
              (source_event_id, decision, decided_at) VALUES (?, 'ignored', ?)
          `).run(sourceEventId, now().toISOString());
          return true;
        },
        ['human-attention'],
      );
    },
  };
}
