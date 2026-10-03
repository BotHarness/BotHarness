import {
  commitThreadReceptionPolicy,
  threadReceptionPolicy,
  type ThreadReceptionInput,
  type ThreadReceptionPolicy,
  type ThreadReceptionView,
} from './thread-policy.js';
import {
  commitGroupReceptionPolicy,
  groupReceptionPolicy,
  initializeGroupReceptionPolicy,
  type GroupReceptionInput,
  type GroupReceptionPolicy,
} from './group-policy.js';
import type { BotSourcePolicyEditor } from '../runtime/source-policy.js';
import { bridgeChannel, placeBridgeSource } from './channel-target.js';
import { admitBridgeMembers } from './member-admission.js';
import { messagingDefaults } from './defaults.js';
import { assertMessagingIdentity } from './identity.js';
import {
  channelBridgeConfiguration,
  channelBridgeInput,
  type ChannelBridgeInput,
} from './channel-bridge.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { createHash, randomUUID } from 'node:crypto';
import { relatedReport, recordReportEcho, type RelatedReport } from './report.js';
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
  defaultRevision?: number;
  receptionRevision?: number;
  bridgeRevision?: number;
  localChannelId?: string;
  report?: RelatedReport;
  contextReads?: ExternalContextRead[];
  contextMessages?: ExternalContextResult['messages'];
}

export interface InboxSourceShare {
  sourceEventId: string;
  channelId: string;
  messageId: string;
  revision: number;
  alreadyShared: boolean;
}

export interface InboundMessaging {
  register(provider: MessagingProvider): () => void;
  setEnabled(botSlug: string, grantId: string, enabled: boolean): Promise<void>;
  channelBridge(channelId: string, input: ChannelBridgeInput): Promise<void>;
  setChannelTarget(botSlug: string, grantId: string, channelId: string | null): Promise<void>;
  policy(botSlug: string, grantId: string): GroupReceptionPolicy;
  setPolicy(
    botSlug: string,
    grantId: string,
    input: GroupReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<GroupReceptionPolicy>;
  threads(botSlug: string, grantId: string): ThreadReceptionView[];
  setThread(
    botSlug: string,
    sourceEventId: string,
    input: ThreadReceptionInput,
    editor: BotSourcePolicyEditor,
  ): Promise<ThreadReceptionPolicy>;
  ordinaryDelivery(grantId: string): 'verified' | 'unverified';
  status(grantId: string): 'off' | 'connecting' | 'receiving' | 'unavailable';
  available(botSlug: string, sourceEventId: string): boolean;
  sourceSignal(botSlug: string, sourceEventId: string): AbortSignal;
  read(botSlug: string, sourceEventId: string): ExternalSource;
  share(botSlug: string, sourceEventId: string, channelId: string): InboxSourceShare;
  context(
    botSlug: string,
    sourceEventId: string,
    sessionId: string,
    query: ExternalContextQuery,
    signal?: AbortSignal,
  ): Promise<ExternalContextResult>;
  reconcileBinding(bindingId: string): Promise<void>;
  revoke(grantId: string): void;
  close(): void;
}

export function createInboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  bindingAvailable?(id: string): boolean;
  sourcePolicy: BotSourcePolicyStore;
  isBotActive(slug: string): boolean;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  onShared?(botSlugs: string[]): void;
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
  const bounded = async <T>(pending: Promise<T>): Promise<T> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        pending,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new MessagingError('provider-unavailable')), 15000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  };
  const providers = new Map<string, { provider: MessagingProvider; token: object }>();
  const leases = new Map<
    string,
    {
      token: object;
      ordinaryVerified?: boolean;
      ordinaryThreads: Map<string, string>;
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
        defaultRevision: messagingDefaults(db, value.platform).revision,
        receptionRevision: groupReceptionPolicy(db, value.id).revision,
        ...(value.channelBridge ? { bridgeRevision: value.channelBridge.revision } : {}),
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
      (options.bindingAvailable?.(value.bindingId) ?? true) &&
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
      options.bindingAvailable?.(value.bindingId) === false ||
      !entry?.provider.consume ||
      !entry.provider.reply ||
      !value.receiveScope ||
      value.revokedAt ||
      value.suspendedReason ||
      !options.isBotActive(value.botSlug)
    )
      return;
    const lease = {
      ordinaryVerified: false,
      ordinaryThreads: new Map<string, string>(),
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
      transaction((db) => initializeGroupReceptionPolicy(db, value.id));
      const dispose = await entry.provider.consume({
        accountRef: value.accountRef,
        fingerprint: value.fingerprint,
        signal: lease.controller.signal,
        onEcho: async (event, signal) => {
          signal.throwIfAborted();
          lease.controller.signal.throwIfAborted();
          if (
            !valid(value) ||
            leases.get(value.id) !== lease ||
            providers.get(value.providerId)?.token !== entry.token
          )
            throw new MessagingError('consumer-unavailable');
          transaction((db) => recordReportEcho(db, value, event), ['outbox']);
          return { accepted: true };
        },
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
            options.bindingAvailable?.(latest.bindingId) === false ||
            !options.isBotActive(value.botSlug)
          )
            throw new MessagingError('consumer-unavailable');
          if (event.fingerprint !== value.fingerprint || event.botId !== value.accountRef)
            throw new MessagingError('untrusted-source');
          if (
            event.conversation.kind !== 'group' ||
            event.conversation.id !== value.receiveScope!.conversationId
          )
            return { accepted: true };
          if (
            !targetAvailable(latest) ||
            latest.channelBridge?.enabled === false ||
            (latest.channelBridge?.intakeAfter !== undefined &&
              Date.parse(event.at) < Date.parse(latest.channelBridge.intakeAfter))
          )
            return { accepted: true };
          if (!event.mentionedAccount && !lease.ordinaryVerified) {
            lease.ordinaryVerified = true;
            options.warn?.(
              JSON.stringify({
                event: 'messaging-inbound',
                phase: 'ordinary-delivery-verified',
                grantId: value.id,
              }),
            );
          }
          if (
            !event.mentionedAccount &&
            event.reply.threadId &&
            event.reply.rootId &&
            event.reply.parentId &&
            event.reply.conversationId === event.conversation.id
          ) {
            lease.ordinaryThreads.set(event.reply.threadId, event.reply.rootId);
          }
          let placement: ChannelMessageCommit | undefined;
          const id = transaction(
            (db) => {
              signal.throwIfAborted();
              lease.controller.signal.throwIfAborted();
              if (value.receiveTargetChannelId)
                bridgeChannel(db, value.receiveTargetChannelId, value.botSlug);
              if (latest.receiveAfter && Date.parse(event.at) < Date.parse(latest.receiveAfter))
                return undefined;
              const reception = groupReceptionPolicy(db, value.id);
              const thread = event.reply.threadId
                ? threadReceptionPolicy(db, value.id, event.reply.threadId)
                : undefined;
              if (
                thread &&
                (thread.fingerprint !== value.fingerprint ||
                  thread.conversationId !== event.conversation.id ||
                  thread.rootId !== event.reply.rootId)
              )
                throw new MessagingError('thread-route-mismatch');
              if (
                !event.mentionedAccount &&
                (thread?.mode === 'exclude' ||
                  (thread?.mode !== 'follow' &&
                    (latest.channelBridge?.collectionInheritance === 'inherit'
                      ? messagingDefaults(db, value.platform).collection
                      : (latest.channelBridge?.collection ?? reception.collection)) !== 'all'))
              )
                return undefined;
              if (
                !event.mentionedAccount &&
                thread?.mode === 'follow' &&
                (!event.reply.rootId || !event.reply.parentId)
              )
                throw new MessagingError('thread-route-mismatch');
              const ordinary = thread?.mode === 'follow' && thread.wake ? thread.wake : reception;
              const id = persistSource(db, latest, event);
              const row = db
                .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
                .get(id) as { payload_json: string };
              const source = (JSON.parse(row.payload_json) as { external: ExternalSource })
                .external;
              placement = placeBridgeSource(db, { ...source, body: event.text }, value.botSlug);
              if (!event.mentionedAccount && source.localChannelId && placement) {
                const channel = bridgeChannel(db, source.localChannelId, value.botSlug);
                admitBridgeMembers(
                  db,
                  id,
                  channel,
                  options.sourcePolicy,
                  options.isBotActive,
                  thread?.mode === 'follow' && thread.wake
                    ? { botSlug: value.botSlug, wake: thread.wake, revision: thread.revision }
                    : undefined,
                );
              }
              if (!event.mentionedAccount && source.localChannelId) return id;
              const reason = event.mentionedAccount ? 'group-mention' : 'group-ordinary';
              const policy = options.sourcePolicy.resolveIn(db, value.botSlug, reason);
              const wake = event.mentionedAccount
                ? policy.wake
                : thread?.wake || reception.inheritance === 'custom' || !policy.overrideActive
                  ? ordinary.wake
                  : policy.wake;
              const count =
                reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                  ? (policy.digestCount ?? ordinary.count)
                  : ordinary.count;
              const seconds =
                reception.inheritance !== 'custom' && !thread?.wake && policy.overrideActive
                  ? (policy.digestIntervalSeconds ?? ordinary.intervalSeconds)
                  : ordinary.intervalSeconds;
              db.prepare(`INSERT OR IGNORE INTO inbox_admissions
              (source_event_id, bot_slug, reason, source_policy_revision, source_policy_wake_mode,
               wake_policy_revision, wake_mode, wake_count, wake_interval_ms, external_thread_policy_revision, external_default_revision)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
                id,
                value.botSlug,
                reason,
                policy.revision,
                wake,
                reception.revision,
                wake === 'immediate' ? 'all' : wake,
                !event.mentionedAccount && (wake === 'immediate' || wake === 'digest')
                  ? wake === 'immediate'
                    ? 1
                    : count
                  : null,
                !event.mentionedAccount && (wake === 'immediate' || wake === 'digest')
                  ? wake === 'immediate'
                    ? 0
                    : seconds * 1000
                  : null,
                thread?.revision ?? null,
                reception.defaultRevision ?? null,
              );
              return id;
            },
            ['source-event', 'channel', 'bot-inbox'],
          );
          if (id === undefined) return { accepted: true };
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
      WHERE e.source_event_id = ? AND a.bot_slug = ? AND e.bot_slug = ? AND e.source_kind = 'bridge-message'`)
        .get(id, botSlug, botSlug),
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
    const report = database.read((db) =>
      relatedReport(db, grant(retained.grantId), retained.event.reply),
    );
    return {
      ...(report ? { report } : {}),
      ...(contextMessages.length === 0 ? {} : { contextMessages }),
      ...(JSON.parse(row.payload_json) as { external: Omit<ExternalSource, 'body'> }).external,
      body: row.body,
    };
  };
  const service: InboundMessaging = {
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
    async channelBridge(channelId, rawInput) {
      const input = channelBridgeInput.parse(rawInput);
      const value = grant(input.grantId);
      const configuration = channelBridgeConfiguration(value);
      database.read((db) => bridgeChannel(db, channelId, value.botSlug, true));
      if (
        value.revision !== input.expectedGrantRevision ||
        (input.kind !== 'add' && configuration.revision !== input.expectedRevision)
      )
        throw new MessagingError('bridge-stale');
      if (
        input.kind === 'add'
          ? !!value.receiveTargetChannelId || !!value.channelBridge
          : value.receiveTargetChannelId !== channelId
      )
        throw new MessagingError('bridge-unavailable');
      let inspected: Awaited<ReturnType<MessagingProvider['inspect']>> | undefined;
      let entry: { provider: MessagingProvider; token: object } | undefined;
      if (input.kind === 'add' || (input.kind === 'update' && input.enabled)) {
        if (value.revokedAt || value.suspendedReason || !options.isBotActive(value.botSlug))
          throw new MessagingError('grant-unavailable');
        database.read((db) => assertMessagingIdentity(db, value.bindingId));
        entry = providers.get(value.providerId);
        if (!entry?.provider.consume || !entry.provider.reply)
          throw new MessagingError('provider-incompatible');
        inspected = await bounded(entry.provider.inspect(value.accountRef, value.targetRef));
        if (
          providers.get(value.providerId) !== entry ||
          !inspected.account.connected ||
          inspected.account.ref !== value.accountRef ||
          inspected.account.platform !== 'feishu' ||
          inspected.account.fingerprint !== value.fingerprint ||
          inspected.target.ref !== value.targetRef ||
          inspected.target.digest !== value.targetDigest ||
          !inspected.target.receiveScope
        )
          throw new MessagingError('rebind-required');
        if (
          input.collectionInheritance !== 'inherit' &&
          input.collection === 'all' &&
          !leases.get(value.id)?.ordinaryVerified
        )
          throw new MessagingError('ordinary-delivery-unverified');
      }
      const updated = transaction(
        (db) => {
          const latest = grant(value.id);
          if (
            input.kind !== 'delete' &&
            input.expectedDefaultRevision !== undefined &&
            input.expectedDefaultRevision !== messagingDefaults(db, latest.platform).revision
          )
            throw new MessagingError('defaults-stale');
          bridgeChannel(db, channelId, latest.botSlug, true);
          if (
            latest.revision !== input.expectedGrantRevision ||
            (input.kind !== 'add' &&
              channelBridgeConfiguration(latest).revision !== input.expectedRevision) ||
            (input.kind === 'add'
              ? !!latest.receiveTargetChannelId || !!latest.channelBridge
              : latest.receiveTargetChannelId !== channelId)
          )
            throw new MessagingError('bridge-stale');
          if (entry) {
            assertMessagingIdentity(db, latest.bindingId);
            if (
              providers.get(latest.providerId) !== entry ||
              latest.revokedAt ||
              latest.suspendedReason ||
              !options.isBotActive(latest.botSlug)
            )
              throw new MessagingError('grant-unavailable');
          }
          const {
            receiveScope: _scope,
            receiveTargetChannelId: _channel,
            channelBridge: _bridge,
            ...rest
          } = latest;
          const next: MessagingGrant =
            input.kind === 'delete'
              ? { ...rest, revision: latest.revision + 1 }
              : {
                  ...latest,
                  receiveTargetChannelId: channelId,
                  ...(inspected ? { receiveScope: inspected.target.receiveScope } : {}),
                  revision: input.kind === 'add' ? latest.revision + 1 : latest.revision,
                  channelBridge: {
                    name: input.name,
                    enabled: input.enabled,
                    collection: input.collection,
                    collectionInheritance: input.collectionInheritance ?? 'custom',
                    revision: input.kind === 'add' ? 1 : configuration.revision + 1,
                    ...(input.kind === 'add' ||
                    (input.enabled && (!configuration.enabled || !configuration.intakeAfter))
                      ? { intakeAfter: new Date().toISOString() }
                      : configuration.intakeAfter
                        ? { intakeAfter: configuration.intakeAfter }
                        : {}),
                  },
                };
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify(next),
            next.revision,
            value.id,
          );
          return next;
        },
        ['grants', 'channel', 'bot-inbox'],
      );
      if (input.kind === 'delete') stop(value.id);
      else if (input.kind === 'add' || !valid(updated)) await bounded(start(updated));
      options.warn?.(
        JSON.stringify({
          event: 'messaging-channel-bridge',
          phase: 'committed',
          initiator: 'human-profile',
          channelId,
          grantId: value.id,
          operation: input.kind,
          revision: updated.channelBridge?.revision,
        }),
      );
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
            options.bindingAvailable?.(latest.bindingId) === false ||
            !options.isBotActive(botSlug)
          )
            throw new MessagingError('grant-unavailable');
          const { receiveScope: _prior, ...rest } = latest;
          const next = {
            ...rest,
            revision: latest.revision + 1,
            ...(scope ? { receiveScope: scope } : {}),
            ...(latest.channelBridge
              ? {
                  channelBridge: {
                    ...latest.channelBridge,
                    enabled,
                    revision: latest.channelBridge.revision + 1,
                  },
                }
              : {}),
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
          const { receiveTargetChannelId: _old, channelBridge: _bridge, ...rest } = value;
          const next: MessagingGrant = {
            ...rest,
            revision: value.revision + 1,
            ...(channelId === null
              ? {}
              : {
                  receiveTargetChannelId: channelId,
                  channelBridge: {
                    name: value.targetName,
                    enabled: !!value.receiveScope,
                    collection: groupReceptionPolicy(db, id).collection,
                    revision: 1,
                  },
                }),
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
    policy(botSlug, id) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      return database.read((db) => groupReceptionPolicy(db, id));
    },
    async setPolicy(botSlug, id, input, editor) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        !valid(value) ||
        (editor.kind === 'bot' && editor.botSlug !== botSlug)
      )
        throw new MessagingError('grant-unavailable');
      const entry = providers.get(value.providerId)!;
      const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
      if (
        providers.get(value.providerId) !== entry ||
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        inspected.target.receiveScope?.conversationId !== value.receiveScope?.conversationId
      )
        throw new MessagingError('rebind-required');
      if (
        input.inheritance !== 'inherit' &&
        input.collection === 'all' &&
        !leases.get(id)?.ordinaryVerified
      )
        throw new MessagingError('ordinary-delivery-unverified');
      const policy = transaction(
        (db) => {
          if (!valid(grant(id)) || grant(id).revision !== value.revision)
            throw new MessagingError('grant-unavailable');
          const policy = commitGroupReceptionPolicy(db, id, input, editor);
          const latest = grant(id);
          if (
            latest.channelBridge &&
            (latest.channelBridge.collection !== input.collection ||
              (latest.channelBridge.collectionInheritance ?? 'custom') !==
                (input.inheritance ?? 'custom'))
          ) {
            db.prepare('UPDATE messaging_grants SET body = ? WHERE id = ?').run(
              JSON.stringify({
                ...latest,
                channelBridge: {
                  ...latest.channelBridge,
                  collection: input.collection,
                  collectionInheritance: input.inheritance ?? 'custom',
                  revision: latest.channelBridge.revision + 1,
                },
              }),
              id,
            );
          }
          return policy;
        },
        ['grants', 'bot-inbox'],
      );
      options.warn?.(
        JSON.stringify({
          event: 'messaging-group-policy',
          phase: 'committed',
          grantId: id,
          revision: policy.revision,
          editor: editor.kind,
        }),
      );
      return policy;
    },
    threads(botSlug, id) {
      const value = grant(id);
      if (
        value.botSlug !== botSlug ||
        value.revokedAt ||
        value.suspendedReason ||
        !options.isBotActive(botSlug)
      )
        throw new MessagingError('grant-unavailable');
      if (value.platform !== 'feishu') return [];
      return database.read((db) => {
        const rows = db
          .prepare(`WITH candidates AS (
          SELECT s.source_event_id, s.payload_json, s.body, s.created_at,
            row_number() OVER (PARTITION BY json_extract(s.payload_json, '$.external.event.reply.threadId') ORDER BY s.created_at DESC, s.source_event_id DESC) AS rank
          FROM source_events s JOIN inbox_admissions a ON a.source_event_id = s.source_event_id
          WHERE a.bot_slug = ? AND s.source_kind = 'bridge-message'
            AND json_extract(s.payload_json, '$.external.grantId') = ?
            AND json_extract(s.payload_json, '$.external.grantRevision') = ?
            AND json_extract(s.payload_json, '$.external.event.reply.threadId') IS NOT NULL
        ) SELECT source_event_id, payload_json, body FROM candidates WHERE rank = 1 ORDER BY created_at DESC LIMIT 50`)
          .all(botSlug, id, value.revision) as {
          source_event_id: string;
          payload_json: string;
          body: string;
        }[];
        const seen = new Set<string>();
        return rows
          .flatMap((row) => {
            const source = (JSON.parse(row.payload_json) as { external: ExternalSource }).external;
            const route = source.event.reply;
            if (
              source.grantId !== id ||
              source.grantRevision !== value.revision ||
              !route.threadId ||
              !route.rootId ||
              !route.parentId ||
              seen.has(route.threadId)
            )
              return [];
            seen.add(route.threadId);
            const policy = threadReceptionPolicy(db, id, route.threadId) ?? {
              threadId: route.threadId,
              conversationId: route.conversationId,
              rootId: route.rootId,
              anchorSourceEventId: row.source_event_id,
              fingerprint: value.fingerprint,
              mode: 'inherit' as const,
              wake: null,
              revision: 0,
              changedAt: '',
              editor: { kind: 'built-in' as const },
            };
            return [
              {
                ...policy,
                preview: source.event.mentions
                  .reduce(
                    (text, mention) =>
                      text.replaceAll(mention.key, '@' + (mention.name ?? mention.id)),
                    row.body,
                  )
                  .slice(0, 120),
                anchorSourceEventId: row.source_event_id,
                ordinaryDelivery:
                  valid(value) &&
                  leases.get(id)?.ordinaryThreads.get(route.threadId) === route.rootId
                    ? ('verified' as const)
                    : ('unverified' as const),
              },
            ];
          })
          .slice(0, 50);
      });
    },
    async setThread(botSlug, sourceEventId, input, editor) {
      const source = read(botSlug, sourceEventId);
      const value = grant(source.grantId);
      if (
        value.botSlug !== botSlug ||
        !valid(value) ||
        source.grantRevision !== value.revision ||
        (editor.kind === 'bot' && editor.botSlug !== botSlug)
      )
        throw new MessagingError('grant-unavailable');
      const route = source.event.reply;
      if (
        value.platform !== 'feishu' ||
        !route.threadId ||
        !route.rootId ||
        !route.parentId ||
        route.conversationId !== value.receiveScope?.conversationId ||
        source.event.fingerprint !== value.fingerprint
      )
        throw new MessagingError('thread-unavailable');
      const entry = providers.get(value.providerId)!;
      const lease = leases.get(value.id)!;
      const inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
      if (
        providers.get(value.providerId) !== entry ||
        inspected.account.fingerprint !== value.fingerprint ||
        inspected.target.digest !== value.targetDigest ||
        inspected.target.receiveScope?.conversationId !== route.conversationId
      )
        throw new MessagingError('rebind-required');
      if (input.mode === 'follow' && lease.ordinaryThreads.get(route.threadId) !== route.rootId)
        throw new MessagingError('thread-delivery-unverified');
      const policy = transaction(
        (db) => {
          if (
            !valid(grant(value.id)) ||
            grant(value.id).revision !== value.revision ||
            leases.get(value.id) !== lease
          )
            throw new MessagingError('grant-unavailable');
          return commitThreadReceptionPolicy(
            db,
            value.id,
            {
              threadId: route.threadId!,
              conversationId: route.conversationId,
              rootId: route.rootId!,
              anchorSourceEventId: sourceEventId,
              fingerprint: value.fingerprint,
            },
            input,
            editor,
          );
        },
        ['grants', 'bot-inbox'],
      );
      options.warn?.(
        JSON.stringify({
          event: 'messaging-thread-policy',
          phase: 'committed',
          grantId: value.id,
          revision: policy.revision,
          editor: editor.kind,
          mode: policy.mode,
        }),
      );
      return policy;
    },
    ordinaryDelivery(id) {
      return valid(grant(id)) && leases.get(id)?.ordinaryVerified ? 'verified' : 'unverified';
    },
    status(id) {
      const value = grant(id);
      if (!value.receiveScope || value.revokedAt || value.channelBridge?.enabled === false)
        return 'off';
      if (!targetAvailable(value)) return 'unavailable';
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
    share(botSlug, sourceEventId, channelId) {
      let placement: ChannelMessageCommit | undefined;
      let admitted: string[] = [];
      const result = transaction(
        (db) => {
          if (!options.isBotActive(botSlug)) throw new MessagingError('bot-unavailable');
          const source = read(botSlug, sourceEventId);
          if (!service.available(botSlug, sourceEventId))
            throw new MessagingError('source-unavailable');
          if (source.localChannelId) throw new MessagingError('source-conflict');
          const channel = bridgeChannel(db, channelId, botSlug);
          const prior = db
            .prepare(
              'SELECT channel_id, revision FROM channel_placements WHERE source_event_id = ?',
            )
            .get(sourceEventId) as { channel_id: string; revision: number } | undefined;
          if (prior && prior.channel_id !== channelId) throw new MessagingError('source-conflict');
          if (prior)
            return {
              sourceEventId,
              channelId,
              messageId: sourceEventId,
              revision: prior.revision,
              alreadyShared: true,
            };
          placement = placeBridgeSource(db, { ...source, localChannelId: channelId }, botSlug);
          if (!placement) throw new MessagingError('source-conflict');
          admitted = admitBridgeMembers(
            db,
            sourceEventId,
            channel,
            options.sourcePolicy,
            options.isBotActive,
          );
          return {
            sourceEventId,
            channelId,
            messageId: sourceEventId,
            revision: placement.revision,
            alreadyShared: false,
          };
        },
        ['source-event', 'channel', 'bot-inbox'],
      );
      if (placement) {
        try {
          options.onPlaced?.(placement);
        } catch {
          options.warn?.('bridge-share-publication-failed');
        }
        try {
          options.onShared?.(admitted);
        } catch {
          options.warn?.('bridge-share-wake-failed');
        }
      }
      options.warn?.(
        JSON.stringify({
          event: 'messaging-inbox-share',
          phase: 'committed',
          initiator: botSlug,
          sourceEventId,
          channelId,
          revision: result.revision,
          alreadyShared: result.alreadyShared,
        }),
      );
      return result;
    },
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
    async reconcileBinding(bindingId) {
      const rows = database.read((db) =>
        db.prepare('SELECT body FROM messaging_grants WHERE binding_id = ?').all(bindingId),
      ) as { body: string }[];
      const values = rows.map((r) => JSON.parse(r.body) as MessagingGrant);
      for (const value of values) stop(value.id);
      await Promise.all(values.filter((v) => !v.revokedAt).map((value) => start(value)));
    },
    revoke: stop,
    close() {
      closed = true;
      for (const id of new Set([...leases.keys(), ...retries.keys()])) stop(id);
      providers.clear();
    },
  };
  return service;
}
