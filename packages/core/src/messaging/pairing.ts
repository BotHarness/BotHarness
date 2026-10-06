import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { OperationalDatabaseError } from '../database/owner.js';
import { assertMessagingIdentity, readMessagingIdentity } from './identity.js';
import { MessagingError, type MessagingInboundEvent } from './provider.js';

export const pairingCapabilities = ['approve', 'reject', 'answer', 'save-rules'] as const;
export type PairingCapability = (typeof pairingCapabilities)[number];
export const pairingReviewInput = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('approve'),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
      capabilities: z.array(z.enum(pairingCapabilities)).min(1).max(4),
    })
    .strict(),
  z
    .object({
      kind: z.enum(['reject', 'revoke']),
      id: z.string().uuid(),
      expectedRevision: z.number().int().positive(),
    })
    .strict(),
]);
export type PairingReviewInput = z.infer<typeof pairingReviewInput>;
export interface PairingRequest {
  id: string;
  reference: string;
  botSlug: string;
  bindingId: string;
  accountName: string;
  actorId: string;
  actorName?: string;
  conversationId: string;
  status: 'pending' | 'approved' | 'rejected' | 'revoked' | 'expired' | 'unavailable';
  capabilities: PairingCapability[];
  createdAt: string;
  expiresAt: string;
  reviewedAt?: string;
  revision: number;
  attempts: number;
  messageIds?: string[];
  reviewedBy?: 'authenticated-web';
}
export interface BotPairing {
  request(bindingId: string, event: MessagingInboundEvent): PairingRequest;
  list(botSlug: string): PairingRequest[];
  review(botSlug: string, input: PairingReviewInput): PairingRequest;
  assert(
    botSlug: string,
    bindingId: string,
    actorId: string,
    capability: PairingCapability,
  ): PairingRequest;
}
export const pairingDefaults = Object.freeze({
  expiryMs: 10 * 60 * 1000,
  maxAttempts: 5,
  maxPendingPerBot: 25,
  maxPending: 200,
  maxApprovedPerBot: 100,
});

export function createBotPairing(
  database: OperationalDatabaseModulePort,
  isBotActive: (slug: string) => boolean,
  now = () => new Date(),
): BotPairing {
  const transaction = <T>(
    operation: Parameters<OperationalDatabaseModulePort['transaction']>[0],
  ): T => {
    try {
      return database.transaction(operation, ['pairing']) as T;
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const read = (row: { body: string }): PairingRequest => JSON.parse(row.body) as PairingRequest;
  const current = (value: PairingRequest): PairingRequest => {
    if (value.status !== 'pending' && value.status !== 'approved') return value;
    if (value.status === 'pending' && Date.parse(value.expiresAt) <= now().getTime())
      return { ...value, status: 'expired' };
    try {
      const binding = database.read((db) => readMessagingIdentity(db, value.bindingId));
      if (binding.revokedAt || binding.botSlug !== value.botSlug)
        return { ...value, status: 'revoked' };
      if (!binding.enabled || !isBotActive(value.botSlug))
        return { ...value, status: 'unavailable' };
    } catch (error) {
      if (!(error instanceof MessagingError)) throw error;
      if (value.status === 'pending' || value.status === 'approved')
        return { ...value, status: 'revoked' };
    }
    return value;
  };
  return {
    request(bindingId, event) {
      return transaction<PairingRequest>((db) => {
        const binding = assertMessagingIdentity(db, bindingId);
        if (
          !isBotActive(binding.botSlug) ||
          binding.platform !== 'feishu' ||
          event.channel !== 'feishu' ||
          event.botId !== binding.accountRef ||
          event.fingerprint !== binding.fingerprint ||
          event.conversation.kind !== 'dm' ||
          event.reply.actorId !== event.actor.id ||
          event.reply.conversationId !== event.conversation.id ||
          event.reply.messageId !== event.messageId ||
          event.actor.kind !== 'user' ||
          !/^ou_[A-Za-z0-9]+$/.test(event.actor.id) ||
          !/^oc_[A-Za-z0-9]+$/.test(event.conversation.id) ||
          event.text.trim() !== '/pair' ||
          event.attachments?.length
        )
          throw new MessagingError('untrusted-pairing');
        const at = now().toISOString();
        const existing = db
          .prepare(
            "SELECT body FROM messaging_pairings WHERE binding_id = ? AND actor_id = ? AND status IN ('pending', 'approved')",
          )
          .get(bindingId, event.actor.id) as { body: string } | undefined;
        if (existing) {
          const value = read(existing);
          if (value.conversationId !== event.conversation.id)
            throw new MessagingError('pairing-conversation-changed');
          if (value.status === 'approved' || value.messageIds?.includes(event.messageId))
            return current(value);
          if (Date.parse(value.expiresAt) > now().getTime()) {
            if (value.conversationId !== event.conversation.id)
              throw new MessagingError('pairing-conversation-changed');
            if (value.attempts >= pairingDefaults.maxAttempts)
              throw new MessagingError('pairing-rate-limited');
            const next = {
              ...value,
              attempts: value.attempts + 1,
              messageIds: [...(value.messageIds ?? []), event.messageId],
            };
            db.prepare('UPDATE messaging_pairings SET body = ? WHERE id = ?').run(
              JSON.stringify(next),
              value.id,
            );
            return next;
          }
          db.prepare(
            "UPDATE messaging_pairings SET status = 'expired', body = json_set(body, '$.status', 'expired') WHERE id = ?",
          ).run(value.id);
        }
        db.prepare(
          "UPDATE messaging_pairings SET status = 'expired', body = json_set(body, '$.status', 'expired') WHERE status = 'pending' AND json_extract(body, '$.expiresAt') <= ?",
        ).run(at);
        const total = db
          .prepare("SELECT count(*) AS n FROM messaging_pairings WHERE status = 'pending'")
          .get() as { n: number };
        const local = db
          .prepare(
            "SELECT count(*) AS n FROM messaging_pairings WHERE status = 'pending' AND bot_slug = ?",
          )
          .get(binding.botSlug) as { n: number };
        if (total.n >= pairingDefaults.maxPending || local.n >= pairingDefaults.maxPendingPerBot)
          throw new MessagingError('pairing-capacity');
        const value: PairingRequest = {
          id: randomUUID(),
          reference: randomBytes(5).toString('hex').toUpperCase(),
          botSlug: binding.botSlug,
          bindingId,
          accountName: binding.name,
          actorId: event.actor.id,
          ...(event.actor.name ? { actorName: event.actor.name } : {}),
          conversationId: event.conversation.id,
          status: 'pending',
          capabilities: [],
          createdAt: at,
          expiresAt: new Date(now().getTime() + pairingDefaults.expiryMs).toISOString(),
          revision: 1,
          attempts: 1,
          messageIds: [event.messageId],
        };
        db.prepare(
          'INSERT INTO messaging_pairings (id, bot_slug, binding_id, actor_id, status, body) VALUES (?, ?, ?, ?, ?, ?)',
        ).run(
          value.id,
          value.botSlug,
          bindingId,
          value.actorId,
          value.status,
          JSON.stringify(value),
        );
        return value;
      });
    },
    list(botSlug) {
      return database
        .read((db) =>
          (
            db
              .prepare(
                "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND status IN ('pending', 'approved') UNION ALL SELECT body FROM (SELECT body FROM messaging_pairings WHERE bot_slug = ? AND status NOT IN ('pending', 'approved') ORDER BY rowid DESC LIMIT 20)",
              )
              .all(botSlug, botSlug) as { body: string }[]
          ).map(read),
        )
        .map(current);
    },
    review(botSlug, raw) {
      const input = pairingReviewInput.parse(raw);
      return transaction<PairingRequest>((db) => {
        const row = db
          .prepare('SELECT body FROM messaging_pairings WHERE id = ? AND bot_slug = ?')
          .get(input.id, botSlug) as { body: string } | undefined;
        if (!row) throw new MessagingError('pairing-unavailable');
        const stored = read(row);
        const value = current(stored);
        if (
          value.revision !== input.expectedRevision ||
          (input.kind === 'revoke' ? stored.status !== 'approved' : value.status !== 'pending')
        )
          throw new MessagingError('pairing-stale');
        if (input.kind === 'approve') {
          const approved = db
            .prepare(
              "SELECT count(*) AS n FROM messaging_pairings AS p JOIN messaging_bindings AS b ON b.id = p.binding_id WHERE p.bot_slug = ? AND p.status = 'approved' AND b.revoked_at IS NULL",
            )
            .get(botSlug) as { n: number };
          if (approved.n >= pairingDefaults.maxApprovedPerBot)
            throw new MessagingError('pairing-capacity');
        }
        const next: PairingRequest = {
          ...value,
          status:
            input.kind === 'approve'
              ? 'approved'
              : input.kind === 'revoke'
                ? 'revoked'
                : 'rejected',
          capabilities: input.kind === 'approve' ? [...new Set(input.capabilities)] : [],
          revision: value.revision + 1,
          reviewedAt: now().toISOString(),
          reviewedBy: 'authenticated-web',
        };
        db.prepare('UPDATE messaging_pairings SET status = ?, body = ? WHERE id = ?').run(
          next.status,
          JSON.stringify(next),
          next.id,
        );
        return next;
      });
    },
    assert(botSlug, bindingId, actorId, capability) {
      const row = database.read((db) =>
        db
          .prepare(
            "SELECT body FROM messaging_pairings WHERE bot_slug = ? AND binding_id = ? AND actor_id = ? AND status = 'approved'",
          )
          .get(botSlug, bindingId, actorId),
      ) as { body: string } | undefined;
      if (!row) throw new MessagingError('pairing-unauthorized');
      const value = current(read(row));
      if (value.status !== 'approved' || !value.capabilities.includes(capability))
        throw new MessagingError('pairing-unauthorized');
      return value;
    },
  };
}
