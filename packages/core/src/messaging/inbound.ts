import { bridgeChannel, placeBridgeSource } from './channel-target.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import type { BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { MessagingGrant } from './outbound.js';
import {
  MessagingError,
  type MessagingInboundEvent,
  type MessagingProvider,
  type MessagingHistoryScope,
} from './provider.js';

export interface ExternalContextRead {
  at: string;
  sessionId: string;
  scope: MessagingHistoryScope;
  outcome: 'read' | 'refused';
  sourceEventIds: string[];
  omitted: number;
  incomplete: boolean;
  reason?: string;
}
export interface ExternalContextResult {
  scope: MessagingHistoryScope;
  messages: {
    sourceEventId: string;
    messageId: string;
    senderId: string;
    senderName?: string;
    mentions?: MessagingInboundEvent['mentions'];
    at: string;
    text: string;
    threadId?: string;
  }[];
  omitted: number;
  incomplete: boolean;
  coverage: 'provider-visible-human-text';
  nextCursor?: string;
  window?: { start: number; end: number };
  requiredCharacters?: number;
}
export interface ExternalContextQuery {
  scope: MessagingHistoryScope;
  cursor?: string;
  maxCharacters?: number;
}
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
  localChannelId?: string;
  contextReads?: ExternalContextRead[];
  contextMessages?: ExternalContextResult['messages'];
}

export interface InboundMessaging {
  register(provider: MessagingProvider): () => void;
  setEnabled(botSlug: string, grantId: string, enabled: boolean): Promise<void>;
  setChannelTarget(botSlug: string, grantId: string, channelId: string | null): Promise<void>;
  status(grantId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  available(botSlug: string, sourceEventId: string): boolean;
  sourceSignal(botSlug: string, sourceEventId: string): AbortSignal;
  read(botSlug: string, sourceEventId: string): ExternalSource;
  context(
    botSlug: string,
    sourceEventId: string,
    sessionId: string,
    query: ExternalContextQuery,
    signal?: AbortSignal,
  ): Promise<ExternalContextResult>;
  revoke(grantId: string): void;
  close(): void;
}

export function createInboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  sourcePolicy: BotSourcePolicyStore;
  isBotActive(slug: string): boolean;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  onPlaced?(commit: ChannelMessageCommit): void;
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
  const cursors = new Map<
    string,
    {
      botSlug: string;
      sourceEventId: string;
      revision: number;
      scope: MessagingHistoryScope;
      providerCursor?: string | undefined;
      offset: number;
      digest: string;
      expiresAt: number;
    }
  >();
  const sourceId = (value: MessagingGrant, event: MessagingInboundEvent) =>
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
  const persistSource = (
    db: DatabaseSync,
    value: MessagingGrant,
    event: MessagingInboundEvent,
  ): string => {
    const id = sourceId(value, event);
    const existing = db
      .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
      .get(id) as { body: string; payload_json: string } | undefined;
    if (existing) {
      const previous = (JSON.parse(existing.payload_json) as { external: ExternalSource }).external;
      if (
        existing.body !== event.text ||
        previous.event.actor.id !== event.actor.id ||
        JSON.stringify(previous.event.reply) !== JSON.stringify(event.reply) ||
        JSON.stringify(previous.event.attachments ?? []) !== JSON.stringify(event.attachments ?? [])
      )
        throw new MessagingError('source-conflict');
      const mentions = previous.event.mentions.map((mention) => {
        const current = event.mentions.find(
          (item) => item.id === mention.id && item.key === mention.key,
        );
        return current?.name ? { ...mention, name: current.name } : mention;
      });
      if (
        event.actor.name ||
        mentions.some((item, index) => item.name !== previous.event.mentions[index]?.name)
      ) {
        const payload = JSON.parse(existing.payload_json) as { external: ExternalSource };
        payload.external.event.actor = {
          ...previous.event.actor,
          ...(event.actor.name ? { name: event.actor.name } : {}),
        };
        payload.external.event.mentions = mentions;
        db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
          JSON.stringify(payload),
          id,
        );
      }
    } else {
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
        ...(value.receiveTargetChannelId ? { localChannelId: value.receiveTargetChannelId } : {}),
      };
      db.prepare(`INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json)
        VALUES (?, 'bridge-message', ?, ?, ?, ?)`).run(
        id,
        value.botSlug,
        event.text,
        event.at,
        JSON.stringify({ author: { kind: 'bridged' }, external }),
      );
    }
    return id;
  };
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
  const targetAvailable = (value: MessagingGrant): boolean => {
    if (!value.receiveTargetChannelId) return true;
    try {
      database.read((db) => bridgeChannel(db, value.receiveTargetChannelId!, value.botSlug));
      return true;
    } catch (error) {
      if (error instanceof MessagingError) return false;
      throw error;
    }
  };
  const valid = (value: MessagingGrant): boolean => {
    const lease = leases.get(value.id);
    return (
      !closed &&
      targetAvailable(value) &&
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
          if (!targetAvailable(latest)) return { accepted: true };
          let placement: ChannelMessageCommit | undefined;
          const id = transaction(
            (db) => {
              signal.throwIfAborted();
              lease.controller.signal.throwIfAborted();
              if (value.receiveTargetChannelId)
                bridgeChannel(db, value.receiveTargetChannelId, value.botSlug);
              const id = persistSource(db, value, event);
              const row = db
                .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
                .get(id) as { payload_json: string };
              const source = (JSON.parse(row.payload_json) as { external: ExternalSource })
                .external;
              placement = placeBridgeSource(db, { ...source, body: event.text }, value.botSlug);
              const policy = options.sourcePolicy.resolveIn(db, value.botSlug, 'group-mention');
              db.prepare(`INSERT OR IGNORE INTO inbox_admissions
              (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode)
              VALUES (?, ?, 'group-mention', ?, ?)`).run(
                id,
                value.botSlug,
                policy.revision,
                policy.wake,
              );
              return id;
            },
            ['source-event', 'channel', 'bot-inbox'],
          );
          if (placement) {
            try {
              options.onPlaced?.(placement);
            } catch {
              options.warn?.('bridge-channel-publication-failed');
            }
          }
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
    const retained = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
    if (retained.localChannelId)
      database.read((db) => bridgeChannel(db, retained.localChannelId!, botSlug));
    const latest = retained.contextReads?.filter((item) => item.outcome === 'read').at(-1);
    const contextMessages: ExternalContextResult['messages'] = [];
    for (const sourceEventId of latest?.sourceEventIds ?? []) {
      const context = database.read((db) =>
        db
          .prepare('SELECT body, payload_json FROM source_events WHERE source_event_id = ?')
          .get(sourceEventId),
      ) as { body: string; payload_json: string } | undefined;
      if (!context) continue;
      const item = (JSON.parse(context.payload_json) as { external: ExternalSource }).external;
      contextMessages.push({
        sourceEventId,
        messageId: item.event.messageId,
        senderId: item.event.actor.id,
        ...(item.event.actor.name ? { senderName: item.event.actor.name } : {}),
        ...(item.event.mentions.length ? { mentions: item.event.mentions } : {}),
        at: item.at,
        text: context.body,
        ...(item.event.reply.threadId ? { threadId: item.event.reply.threadId } : {}),
      });
    }
    return {
      ...(contextMessages.length === 0 ? {} : { contextMessages }),
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
    async setChannelTarget(botSlug, id, channelId) {
      const updated = transaction(
        (db) => {
          const value = grant(id);
          if (
            value.botSlug !== botSlug ||
            value.revokedAt ||
            value.suspendedReason ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          if (channelId !== null) bridgeChannel(db, channelId, botSlug, true);
          const { receiveTargetChannelId: _old, ...rest } = value;
          const next: MessagingGrant = {
            ...rest,
            revision: value.revision + 1,
            ...(channelId === null ? {} : { receiveTargetChannelId: channelId }),
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
      stop(id);
      if (updated.receiveScope) await start(updated);
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
    async context(botSlug, sourceEventId, sessionId, query, callerSignal) {
      if (!['group', 'nearby', 'thread'].includes(query.scope))
        throw new MessagingError('invalid-history-query');
      const maxCharacters = query.maxCharacters ?? 12000;
      if (!Number.isInteger(maxCharacters) || maxCharacters < 1000 || maxCharacters > 24000)
        throw new MessagingError('invalid-history-budget');
      const source = read(botSlug, sourceEventId);
      const value = grant(source.grantId);
      const entry = providers.get(value.providerId);
      const lease = leases.get(value.id);
      if (
        !valid(value) ||
        !lease ||
        source.grantRevision !== value.revision ||
        source.event.fingerprint !== value.fingerprint ||
        source.event.conversation.id !== value.receiveScope?.conversationId
      )
        throw new MessagingError('source-unavailable');
      const assertCurrent = () => {
        if (
          !valid(grant(value.id)) ||
          grant(value.id).revision !== value.revision ||
          providers.get(value.providerId) !== entry
        )
          throw new MessagingError('source-unavailable');
      };
      const audit = (record: ExternalContextRead) =>
        database.transaction(
          (db) => {
            assertCurrent();
            const row = db
              .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
              .get(sourceEventId) as { payload_json: string };
            const payload = JSON.parse(row.payload_json) as { external: ExternalSource };
            payload.external.contextReads = [
              ...(payload.external.contextReads ?? []).slice(-19),
              record,
            ];
            db.prepare('UPDATE source_events SET payload_json = ? WHERE source_event_id = ?').run(
              JSON.stringify(payload),
              sourceEventId,
            );
          },
          ['source-event'],
        );
      const signal = AbortSignal.any([
        lease.controller.signal,
        AbortSignal.timeout(15000),
        ...(callerSignal ? [callerSignal] : []),
      ]);
      const at = new Date().toISOString();
      const cancellable = async <T>(request: Promise<T>): Promise<T> => {
        let abort!: () => void;
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new MessagingError('history-cancelled'));
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
        });
        try {
          return await Promise.race([request, interrupted]);
        } finally {
          signal.removeEventListener('abort', abort);
        }
      };
      try {
        signal.throwIfAborted();
        if (!entry?.provider.history) throw new MessagingError('history-capability-unavailable');
        if (query.scope === 'thread' && !source.event.reply.threadId)
          throw new MessagingError('thread-unavailable');
        for (const [key, cursor] of cursors) if (cursor.expiresAt < Date.now()) cursors.delete(key);
        const cursor = query.cursor === undefined ? undefined : cursors.get(query.cursor);
        if (
          query.cursor !== undefined &&
          (!cursor ||
            cursor.botSlug !== botSlug ||
            cursor.sourceEventId !== sourceEventId ||
            cursor.revision !== value.revision ||
            cursor.scope !== query.scope)
        )
          throw new MessagingError('history-cursor-unavailable');
        const inspected = await cancellable(
          entry.provider.inspect(value.accountRef, value.targetRef),
        );
        signal.throwIfAborted();
        assertCurrent();
        if (
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.digest !== value.targetDigest ||
          inspected.target.receiveScope?.conversationId !== value.receiveScope?.conversationId
        )
          throw new MessagingError('rebind-required');
        const request = entry.provider.history({
          accountRef: value.accountRef,
          fingerprint: value.fingerprint,
          route: source.event.reply,
          query: {
            scope: query.scope,
            limit: 20,
            ...(cursor?.providerCursor === undefined ? {} : { cursor: cursor.providerCursor }),
          },
          signal,
        });
        const page = await cancellable(request);
        signal.throwIfAborted();
        assertCurrent();
        if (
          page.hasMore &&
          cursor?.providerCursor !== undefined &&
          page.nextCursor === cursor.providerCursor
        )
          throw new MessagingError('untrusted-source');
        const digest = createHash('sha256').update(JSON.stringify(page)).digest('hex');
        if (cursor?.digest && cursor.digest !== digest)
          throw new MessagingError('history-cursor-stale');
        const result: ExternalContextResult = {
          scope: query.scope,
          messages: [],
          omitted: page.omitted,
          incomplete: page.hasMore || page.omitted > 0,
          coverage: page.coverage,
          ...(page.window ? { window: page.window } : {}),
        };
        let offset = cursor?.offset ?? 0;
        for (; offset < page.events.length; ++offset) {
          const event = page.events[offset]!;
          const message = {
            sourceEventId: sourceId(value, event),
            messageId: event.messageId,
            senderId: event.actor.id,
            ...(event.actor.name ? { senderName: event.actor.name } : {}),
            ...(event.mentions.length ? { mentions: event.mentions } : {}),
            at: event.at,
            text: event.text,
            ...(event.reply.threadId ? { threadId: event.reply.threadId } : {}),
          };
          const required =
            JSON.stringify({ ...result, messages: [...result.messages, message] }).length + 200;
          if (required > maxCharacters) {
            result.incomplete = true;
            if (result.messages.length === 0) result.requiredCharacters = required;
            break;
          }
          result.messages.push(message);
        }
        if (offset < page.events.length || page.hasMore) {
          const key = randomUUID();
          if (cursors.size >= 100) cursors.delete(cursors.keys().next().value!);
          cursors.set(key, {
            botSlug,
            sourceEventId,
            revision: value.revision,
            scope: query.scope,
            ...(offset < page.events.length
              ? { providerCursor: cursor?.providerCursor, offset, digest }
              : { providerCursor: page.nextCursor, offset: 0, digest: '' }),
            expiresAt: Date.now() + 300000,
          });
          result.nextCursor = key;
        }
        database.transaction(
          (db) => {
            signal.throwIfAborted();
            assertCurrent();
            for (const event of page.events.slice(cursor?.offset ?? 0, offset))
              persistSource(db, value, event);
          },
          ['source-event'],
        );
        audit({
          at,
          sessionId,
          scope: query.scope,
          outcome: 'read',
          sourceEventIds: result.messages.map((item) => item.sourceEventId),
          omitted: page.omitted,
          incomplete: result.incomplete,
        });
        if (query.cursor) cursors.delete(query.cursor);
        return result;
      } catch (error) {
        if (!signal.aborted) {
          try {
            audit({
              at,
              sessionId,
              scope: query.scope,
              outcome: 'refused',
              sourceEventIds: [],
              omitted: 0,
              incomplete: true,
              reason: error instanceof MessagingError ? error.code : 'history-unavailable',
            });
          } catch {}
        }
        throw error;
      }
    },
    revoke: stop,
    close() {
      closed = true;
      for (const id of new Set([...leases.keys(), ...retries.keys()])) stop(id);
      providers.clear();
    },
  };
}
