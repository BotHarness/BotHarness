import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { readMessagingIdentity, type MessagingIdentityView } from './identity.js';
import type { MessagingGrant } from './outbound.js';
import type { BlockedConversation, HeldConversation } from './conversations.js';
import { channelBridgeRoutes } from './channel-bridge.js';

export interface ReceptionInterval {
  id: string;
  providerId: string;
  fingerprint: string;
  scope: 'connection' | 'identity' | 'conversation' | 'channel';
  name: string;
  reason:
    | 'provider-unavailable'
    | 'rebind-required'
    | 'host-stopped'
    | 'continuity-unverified'
    | 'identity-paused'
    | 'identity-unbound'
    | 'bot-inactive'
    | 'blocked'
    | 'held'
    | 'channel-paused';
  boundary: 'observed' | 'local-command' | 'continuity-unverified';
  startedAt: string;
  endedAt?: string;
}
interface ReceptionRecord {
  hostId?: string;
  lastObservedAt?: string;
  available?: boolean;
  open: Record<string, ReceptionInterval>;
  recent: ReceptionInterval[];
}
type IdentityKey = Pick<MessagingIdentityView, 'botSlug' | 'providerId' | 'fingerprint' | 'name'>;
const EMPTY = (): ReceptionRecord => ({ open: {}, recent: [] });
const RECENT_LIMIT = 128;

function read(db: DatabaseSync, identity: IdentityKey): ReceptionRecord {
  const row = db
    .prepare(
      'SELECT body FROM messaging_reception_history WHERE bot_slug = ? AND provider_id = ? AND fingerprint = ?',
    )
    .get(identity.botSlug, identity.providerId, identity.fingerprint) as
    | { body: string }
    | undefined;
  return row ? (JSON.parse(row.body) as ReceptionRecord) : EMPTY();
}
function write(db: DatabaseSync, identity: IdentityKey, record: ReceptionRecord): void {
  record.recent = record.recent.slice(-RECENT_LIMIT);
  db.prepare(`INSERT INTO messaging_reception_history (bot_slug, provider_id, fingerprint, body)
    VALUES (?, ?, ?, ?) ON CONFLICT (bot_slug, provider_id, fingerprint)
    DO UPDATE SET body = excluded.body`).run(
    identity.botSlug,
    identity.providerId,
    identity.fingerprint,
    JSON.stringify(record),
  );
}
function transition(
  record: ReceptionRecord,
  identity: IdentityKey,
  key: string,
  at: string,
  next?: Pick<ReceptionInterval, 'scope' | 'name' | 'reason' | 'boundary'>,
): void {
  const previous = record.open[key];
  if (previous?.reason === next?.reason) return;
  if (previous) {
    record.recent.push({ ...previous, endedAt: at });
    delete record.open[key];
  }
  if (next)
    record.open[key] = {
      ...next,
      id: randomUUID(),
      providerId: identity.providerId,
      fingerprint: identity.fingerprint,
      startedAt: at,
    };
}

export function recordLocalReception(
  db: DatabaseSync,
  at: string,
  isBotActive: (botSlug: string) => boolean,
  boundary: ReceptionInterval['boundary'] = 'local-command',
): void {
  const identities = db
    .prepare(
      "SELECT id FROM messaging_bindings WHERE platform = 'qq' ORDER BY created_at DESC, rowid DESC",
    )
    .all() as { id: string }[];
  const seen = new Set<string>();
  for (const { id } of identities) {
    const identity = readMessagingIdentity(db, id);
    const identityKey = JSON.stringify([
      identity.botSlug,
      identity.providerId,
      identity.fingerprint,
    ]);
    if (seen.has(identityKey)) continue;
    seen.add(identityKey);
    const record = read(db, identity);
    const before = JSON.stringify(record);
    const desired = new Map<
      string,
      Pick<ReceptionInterval, 'scope' | 'name' | 'reason' | 'boundary'> & { at?: string }
    >();
    const reason = identity.revokedAt
      ? 'identity-unbound'
      : !isBotActive(identity.botSlug)
        ? 'bot-inactive'
        : !identity.enabled
          ? 'identity-paused'
          : undefined;
    if (reason)
      desired.set('local:identity', {
        scope: 'identity',
        name: identity.name,
        reason,
        boundary,
        ...(identity.revokedAt ? { at: identity.revokedAt } : {}),
      });
    const blocks = db
      .prepare(
        'SELECT body FROM messaging_conversation_blocks WHERE bot_slug = ? AND fingerprint = ?',
      )
      .all(identity.botSlug, identity.fingerprint) as { body: string }[];
    for (const { body } of blocks) {
      const block = JSON.parse(body) as BlockedConversation;
      desired.set(`local:conversation:${block.conversation.kind}:${block.conversation.id}`, {
        scope: 'conversation',
        name: block.name,
        reason: 'blocked',
        boundary: 'local-command',
        at: block.blockedAt,
      });
    }
    const held = db
      .prepare('SELECT body FROM messaging_held_conversations WHERE binding_id = ?')
      .all(id) as { body: string }[];
    for (const { body } of held) {
      const value = JSON.parse(body) as HeldConversation;
      desired.set(`local:conversation:${value.conversation.kind}:${value.conversation.id}`, {
        scope: 'conversation',
        name: value.name,
        reason: 'held',
        boundary: 'observed',
        at: value.firstSeenAt,
      });
    }
    const grants = db
      .prepare('SELECT body FROM messaging_grants WHERE binding_id = ? AND revoked_at IS NULL')
      .all(id) as { body: string }[];
    for (const { body } of grants) {
      const grant = JSON.parse(body) as MessagingGrant;
      for (const route of channelBridgeRoutes(grant))
        if (!route.enabled)
          desired.set(`local:route:${grant.id}:${route.id}`, {
            scope: route.channelId === null ? 'conversation' : 'channel',
            name: route.name,
            reason: 'channel-paused',
            boundary,
          });
    }
    for (const key of Object.keys(record.open))
      if (key.startsWith('local:') && !desired.has(key)) transition(record, identity, key, at);
    for (const [key, { at: startedAt, ...next }] of desired)
      transition(record, identity, key, startedAt ?? at, next);
    if (JSON.stringify(record) !== before) write(db, identity, record);
  }
}

function connectionState(identity: MessagingIdentityView): {
  available: boolean;
  reason: ReceptionInterval['reason'] | undefined;
} {
  const available = identity.availability === 'available' && identity.reception === 'receiving';
  const reason =
    identity.availability === 'paused' || available
      ? undefined
      : identity.availability === 'available' && identity.reception === 'off'
        ? 'bot-inactive'
        : identity.availability === 'rebind-required'
          ? 'rebind-required'
          : 'provider-unavailable';
  return { available, reason };
}

export function receptionObservationDue(
  db: DatabaseSync,
  identity: MessagingIdentityView,
  hostId: string,
  at: string,
): boolean {
  const record = read(db, identity);
  const { available, reason } = connectionState(identity);
  return !(
    record.hostId === hostId &&
    record.available === available &&
    record.open.connection?.reason === reason &&
    record.lastObservedAt &&
    Date.parse(at) - Date.parse(record.lastObservedAt) < 30000
  );
}

export function observeReception(
  db: DatabaseSync,
  identity: MessagingIdentityView,
  hostId: string,
  at: string,
): void {
  const record = read(db, identity);
  const { available, reason } = connectionState(identity);
  if (record.hostId && record.hostId !== hostId && record.available && record.lastObservedAt) {
    record.recent.push({
      id: randomUUID(),
      providerId: identity.providerId,
      fingerprint: identity.fingerprint,
      scope: 'connection',
      name: identity.name,
      reason: 'continuity-unverified',
      boundary: 'continuity-unverified',
      startedAt: record.lastObservedAt,
      endedAt: at,
    });
  }
  transition(
    record,
    identity,
    'connection',
    at,
    reason === undefined
      ? undefined
      : {
          scope: 'connection',
          name: identity.name,
          reason,
          boundary: 'observed',
        },
  );
  transition(record, identity, 'host', at);
  record.hostId = hostId;
  record.available = available;
  record.lastObservedAt = at;
  write(db, identity, record);
}

export function stopReceptionHistory(db: DatabaseSync, at: string): void {
  const rows = db
    .prepare("SELECT id FROM messaging_bindings WHERE platform = 'qq' AND revoked_at IS NULL")
    .all() as { id: string }[];
  for (const { id } of rows) {
    const identity = readMessagingIdentity(db, id);
    const record = read(db, identity);
    if (!record.available) continue;
    transition(record, identity, 'host', at, {
      scope: 'connection',
      name: identity.name,
      reason: 'host-stopped',
      boundary: 'local-command',
    });
    record.available = false;
    write(db, identity, record);
  }
}

export function receptionHistory(db: DatabaseSync, botSlug: string): ReceptionInterval[] {
  const rows = db
    .prepare('SELECT body FROM messaging_reception_history WHERE bot_slug = ?')
    .all(botSlug) as { body: string }[];
  return rows
    .flatMap(({ body }) => {
      const record = JSON.parse(body) as ReceptionRecord;
      return [...record.recent, ...Object.values(record.open)];
    })
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
