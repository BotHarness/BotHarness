import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { OperationalDatabaseError, type OperationalDatabaseModulePort } from '../database/owner.js';
import {
  MessagingError,
  MessagingProviderError,
  type MessagingProvider,
  type MessagingAccount,
  type MessagingTarget,
} from './provider.js';

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
  text: string;
  state: OutboxState;
  createdAt: string;
  settledAt?: string;
  reason?: string;
}

export interface MessagingSnapshot {
  accounts: (MessagingAccount & { providerId: string })[];
  grants: (MessagingGrant & { availability: 'available' | 'unavailable' | 'rebind-required' })[];
  intents: OutboxIntent[];
}

export interface OutboundMessaging {
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
  send(botSlug: string, grantId: string, requestId: string, text: string): Promise<OutboxIntent>;
  history(botSlug: string): OutboxIntent[];
  close(): void;
}

type StoredIntent = OutboxIntent & { requestId: string; payloadHash: string };

export function createOutboundMessaging(options: {
  database: OperationalDatabaseModulePort;
  isBotActive(slug: string): boolean;
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
    { providerId: string; token: object; controller: AbortController }
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
    return entry;
  };
  return {
    register(value) {
      if (closed) throw new MessagingError('provider-unavailable');
      const token = {};
      const previous = providers.get(value.id);
      if (previous !== undefined)
        for (const attempt of inFlight.values()) {
          if (attempt.token === previous.token) attempt.controller.abort();
        }
      providers.set(value.id, { provider: value, token });
      return () => {
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
          if (value.revokedAt === undefined) {
            try {
              await check(value);
              availability = 'available';
            } catch (error) {
              if (error instanceof MessagingError && error.code === 'rebind-required')
                availability = 'rebind-required';
            }
          }
          return { ...grant(botSlug, value.id), availability };
        }),
      );
      return { accounts, grants, intents: history(botSlug) };
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
    },
    async send(botSlug, grantId, requestId, text) {
      active(botSlug);
      if (!/^[A-Za-z0-9_-]{8,128}$/.test(requestId) || !text.trim() || text.length > 4000)
        throw new MessagingError('invalid-input');
      const payloadHash = createHash('sha256').update(text).digest('hex');
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
        started = true;
        options.warn?.(
          JSON.stringify({
            event: 'messaging-outbox',
            phase: 'starting',
            initiator: 'human-profile',
            intentId: id.id,
          }),
        );
        inFlight.set(id.id, {
          providerId: acceptedGrant.providerId,
          token: entry.token,
          controller,
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
          entry.provider.send({
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
      providers.clear();
      for (const attempt of inFlight.values()) attempt.controller.abort();
    },
  };
}
