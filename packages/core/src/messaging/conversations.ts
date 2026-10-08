import type { DatabaseSync } from 'node:sqlite';
import type { MessagingInboundEvent } from './provider.js';

export const NEW_ENTRIES_PER_HOUR = 20;
export const ACTIVE_ENTRIES_PER_APP = 500;
export const HELD_ENTRIES_PER_APP = 200;
const HELD_COUNT_LIMIT = 9999;

export type ConversationKind = 'dm' | 'group';
export type HeldReason = 'ask' | 'hourly-limit' | 'active-limit';

export interface ConversationRef {
  kind: ConversationKind;
  id: string;
}

export interface HeldConversation {
  bindingId: string;
  conversation: ConversationRef;
  name: string;
  reason: HeldReason;
  firstSeenAt: string;
  lastSeenAt: string;
  count: number;
  revision: number;
}

export interface BlockedConversation {
  botSlug: string;
  fingerprint: string;
  bindingId?: string;
  conversation: ConversationRef;
  name: string;
  blockedAt: string;
  revision: number;
}

export type MessagingConversationInput =
  | { kind: 'mute'; grantId: string; expectedRevision: number; muted: boolean }
  | { kind: 'block'; grantId: string; expectedRevision: number }
  | {
      kind: 'block-held';
      bindingId: string;
      conversation: ConversationRef;
      expectedRevision: number;
    }
  | {
      kind: 'allow';
      bindingId: string;
      conversation: ConversationRef;
      from: 'held' | 'blocked';
      expectedRevision: number;
    };

export function conversationName(event: MessagingInboundEvent): string {
  return event.conversation.kind === 'dm'
    ? event.actor.name || event.actor.id
    : event.conversation.name || event.conversation.id;
}

export function readBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  conversation: ConversationRef,
): BlockedConversation | undefined {
  const row = db
    .prepare(
      `SELECT body FROM messaging_conversation_blocks
        WHERE bot_slug = ? AND fingerprint = ? AND conversation_kind = ? AND conversation_id = ?`,
    )
    .get(botSlug, fingerprint, conversation.kind, conversation.id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as BlockedConversation) : undefined;
}

export function writeBlock(
  db: DatabaseSync,
  value: Omit<BlockedConversation, 'revision' | 'bindingId'>,
): BlockedConversation {
  const revision =
    (readBlock(db, value.botSlug, value.fingerprint, value.conversation)?.revision ?? 0) + 1;
  const block: BlockedConversation = { ...value, revision };
  db.prepare(
    `INSERT INTO messaging_conversation_blocks
       (bot_slug, fingerprint, conversation_kind, conversation_id, revision, body)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (bot_slug, fingerprint, conversation_kind, conversation_id)
     DO UPDATE SET revision = excluded.revision, body = excluded.body`,
  ).run(
    value.botSlug,
    value.fingerprint,
    value.conversation.kind,
    value.conversation.id,
    revision,
    JSON.stringify(block),
  );
  return block;
}

export function removeBlock(
  db: DatabaseSync,
  botSlug: string,
  fingerprint: string,
  conversation: ConversationRef,
): void {
  db.prepare(
    `DELETE FROM messaging_conversation_blocks
      WHERE bot_slug = ? AND fingerprint = ? AND conversation_kind = ? AND conversation_id = ?`,
  ).run(botSlug, fingerprint, conversation.kind, conversation.id);
}

export function listBlocks(db: DatabaseSync, botSlug: string): BlockedConversation[] {
  return (
    db
      .prepare(
        "SELECT body FROM messaging_conversation_blocks WHERE bot_slug = ? ORDER BY json_extract(body, '$.blockedAt') DESC",
      )
      .all(botSlug) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as BlockedConversation);
}

export function readHeld(
  db: DatabaseSync,
  bindingId: string,
  conversation: ConversationRef,
): HeldConversation | undefined {
  const row = db
    .prepare(
      `SELECT body FROM messaging_held_conversations
        WHERE binding_id = ? AND conversation_kind = ? AND conversation_id = ?`,
    )
    .get(bindingId, conversation.kind, conversation.id) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as HeldConversation) : undefined;
}

export function removeHeld(
  db: DatabaseSync,
  bindingId: string,
  conversation: ConversationRef,
): void {
  db.prepare(
    `DELETE FROM messaging_held_conversations
      WHERE binding_id = ? AND conversation_kind = ? AND conversation_id = ?`,
  ).run(bindingId, conversation.kind, conversation.id);
}

export function hold(
  db: DatabaseSync,
  bindingId: string,
  event: MessagingInboundEvent,
  reason: HeldReason,
  at: string,
): HeldConversation {
  const conversation = { kind: event.conversation.kind, id: event.conversation.id };
  const previous = readHeld(db, bindingId, conversation);
  const value: HeldConversation = {
    bindingId,
    conversation,
    name: conversationName(event),
    reason,
    firstSeenAt: previous?.firstSeenAt ?? at,
    lastSeenAt: at,
    count: Math.min(HELD_COUNT_LIMIT, (previous?.count ?? 0) + 1),
    revision: previous?.revision ?? 1,
  };
  db.prepare(
    `INSERT INTO messaging_held_conversations
       (binding_id, conversation_kind, conversation_id, last_seen_at, body)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (binding_id, conversation_kind, conversation_id)
     DO UPDATE SET last_seen_at = excluded.last_seen_at, body = excluded.body`,
  ).run(bindingId, conversation.kind, conversation.id, at, JSON.stringify(value));
  db.prepare(
    `DELETE FROM messaging_held_conversations WHERE binding_id = ? AND rowid NOT IN (
       SELECT rowid FROM messaging_held_conversations WHERE binding_id = ?
        ORDER BY last_seen_at DESC LIMIT ?)`,
  ).run(bindingId, bindingId, HELD_ENTRIES_PER_APP);
  return value;
}

export function listHeld(db: DatabaseSync, bindingId: string): HeldConversation[] {
  return (
    db
      .prepare(
        'SELECT body FROM messaging_held_conversations WHERE binding_id = ? ORDER BY last_seen_at DESC',
      )
      .all(bindingId) as { body: string }[]
  ).map((row) => JSON.parse(row.body) as HeldConversation);
}

export function admissionBound(
  db: DatabaseSync,
  bindingId: string,
  now: Date,
): 'hourly-limit' | 'active-limit' | undefined {
  const implicit = `binding_id = ? AND json_extract(body, '$.origin') = 'implicit'`;
  const active = db
    .prepare(`SELECT count(*) AS n FROM messaging_grants WHERE ${implicit} AND revoked_at IS NULL`)
    .get(bindingId) as { n: number };
  if (active.n >= ACTIVE_ENTRIES_PER_APP) return 'active-limit';
  const recent = db
    .prepare(`SELECT count(*) AS n FROM messaging_grants WHERE ${implicit} AND created_at > ?`)
    .get(bindingId, new Date(now.getTime() - 3_600_000).toISOString()) as { n: number };
  return recent.n >= NEW_ENTRIES_PER_HOUR ? 'hourly-limit' : undefined;
}
