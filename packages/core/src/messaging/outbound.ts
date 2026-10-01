import type { GroupReceptionPolicy } from './group-policy.js';
import { bridgeChannel } from './channel-target.js';
import type { ChannelMessageCommit } from '../channels/store.js';
import { attachmentIdentity, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import { createHash, randomUUID } from 'node:crypto';
import { createInboundMessaging, type InboundMessaging } from './inbound.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from '../runtime/source-policy.js';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingProvider,
  type MessagingAccount,
  type MessagingTarget,
} from './provider.js';

async function replyFileBytes(
  store: AttachmentStore,
  file: ChannelAttachmentRef,
  signal: AbortSignal,
) {
  try {
    const downloaded = await store.download(attachmentIdentity(file), file.name, signal);
    if (downloaded.ref.size < 1 || downloaded.ref.size > store.maxBytes) {
      await downloaded.body.cancel();
      throw new MessagingProviderError('invalid-file', 'not-started');
    }
    const reader = downloaded.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const next = await reader.read();
        if (next.done) break;
        size += next.value.byteLength;
        if (size > store.maxBytes) throw new MessagingProviderError('invalid-file', 'not-started');
        chunks.push(next.value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    if (size !== downloaded.ref.size)
      throw new MessagingProviderError('file-changed', 'not-started');
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return { name: downloaded.ref.name, bytes };
  } catch (error) {
    if (error instanceof MessagingProviderError) throw error;
    throw new MessagingProviderError('file-unavailable', 'not-started');
  }
}

export interface MessagingGrant {
  id: string;
  bindingId: string;
  botSlug: string;
  providerId: string;
  accountRef: string;
  accountName: string;
  fingerprint: string;
  platform: string;
  targetRef: string;
  targetName: string;
  targetDigest: string;
  revision: number;
  createdAt: string;
  receiveScope?: { kind: 'group'; conversationId: string };
  receiveTargetChannelId?: string;
  revokedAt?: string;
  suspendedReason?: 'rebind-required';
}

export type OutboxState =
  | 'pending'
  | 'in-flight'
  | 'provider-accepted'
  | 'failed'
  | 'unknown-outcome'
  | 'cancelled'
  | 'grant-revoked';

export interface OutboxIntent {
  id: string;
  botSlug: string;
  grantId: string;
  grantRevision: number;
  sourceEventId?: string;
  file?: ChannelAttachmentRef;
  text: string;
  state: OutboxState;
  createdAt: string;
  settledAt?: string;
  reason?: string;
}

export interface MessagingSnapshot {
  channelTargets?: { id: string; name: string }[];
  accounts: (MessagingAccount & { providerId: string })[];
  grants: (MessagingGrant & {
    availability: 'available' | 'unavailable' | 'rebind-required';
    reception: ReturnType<InboundMessaging['status']>;
    canReceive?: boolean;
    groupPolicy?: GroupReceptionPolicy;
    ordinaryDelivery?: 'verified' | 'unverified';
  })[];
  intents: OutboxIntent[];
}

export interface OutboundMessaging {
  inbound: InboundMessaging;
  reply(botSlug: string, sourceEventId: string, text: string): Promise<OutboxIntent>;
  acquireFile(
    botSlug: string,
    sourceEventId: string,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<ChannelAttachmentRef>;
  replyFile(
    botSlug: string,
    sourceEventId: string,
    file: ChannelAttachmentRef,
  ): Promise<OutboxIntent>;
  register(provider: MessagingProvider): () => void;
  snapshot(botSlug: string): Promise<MessagingSnapshot>;
  targets(providerId: string, accountRef: string): Promise<MessagingTarget[]>;
  authorize(input: {
    botSlug: string;
    providerId: string;
    accountRef: string;
    targetRef: string;
    fingerprint: string;
    targetDigest: string;
  }): Promise<MessagingGrant>;
  revoke(botSlug: string, grantId: string): void;
  send(
    botSlug: string,
    grantId: string,
    requestId: string,
    text: string,
    sourceEventId?: string,
    file?: ChannelAttachmentRef,
  ): Promise<OutboxIntent>;
  history(botSlug: string): OutboxIntent[];
  close(): void;
}

type StoredIntent = OutboxIntent & { requestId: string; payloadHash: string };

export function createOutboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  attachments?: AttachmentStore;
  isBotActive(slug: string): boolean;
  sourcePolicy?: BotSourcePolicyStore;
  onAdmitted?(botSlug: string, sourceEventId: string): void;
  onPlaced?(commit: ChannelMessageCommit): void;
  timeoutMs?: number;
  recover?: boolean;
  now?: () => Date;
  warn?: (message: string) => void;
}): OutboundMessaging {
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
  const now = () => (options.now?.() ?? new Date()).toISOString();
  const providers = new Map<string, { provider: MessagingProvider; token: object }>();
  const inFlight = new Map<
    string,
    { providerId: string; token: object; controller: AbortController; fileGrantId?: string }
  >();
  let closed = false;
  const active = (slug: string) => {
    if (closed || !options.isBotActive(slug)) throw new MessagingError('bot-unavailable');
  };
  const provider = (id: string) => {
    const entry = providers.get(id);
    if (closed || entry === undefined) throw new MessagingError('provider-unavailable');
    return entry;
  };
  const current = (id: string, token: object) => {
    if (provider(id).token !== token) throw new MessagingError('provider-unavailable');
  };
  const grant = (slug: string, id: string): MessagingGrant => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_grants WHERE id = ? AND bot_slug = ?').get(id, slug),
    ) as { body: string } | undefined;
    if (row === undefined) throw new MessagingError('grant-unavailable');
    return JSON.parse(row.body) as MessagingGrant;
  };
  const readIntent = (id: string): StoredIntent => {
    const row = database.read((db) =>
      db.prepare('SELECT body FROM messaging_outbox WHERE id = ?').get(id),
    ) as { body: string } | undefined;
    if (!row) throw new MessagingError('intent-unavailable');
    return JSON.parse(row.body) as StoredIntent;
  };
  const settle = (id: string, state: OutboxState, reason?: string): OutboxIntent => {
    return transaction(
      (db) => {
        const existing = readIntent(id);
        if (existing.state !== 'pending' && existing.state !== 'in-flight') return existing;
        const value = {
          ...existing,
          state,
          settledAt: now(),
          ...(reason === undefined ? {} : { reason }),
        };
        db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
          state,
          JSON.stringify(value),
          id,
        );
        db.prepare(
          'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
        ).run(state, value.settledAt, reason ?? null, id);
        return value;
      },
      ['outbox'],
    );
  };
  if (options.recover !== false)
    transaction(
      (db) => {
        const rows = db
          .prepare("SELECT id FROM messaging_outbox WHERE state IN ('pending', 'in-flight')")
          .all() as unknown as { id: string }[];
        for (const row of rows) {
          const value = readIntent(row.id);
          const reason = value.state === 'in-flight' ? 'host-interrupted' : 'dispatch-interrupted';
          const state = value.state === 'in-flight' ? 'unknown-outcome' : 'cancelled';
          const record = { ...value, state, settledAt: now(), reason };
          db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
            state,
            JSON.stringify(record),
            row.id,
          );
          db.prepare(
            'UPDATE messaging_outbox_attempts SET state = ?, finished_at = ?, reason = ? WHERE intent_id = ?',
          ).run(state, record.settledAt, reason, row.id);
        }
      },
      ['outbox'],
    );

  const history = (botSlug: string) => {
    const rows = database.read((db) =>
      db
        .prepare(
          'SELECT body FROM messaging_outbox WHERE bot_slug = ? ORDER BY created_at DESC, id DESC LIMIT 30',
        )
        .all(botSlug),
    ) as unknown as { body: string }[];
    return rows.map((row) => JSON.parse(row.body) as OutboxIntent);
  };
  const suspend = (value: MessagingGrant) => {
    transaction(
      (db) => {
        const latest = grant(value.botSlug, value.id);
        if (latest.revokedAt === undefined && latest.suspendedReason === undefined) {
          db.prepare('UPDATE messaging_grants SET body = ?, revision = ? WHERE id = ?').run(
            JSON.stringify({
              ...latest,
              suspendedReason: 'rebind-required',
              revision: latest.revision + 1,
            }),
            latest.revision + 1,
            latest.id,
          );
        }
      },
      ['grants'],
    );
  };
  const check = async (value: MessagingGrant) => {
    active(value.botSlug);
    if (value.revokedAt !== undefined) throw new MessagingError('grant-revoked');
    if (value.suspendedReason !== undefined) throw new MessagingError('rebind-required');
    const entry = provider(value.providerId);
    let inspected;
    try {
      inspected = await entry.provider.inspect(value.accountRef, value.targetRef);
    } catch (error) {
      current(value.providerId, entry.token);
      if (error instanceof MessagingError && error.code === 'rebind-required') suspend(value);
      throw error;
    }
    current(value.providerId, entry.token);
    active(value.botSlug);
    if (!inspected.account.connected) throw new MessagingError('provider-unavailable');
    if (
      inspected.account.ref !== value.accountRef ||
      inspected.account.fingerprint !== value.fingerprint ||
      inspected.account.platform !== value.platform ||
      inspected.target.ref !== value.targetRef ||
      inspected.target.digest !== value.targetDigest
    ) {
      suspend(value);
      throw new MessagingError('rebind-required');
    }
    return { ...entry, inspected };
  };
  const inbound = createInboundMessaging({
    database,
    sourcePolicy: options.sourcePolicy ?? createBotSourcePolicyStore(database),
    isBotActive: options.isBotActive,
    onAdmitted: options.onAdmitted ?? (() => undefined),
    ...(options.onPlaced ? { onPlaced: options.onPlaced } : {}),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const service: OutboundMessaging = {
    inbound,
    async acquireFile(botSlug, sourceEventId, attachmentId, signal) {
      if (options.attachments === undefined || !inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      const attachment = source.event.attachments?.find((item) => item.id === attachmentId);
      if (attachment === undefined) throw new MessagingError('attachment-unavailable');
      const value = grant(botSlug, source.grantId);
      const entry = await check(value);
      if (entry.provider.readFile === undefined) throw new MessagingError('capability-unavailable');
      const controller = new AbortController();
      const combined = AbortSignal.any([
        controller.signal,
        AbortSignal.timeout(30000),
        inbound.sourceSignal(botSlug, sourceEventId),
        ...(signal === undefined ? [] : [signal]),
      ]);
      const key = 'file-' + randomUUID();
      inFlight.set(key, {
        providerId: value.providerId,
        token: entry.token,
        controller,
        fileGrantId: value.id,
      });
      const validate = () => {
        combined.throwIfAborted();
        current(value.providerId, entry.token);
        if (!inbound.available(botSlug, sourceEventId))
          throw new MessagingError('source-unavailable');
      };
      const startedAt = Date.now();
      options.warn?.(
        JSON.stringify({
          event: 'messaging-attachment',
          phase: 'starting',
          initiator: 'source-file-access',
          sourceEventId,
        }),
      );
      let abort: (() => void) | undefined;
      try {
        validate();
        const hash = createHash('sha256')
          .update(
            JSON.stringify([
              value.providerId,
              value.fingerprint,
              source.event.conversation.id,
              attachment.id,
            ]),
          )
          .digest('hex')
          .slice(0, 32);
        const uploadId = [
          hash.slice(0, 8),
          hash.slice(8, 12),
          '4' + hash.slice(13, 16),
          '8' + hash.slice(17, 20),
          hash.slice(20),
        ].join('-');
        const interrupted = new Promise<never>((_, reject) => {
          abort = () => reject(new MessagingError('transfer-cancelled'));
          combined.addEventListener('abort', abort, { once: true });
          if (combined.aborted) abort();
        });
        const ref = await Promise.race([
          options.attachments.acquire({
            uploadId,
            name: attachment.name,
            signal: combined,
            load: async () => {
              validate();
              const data = await entry.provider.readFile!({
                accountRef: value.accountRef,
                fingerprint: value.fingerprint,
                route: source.event.reply,
                attachment,
                signal: combined,
              });
              return (async function* () {
                for await (const chunk of data) {
                  validate();
                  yield chunk;
                }
                validate();
              })();
            },
          }),
          interrupted,
        ]);
        validate();
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'completed',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            size: ref.size,
          }),
        );
        return ref;
      } catch (error) {
        options.warn?.(
          JSON.stringify({
            event: 'messaging-attachment',
            phase: 'refused',
            sourceEventId,
            durationMs: Date.now() - startedAt,
            reason: error instanceof MessagingError ? error.code : 'transfer-unavailable',
          }),
        );
        throw error;
      } finally {
        if (abort !== undefined) combined.removeEventListener('abort', abort);
        inFlight.delete(key);
        controller.abort();
      }
    },
    async replyFile(botSlug, sourceEventId, file) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      return service.send(
        botSlug,
        source.grantId,
        'reply-' + sourceEventId,
        'File reply: ' + file.name,
        sourceEventId,
        file,
      );
    },
    async reply(botSlug, sourceEventId, text) {
      if (!inbound.available(botSlug, sourceEventId))
        throw new MessagingError('source-unavailable');
      const source = inbound.read(botSlug, sourceEventId);
      return service.send(botSlug, source.grantId, 'reply-' + sourceEventId, text, sourceEventId);
    },
    register(value) {
      if (closed) throw new MessagingError('provider-unavailable');
      const token = {};
      const previous = providers.get(value.id);
      if (previous !== undefined)
        for (const attempt of inFlight.values()) {
          if (attempt.token === previous.token) attempt.controller.abort();
        }
      providers.set(value.id, { provider: value, token });
      const disposeInbound = inbound.register(value);
      return () => {
        disposeInbound();
        if (providers.get(value.id)?.token === token) providers.delete(value.id);
        for (const attempt of inFlight.values())
          if (attempt.token === token) attempt.controller.abort();
      };
    },
    history,
    async snapshot(botSlug) {
      const accounts = (
        await Promise.allSettled(
          [...providers.values()].map(async (entry) =>
            (await entry.provider.accounts()).map((account) => ({
              ...account,
              providerId: entry.provider.id,
            })),
          ),
        )
      ).flatMap((result) => (result.status === 'fulfilled' ? result.value : []));
      const rows = database.read((db) =>
        db
          .prepare('SELECT body FROM messaging_grants WHERE bot_slug = ? ORDER BY created_at DESC')
          .all(botSlug),
      ) as unknown as { body: string }[];
      const grants = await Promise.all(
        rows.map(async (row) => {
          const value = JSON.parse(row.body) as MessagingGrant;
          let availability: 'available' | 'unavailable' | 'rebind-required' = 'unavailable';
          let canReceive = false;
          if (value.revokedAt === undefined) {
            try {
              const checked = await check(value);
              canReceive =
                checked.provider.consume !== undefined &&
                checked.provider.reply !== undefined &&
                checked.inspected.target.receiveScope !== undefined;
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          const current = grant(botSlug, value.id);
          return {
            ...current,
            availability,
            reception: inbound.status(value.id),
            canReceive,
            ...(current.revokedAt === undefined &&
            !current.suspendedReason &&
            options.isBotActive(botSlug)
              ? {
                  groupPolicy: inbound.policy(botSlug, value.id),
                  ordinaryDelivery: inbound.ordinaryDelivery(value.id),
                }
              : {}),
          };
        }),
      );
      const channelTargets = database.read((db) => {
        const rows = db.prepare('SELECT channel_id FROM channel_records').all() as {
          channel_id: string;
        }[];
        return rows.flatMap(({ channel_id }) => {
          try {
            const channel = bridgeChannel(db, channel_id, botSlug, true);
            return [{ id: channel.id, name: channel.name }];
          } catch (error) {
            if (error instanceof MessagingError) return [];
            throw error;
          }
        });
      });
      return { accounts, grants, channelTargets, intents: history(botSlug) };
    },
    async targets(providerId, accountRef) {
      return provider(providerId).provider.targets(accountRef);
    },
    async authorize(input) {
      active(input.botSlug);
      const entry = provider(input.providerId);
      const inspected = await entry.provider.inspect(input.accountRef, input.targetRef);
      current(input.providerId, entry.token);
      if (
        inspected.account.ref !== input.accountRef ||
        !inspected.account.connected ||
        inspected.account.fingerprint !== input.fingerprint ||
        inspected.target.ref !== input.targetRef ||
        inspected.target.digest !== input.targetDigest
      )
        throw new MessagingError('rebind-required');
      return transaction(
        (db) => {
          active(input.botSlug);
          const existing = db
            .prepare(
              'SELECT id FROM messaging_bindings WHERE revoked_at IS NULL AND ((provider_id = ? AND account_ref = ?) OR (provider_id = ? AND fingerprint = ?) OR (bot_slug = ? AND platform = ?))',
            )
            .get(
              input.providerId,
              input.accountRef,
              input.providerId,
              input.fingerprint,
              input.botSlug,
              inspected.account.platform,
            );
          if (existing !== undefined) throw new MessagingError('binding-conflict');
          const at = now();
          const bindingId = randomUUID();
          const id = randomUUID();
          const value: MessagingGrant = {
            ...input,
            id,
            bindingId,
            accountName: inspected.account.name,
            platform: inspected.account.platform,
            targetName: inspected.target.name,
            revision: 1,
            createdAt: at,
          };
          db.prepare(
            'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            bindingId,
            input.botSlug,
            input.providerId,
            value.platform,
            input.accountRef,
            value.fingerprint,
            at,
          );
          db.prepare(
            'INSERT INTO messaging_grants (id, binding_id, bot_slug, revision, created_at, body) VALUES (?, ?, ?, ?, ?, ?)',
          ).run(id, bindingId, input.botSlug, 1, at, JSON.stringify(value));
          return value;
        },
        ['bindings', 'grants'],
      );
    },
    revoke(botSlug, grantId) {
      transaction(
        (db) => {
          const value = grant(botSlug, grantId);
          if (value.revokedAt !== undefined) return;
          const revokedAt = now();
          db.prepare('UPDATE messaging_grants SET body = ?, revoked_at = ? WHERE id = ?').run(
            JSON.stringify({ ...value, revokedAt }),
            revokedAt,
            grantId,
          );
          db.prepare('UPDATE messaging_bindings SET revoked_at = ? WHERE id = ?').run(
            revokedAt,
            value.bindingId,
          );
          const pending = db
            .prepare("SELECT id FROM messaging_outbox WHERE grant_id = ? AND state = 'pending'")
            .all(grantId) as unknown as { id: string }[];
          for (const row of pending) {
            const intent = readIntent(row.id);
            db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
              'grant-revoked',
              JSON.stringify({
                ...intent,
                state: 'grant-revoked',
                reason: 'grant-revoked',
                settledAt: revokedAt,
              }),
              row.id,
            );
          }
        },
        ['grants', 'bindings', 'outbox'],
      );
      inbound.revoke(grantId);
      for (const attempt of inFlight.values())
        if (attempt.fileGrantId === grantId) attempt.controller.abort();
    },
    async send(botSlug, grantId, requestId, text, sourceEventId, file) {
      active(botSlug);
      if (
        (file !== undefined && sourceEventId === undefined) ||
        !/^[A-Za-z0-9_-]{8,128}$/.test(requestId) ||
        !text.trim() ||
        text.length > 4000
      )
        throw new MessagingError('invalid-input');
      const payloadHash = createHash('sha256')
        .update(
          file === undefined
            ? sourceEventId === undefined
              ? text
              : JSON.stringify([text, sourceEventId])
            : JSON.stringify([text, sourceEventId, file]),
        )
        .digest('hex');
      const duplicate = database.read((db) =>
        db.prepare('SELECT id FROM messaging_outbox WHERE request_id = ?').get(requestId),
      ) as { id: string } | undefined;
      if (duplicate) {
        const value = readIntent(duplicate.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const acceptedGrant = grant(botSlug, grantId);
      if (
        sourceEventId !== undefined &&
        (!inbound.available(botSlug, sourceEventId) ||
          inbound.read(botSlug, sourceEventId).grantId !== grantId)
      )
        throw new MessagingError('source-unavailable');
      await check(acceptedGrant);
      const id = transaction(
        (db) => {
          active(botSlug);
          const currentGrant = grant(botSlug, grantId);
          if (
            currentGrant.revokedAt !== undefined ||
            currentGrant.revision !== acceptedGrant.revision
          )
            throw new MessagingError('grant-revoked');
          const existing = db
            .prepare('SELECT id FROM messaging_outbox WHERE request_id = ?')
            .get(requestId) as { id: string } | undefined;
          if (existing) return { id: existing.id, created: false };
          const value: StoredIntent = {
            id: randomUUID(),
            botSlug,
            grantId,
            grantRevision: currentGrant.revision,
            requestId,
            payloadHash,
            ...(sourceEventId === undefined ? {} : { sourceEventId }),
            ...(file === undefined ? {} : { file }),
            text,
            state: 'pending',
            createdAt: now(),
          };
          db.prepare(
            'INSERT INTO messaging_outbox (id, bot_slug, grant_id, request_id, state, created_at, body) VALUES (?, ?, ?, ?, ?, ?, ?)',
          ).run(
            value.id,
            botSlug,
            grantId,
            requestId,
            value.state,
            value.createdAt,
            JSON.stringify(value),
          );
          return { id: value.id, created: true };
        },
        ['outbox'],
      );
      if (!id.created) {
        const value = readIntent(id.id);
        if (
          value.botSlug !== botSlug ||
          value.grantId !== grantId ||
          value.payloadHash !== payloadHash
        )
          throw new MessagingError('request-conflict');
        return value;
      }
      const beganAt = Date.now();
      let started = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const controller = new AbortController();
      try {
        const entry = await check(grant(botSlug, grantId));
        transaction(
          (db) => {
            active(botSlug);
            current(acceptedGrant.providerId, entry.token);
            const value = grant(botSlug, grantId);
            if (value.revokedAt !== undefined || value.revision !== acceptedGrant.revision)
              throw new MessagingError('grant-revoked');
            const intent = readIntent(id.id);
            if (intent.state !== 'pending') throw new MessagingError('grant-revoked');
            const at = now();
            db.prepare('UPDATE messaging_outbox SET state = ?, body = ? WHERE id = ?').run(
              'in-flight',
              JSON.stringify({ ...intent, state: 'in-flight' }),
              id.id,
            );
            db.prepare(
              'INSERT INTO messaging_outbox_attempts (intent_id, started_at, state) VALUES (?, ?, ?)',
            ).run(id.id, at, 'in-flight');
          },
          ['outbox'],
        );
        if (sourceEventId !== undefined && !inbound.available(botSlug, sourceEventId))
          throw new MessagingProviderError('source-unavailable', 'not-started');
        started = true;
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            phase: 'starting',
            initiator: sourceEventId === undefined ? 'human-profile' : 'bot-source-reply',
            intentId: id.id,
          }),
        );
        inFlight.set(id.id, {
          providerId: acceptedGrant.providerId,
          token: entry.token,
          controller,
          ...(file === undefined ? {} : { fileGrantId: acceptedGrant.id }),
        });
        const interrupted = new Promise<never>((_, reject) => {
          controller.signal.addEventListener(
            'abort',
            () => reject(new MessagingProviderError('provider-interrupted', 'unknown')),
            { once: true },
          );
          timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 15000);
        });
        const result = await Promise.race([
          file !== undefined && sourceEventId !== undefined
            ? (async () => {
                if (entry.provider.replyFile === undefined || options.attachments === undefined)
                  throw new MessagingProviderError('capability-unavailable', 'not-started');
                const result = await replyFileBytes(options.attachments, file, controller.signal);
                try {
                  await check(grant(botSlug, grantId));
                } catch (error) {
                  throw new MessagingProviderError(
                    error instanceof MessagingError ? error.code : 'grant-unavailable',
                    'not-started',
                  );
                }
                if (!inbound.available(botSlug, sourceEventId))
                  throw new MessagingProviderError('source-unavailable', 'not-started');
                return entry.provider.replyFile({
                  accountRef: acceptedGrant.accountRef,
                  fingerprint: acceptedGrant.fingerprint,
                  route: inbound.read(botSlug, sourceEventId).event.reply,
                  file: { id: id.id, ...result },
                  signal: controller.signal,
                });
              })()
            : sourceEventId !== undefined
              ? entry.provider.reply === undefined
                ? Promise.reject(
                    new MessagingProviderError('capability-unavailable', 'not-started'),
                  )
                : entry.provider.reply({
                    accountRef: acceptedGrant.accountRef,
                    fingerprint: acceptedGrant.fingerprint,
                    route: inbound.read(botSlug, sourceEventId).event.reply,
                    text,
                    signal: controller.signal,
                  })
              : entry.provider.send({
                  accountRef: acceptedGrant.accountRef,
                  targetRef: acceptedGrant.targetRef,
                  fingerprint: acceptedGrant.fingerprint,
                  targetDigest: acceptedGrant.targetDigest,
                  text,
                  signal: controller.signal,
                }),
          interrupted,
        ]);
        if (result.accepted !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return settle(id.id, 'provider-accepted');
      } catch (error) {
        const definite =
          !started ||
          (error instanceof MessagingProviderError && error.disposition === 'not-started');
        const reason =
          error instanceof MessagingError || error instanceof MessagingProviderError
            ? error.code
            : 'provider-result-unknown';
        const state =
          reason === 'grant-revoked' && !started
            ? 'grant-revoked'
            : definite
              ? 'failed'
              : 'unknown-outcome';
        return settle(id.id, state, reason);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
        inFlight.delete(id.id);
        const value = readIntent(id.id);
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            intentId: id.id,
            phase: 'settled',
            durationMs: Date.now() - beganAt,
            state: value.state,
            reason: value.reason,
          }),
        );
      }
    },
    close() {
      closed = true;
      inbound.close();
      providers.clear();
      for (const attempt of inFlight.values()) attempt.controller.abort();
    },
  };
  return service;
}
