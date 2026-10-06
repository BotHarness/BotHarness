import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { ExternalSource, ExternalContextQuery, ExternalContextResult } from './inbound.js';
import type { MessagingGrant, OutboxIntent } from './outbound.js';
import { MessagingError } from './provider.js';

export interface QuoteResolution {
  kind: 'native' | 'retained' | 'unavailable';
  text?: string;
  sourceEventId?: string;
  intentId?: string;
  reason?: 'not-retained-or-inaccessible' | 'no-server-message-id' | 'authorization-unavailable';
}

function sameConversation(source: ExternalSource, value: MessagingGrant): boolean {
  return (
    source.platform === 'weixin' &&
    source.event.botId === value.accountRef &&
    source.event.fingerprint === value.fingerprint &&
    source.event.conversation.kind === 'dm' &&
    source.event.conversation.id === value.receiveScope?.conversationId
  );
}

export function resolveRetainedQuote(
  db: DatabaseSync,
  value: MessagingGrant,
  source: ExternalSource,
  read: (id: string) => ExternalSource | undefined,
  authorized: boolean,
): QuoteResolution {
  const quote = source.event.quote!;
  if (quote.text?.trim()) return { kind: 'native', text: quote.text };
  if (!authorized || !sameConversation(source, value))
    return { kind: 'unavailable', reason: 'authorization-unavailable' };
  if (!quote.serverMessageId) return { kind: 'unavailable', reason: 'no-server-message-id' };
  const rows = db
    .prepare(`SELECT source_event_id FROM source_events
    WHERE bot_slug = ? AND source_kind = 'bridge-message' AND json_extract(payload_json, '$.external.platform') = 'weixin'
    AND json_extract(payload_json, '$.external.event.botId') = ?
    AND json_extract(payload_json, '$.external.event.fingerprint') = ?
    AND json_extract(payload_json, '$.external.event.conversation.id') = ?
    AND json_extract(payload_json, '$.external.event.messageId') = ? LIMIT 2`)
    .all(
      value.botSlug,
      value.accountRef,
      value.fingerprint,
      value.receiveScope?.conversationId ?? '',
      quote.serverMessageId,
    ) as { source_event_id: string }[];
  for (const row of rows) {
    const item = read(row.source_event_id);
    if (item && sameConversation(item, value))
      return { kind: 'retained', text: item.body, sourceEventId: item.id };
  }
  const receipt = db
    .prepare(`SELECT body FROM messaging_outbox WHERE bot_slug = ?
    AND COALESCE(json_extract(body, '$.reply.providerId'), json_extract(body, '$.report.providerId')) = ?
    AND COALESCE(json_extract(body, '$.reply.accountRef'), json_extract(body, '$.report.accountRef')) = ?
    AND COALESCE(json_extract(body, '$.reply.fingerprint'), json_extract(body, '$.report.fingerprint')) = ?
    AND COALESCE(json_extract(body, '$.reply.conversationId'), json_extract(body, '$.report.conversationId')) = ?
    AND json_extract(body, '$.receipt.messageId') = ?
    AND json_extract(body, '$.receipt.identityKind') IS NULL
    AND json_extract(body, '$.state') = 'provider-accepted' LIMIT 1`)
    .get(
      value.botSlug,
      value.providerId,
      value.accountRef,
      value.fingerprint,
      value.receiveScope?.conversationId ?? '',
      quote.serverMessageId,
    ) as { body: string } | undefined;
  if (receipt) {
    const intent = JSON.parse(receipt.body) as OutboxIntent;
    return { kind: 'retained', text: intent.text, intentId: intent.id };
  }
  return { kind: 'unavailable', reason: 'not-retained-or-inaccessible' };
}

export interface RetainedCursor {
  botSlug: string;
  sourceEventId: string;
  grantId: string;
  revision: number;
  fingerprint: string;
  scope: string;
  counts: string;
  maxRowId: number;
  position?: { at: string; id: string };
  nearbyIds?: string[];
  expiresAt: number;
}

export function retainedContextPage(
  db: DatabaseSync,
  input: {
    botSlug: string;
    source: ExternalSource;
    value: MessagingGrant;
    query: ExternalContextQuery;
    maxCharacters: number;
    beforeCount: number;
    afterCount: number;
    cursors: Map<string, RetainedCursor>;
    read: (id: string) => ExternalSource | undefined;
  },
): ExternalContextResult {
  const { botSlug, source, value, query, maxCharacters, beforeCount, afterCount, cursors, read } =
    input;
  const counts = query.scope === 'retained-nearby' ? `${beforeCount}:${afterCount}` : '';
  for (const [id, cursor] of cursors) if (cursor.expiresAt < Date.now()) cursors.delete(id);
  const previous = query.cursor === undefined ? undefined : cursors.get(query.cursor);
  if (
    query.cursor !== undefined &&
    (!previous ||
      previous.botSlug !== botSlug ||
      previous.sourceEventId !== source.id ||
      previous.grantId !== value.id ||
      previous.revision !== value.revision ||
      previous.fingerprint !== value.fingerprint ||
      previous.scope !== query.scope ||
      previous.counts !== counts)
  )
    throw new MessagingError('history-cursor-unavailable');
  const state: RetainedCursor = previous ?? {
    botSlug,
    sourceEventId: source.id,
    grantId: value.id,
    revision: value.revision,
    fingerprint: value.fingerprint,
    scope: query.scope,
    counts,
    maxRowId: (
      db.prepare('SELECT COALESCE(MAX(rowid), 0) AS max FROM source_events').get() as {
        max: number;
      }
    ).max,
    expiresAt: Date.now() + 1800000,
  };
  const filter = `bot_slug = ? AND source_kind = 'bridge-message' AND rowid <= ?
    AND json_extract(payload_json, '$.external.platform') = 'weixin'
    AND json_extract(payload_json, '$.external.event.botId') = ?
    AND json_extract(payload_json, '$.external.event.fingerprint') = ?
    AND json_extract(payload_json, '$.external.event.conversation.id') = ?`;
  const args = [
    botSlug,
    state.maxRowId,
    value.accountRef,
    value.fingerprint,
    source.event.conversation.id,
  ];
  if (query.scope === 'retained-nearby' && !state.nearbyIds) {
    const side = (before: boolean, limit: number) =>
      db
        .prepare(`SELECT source_event_id FROM source_events WHERE ${filter}
      AND (created_at ${before ? '<' : '>'} ? OR (created_at = ? AND source_event_id ${before ? '<' : '>'} ?))
      ORDER BY created_at ${before ? 'DESC' : 'ASC'}, source_event_id ${before ? 'DESC' : 'ASC'} LIMIT ?`)
        .all(...args, source.at, source.at, source.id, limit) as { source_event_id: string }[];
    state.nearbyIds = [...side(true, beforeCount).reverse(), ...side(false, afterCount)].map(
      (row) => row.source_event_id,
    );
  }
  const rows =
    query.scope === 'retained-nearby'
      ? state.nearbyIds!.map((id) => ({ source_event_id: id }))
      : (db
          .prepare(`SELECT source_event_id FROM source_events WHERE ${filter}
      ${state.position ? 'AND (created_at < ? OR (created_at = ? AND source_event_id < ?))' : ''}
      ORDER BY created_at DESC, source_event_id DESC LIMIT 21`)
          .all(
            ...args,
            ...(state.position ? [state.position.at, state.position.at, state.position.id] : []),
          ) as { source_event_id: string }[]);
  const result: ExternalContextResult = {
    scope: query.scope,
    coverage: 'retained-local-sources',
    messages: [],
    omitted: 0,
    incomplete: false,
  };
  let consumed = 0;
  for (const row of rows) {
    if (result.messages.length === 20) break;
    const item = read(row.source_event_id);
    if (!item || !sameConversation(item, value)) {
      result.omitted++;
      consumed++;
      continue;
    }
    const message = {
      sourceEventId: item.id,
      messageId: item.event.messageId,
      senderId: item.event.actor.id,
      ...(item.event.actor.name ? { senderName: item.event.actor.name } : {}),
      at: item.at,
      text: item.body,
    };
    const required =
      JSON.stringify({ ...result, messages: [...result.messages, message] }).length + 200;
    if (required > maxCharacters) {
      if (!result.messages.length) result.requiredCharacters = required;
      break;
    }
    result.messages.push(message);
    consumed++;
    state.position = { at: item.at, id: item.id };
  }
  if (query.scope === 'retained-nearby') state.nearbyIds = state.nearbyIds!.slice(consumed);
  const hasMore = consumed < rows.length || (query.scope === 'retained' && rows.length === 21);
  result.incomplete = hasMore || result.omitted > 0;
  if (hasMore) {
    if (query.scope === 'retained' && consumed > 0) {
      const row = db
        .prepare('SELECT created_at FROM source_events WHERE source_event_id = ?')
        .get(rows[consumed - 1]!.source_event_id) as { created_at: string };
      state.position = { at: row.created_at, id: rows[consumed - 1]!.source_event_id };
    }
    const key = randomUUID();
    if (cursors.size >= 100) cursors.delete(cursors.keys().next().value!);
    cursors.set(key, state);
    result.nextCursor = key;
  }
  if (query.cursor) cursors.delete(query.cursor);
  return result;
}
