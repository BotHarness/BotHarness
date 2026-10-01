import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { MessagingGrant } from './outbound.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from './provider.js';

export interface ExternalSource {
  id: string;
  body: string;
  at: string;
  platform: string;
  accountName: string;
  conversationName: string;
  event: Omit<MessagingInboundEvent, 'text'>;
  grantId: string;
  grantRevision: number;
}

export interface InboundMessaging {
  register(provider: MessagingProvider): () => void;
  setEnabled(botSlug: string, grantId: string, enabled: boolean): Promise<void>;
  status(grantId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  available(botSlug: string, sourceEventId: string): boolean;
  sourceSignal(botSlug: string, sourceEventId: string): AbortSignal;
  read(botSlug: string, sourceEventId: string): ExternalSource;
  revoke(grantId: string): void;
  close(): void;
}

export function createInboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  sourcePolicy: BotSourcePolicyStore;
  isBotActive(slug: string): boolean;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  warn?(message: string): void;
}): InboundMessaging {
  const { database } = options;
  const transaction = <T>(command: (db: DatabaseSync) => T, topics: string[] = []): T => {
    try {
      return database.transaction(command, topics);
    } catch (error) {
      if (error instanceof OperationalDatabaseError && error.cause instanceof MessagingError)
        throw error.cause;
      throw error;
    }
  };
  const providers = new Map<string, { provider: MessagingProvider; token: object }>();
  const leases = new Map<
    string,
    {
      token: object;
      revision: number;
      controller: AbortController;
      dispose: (() => void) | undefined;
    }
  >();
  const retries = new Map<string, { timer: ReturnType<typeof setTimeout>; token: object }>();
  let closed = false;
  const grant = (id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('grant-unavailable');
    return JSON.parse(row.body) as MessagingGrant;
  };
  const stop = (id: string) => {
    clearTimeout(retries.get(id)?.timer);
    retries.delete(id);
    const lease = leases.get(id);
    leases.delete(id);
    lease?.controller.abort();
    lease?.dispose?.();
  };
  const valid = (value: MessagingGrant): boolean => {
    const lease = leases.get(value.id);
    return (
      !closed &&
      options.isBotActive(value.botSlug) &&
      value.revokedAt === undefined &&
      value.suspendedReason === undefined &&
      value.receiveScope !== undefined &&
      lease !== undefined &&
      lease.dispose !== undefined &&
      !lease.controller.signal.aborted &&
      lease.revision === value.revision &&
      providers.get(value.providerId)?.token === lease.token
    );
  };
  const notifyPending = (value: MessagingGrant) => {
    if (!valid(value)) return;
    const rows = database.read((db) =>
      db
        .prepare(`
      SELECT e.source_event_id FROM source_events e JOIN inbox_admissions a USING(source_event_id)
      WHERE a.bot_slug = ? AND e.source_kind = 'bridge-message'
        AND a.attempt_state IN ('pending', 'retryable') AND e.observed_at IS NULL
        AND json_extract(e.payload_json, '$.external.grantId') = ?
        AND json_extract(e.payload_json, '$.external.grantRevision') = ?
      ORDER BY e.created_at LIMIT 20
    `)
        .all(value.botSlug, value.id, value.revision),
    ) as { source_event_id: string }[];
    for (const row of rows) options.onAdmitted(value.botSlug, row.source_event_id);
  };
  const start = async (value: MessagingGrant, attempt = 0) => {
    stop(value.id);
    const entry = providers.get(value.providerId);
    if (
      closed ||
      !entry?.provider.consume ||
      !entry.provider.reply ||
      !value.receiveScope ||
      value.revokedAt ||
      value.suspendedReason ||
      !options.isBotActive(value.botSlug)
    )
      return;
    const lease = {
      token: entry.token,
      revision: value.revision,
      controller: new AbortController(),
      dispose: undefined as (() => void) | undefined,
    };
    leases.set(value.id, lease);
    const startedAt = Date.now();
    try {
      const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
      if (
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        inspected.target.receiveScope?.conversationId !== value.receiveScope.conversationId
      )
        throw new MessagingError('rebind-required');
      const dispose = await entry.provider.consume({
        accountRef: value.accountRef,
        fingerprint: value.fingerprint,
        signal: lease.controller.signal,
        onEvent: async (event, signal) => {
          signal.throwIfAborted();
          lease.controller.signal.throwIfAborted();
          const latest = grant(value.id);
          if (
            closed ||
            leases.get(value.id) !== lease ||
            providers.get(value.providerId)?.token !== entry.token ||
            latest.revision !== value.revision ||
            latest.revokedAt ||
            latest.suspendedReason ||
            !options.isBotActive(value.botSlug)
          )
            throw new MessagingError('consumer-unavailable');
          if (event.fingerprint !== value.fingerprint || event.botId !== value.accountRef)
            throw new MessagingError('untrusted-source');
          if (
            event.conversation.kind !== 'group' ||
            event.conversation.id !== value.receiveScope!.conversationId ||
            !event.mentionedAccount
          )
            return { accepted: true };
          const id =
            'im-' +
            createHash('sha256')
              .update(
                JSON.stringify([
                  value.providerId,
                  value.fingerprint,
                  event.conversation.id,
                  event.messageId,
                ]),
              )
              .digest('hex');
          transaction(
            (db: DatabaseSync) => {
              signal.throwIfAborted();
              lease.controller.signal.throwIfAborted();
              const existing = db
                .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
                .get(id) as { body: string; payload_json: string } | undefined;
              if (existing) {
                const previous = (JSON.parse(existing.payload_json) as { external: ExternalSource })
                  .external;
                if (
                  existing.body !== event.text ||
                  previous.event.actor.id !== event.actor.id ||
                  JSON.stringify(previous.event.reply) !== JSON.stringify(event.reply) ||
                  JSON.stringify(previous.event.attachments ?? []) !==
                    JSON.stringify(event.attachments ?? [])
                )
                  throw new MessagingError('source-conflict');
                return;
              }
              const { text: _text, ...evidence } = event;
              const external: Omit<ExternalSource, 'body'> = {
                id,
                at: event.at,
                platform: event.channel,
                accountName: value.accountName,
                conversationName: value.targetName,
                event: evidence,
                grantId: value.id,
                grantRevision: value.revision,
              };
              const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'group-mention');
              db.prepare(`INSERT INTO source_events
              (source_event_id, source_kind, bot_slug, body, created_at, payload_json)
              VALUES (?, 'bridge-message', ?, ?, ?, ?)`).run(
                id,
                value.botSlug,
                event.text,
                event.at,
                JSON.stringify({ author: { kind: 'bridged' }, external }),
              );
              db.prepare(`INSERT INTO inbox_admissions
              (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
              VALUES (?, ?, 'group-mention', ?, ?)`).run(
                id,
                value.botSlug,
                policy.revision,
                policy.wake,
              );
            },
            ['source-event', 'bot-inbox'],
          );
          setImmediate(() => {
            if (closed) return;
            try {
              if (valid(grant(value.id))) options.onAdmitted(value.botSlug, id);
            } catch {
              stop(value.id);
            }
          });
          return { accepted: true };
        },
      });
      if (closed || leases.get(value.id) !== lease || lease.controller.signal.aborted) {
        dispose();
        return;
      }
      lease.dispose = dispose;
      notifyPending(grant(value.id));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: 'receiving',
          grantId: value.id,
          durationMs: Date.now() - startedAt,
        }),
      );
    } catch (error) {
      lease.controller.abort();
      if (leases.get(value.id) === lease) leases.delete(value.id);
      const reason = error instanceof MessagingError ? error.code : 'consumer-unavailable';
      const delays = [250, 1000, 3000];
      const delay = delays[attempt];
      if (
        reason === 'provider-unavailable' &&
        delay !== undefined &&
        !closed &&
        providers.get(value.providerId) === entry
      ) {
        const timer = setTimeout(() => {
          retries.delete(value.id);
          if (closed || providers.get(value.providerId) !== entry) return;
          try {
            const latest = grant(value.id);
            if (latest.revision === value.revision) void start(latest, attempt + 1);
          } catch {
            stop(value.id);
          }
        }, delay);
        timer.unref();
        retries.set(value.id, { timer, token: entry.token });
      }
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbound',
          phase: 'refused',
          grantId: value.id,
          reason,
          retryAttempt: attempt,
          durationMs: Date.now() - startedAt,
        }),
      );
    }
  };
  const read = (botSlug: string, id: string): ExternalSource => {
    const row = database.read((db) =>
      db
        .prepare(`SELECT e.payload_json, e.body FROM source_events e
      JOIN inbox_admissions a USING(source_event_id)
      WHERE e.source_event_id = ? AND a.bot_slug = ? AND e.source_kind = 'bridge-message'`)
        .get(id, botSlug),
    ) as { payload_json: string; body: string } | undefined;
    if (!row) throw new MessagingError('source-unavailable');
    return {
      ...(JSON.parse(row.payload_json) as { external: Omit<ExternalSource, 'body'> }).external,
      body: row.body,
    };
  };
  return {
    register(provider) {
      const token = {};
      providers.set(provider.id, { provider, token });
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE revoked_at IS NULL').all(),
      ) as { body: string }[];
      for (const row of rows) {
        const value = JSON.parse(row.body) as MessagingGrant;
        if (value.providerId === provider.id) void start(value);
      }
      return () => {
        if (providers.get(provider.id)?.token !== token) return;
        providers.delete(provider.id);
        for (const [id, lease] of leases) if (lease.token === token) stop(id);
        for (const [id, retry] of retries) if (retry.token === token) stop(id);
      };
    },
    async setEnabled(botSlug, id, enabled) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      let scope: MessagingGrant['receiveScope'];
      if (enabled) {
        const entry = providers.get(value.providerId);
        if (!entry?.provider.consume || !entry.provider.reply)
          throw new MessagingError('provider-incompatible');
        const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
        if (
          providers.get(value.providerId) !== entry ||
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.digest !== value.targetDigest
        )
          throw new MessagingError('rebind-required');
        scope = inspected.target.receiveScope;
        if (!scope) throw new MessagingError('group-required');
      }
      const updated = database.transaction(
        (db) => {
          const latest = grant(id);
          if (
            latest.revision !== value.revision ||
            latest.revokedAt ||
            latest.suspendedReason ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          const { receiveScope: _prior, ...rest } = latest;
          const next = {
            ...rest,
            revision: latest.revision + 1,
            ...(scope ? { receiveScope: scope } : {}),
          };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            id,
          );
          return next;
        },
        ['grants', 'bindings', 'bot-inbox'],
      );
      if (enabled) await start(updated);
      else stop(id);
    },
    status(id) {
      const value = grant(id);
      if (!value.receiveScope || value.revokedAt) return 'off';
      const lease = leases.get(id);
      if (valid(value)) return 'receiving';
      return lease && !lease.controller.signal.aborted ? 'connecting' : 'unavailable';
    },
    available(botSlug, id) {
      try {
        const source = read(botSlug, id);
        const value = grant(source.grantId);
        return (
          value.botSlug === botSlug &&
          valid(value) &&
          source.grantRevision === value.revision &&
          source.event.fingerprint === value.fingerprint &&
          source.event.conversation.id === value.receiveScope?.conversationId
        );
      } catch {
        return false;
      }
    },
    sourceSignal(botSlug, sourceEventId) {
      const source = read(botSlug, sourceEventId);
      const value = grant(source.grantId);
      if (!valid(value)) throw new MessagingError('source-unavailable');
      return leases.get(value.id)!.controller.signal;
    },
    read,
    revoke: stop,
    close() {
      closed = true;
      for (const id of new Set([...leases.keys(), ...retries.keys()])) stop(id);
      providers.clear();
    },
  };
}
