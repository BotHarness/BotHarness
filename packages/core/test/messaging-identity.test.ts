import { afterEach, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import type { MessagingProvider, MessagingInboundEvent } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

const cleanup: (() => void)[] = [];
afterEach(() => cleanup.splice(0).forEach((f) => f()));
function fixture(platform: 'feishu' | 'slack' = 'feishu') {
  const home = createTempRoot('bh-identity-');
  let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let fingerprint = 'a'.repeat(64),
    digest = 'b'.repeat(64),
    connected = true;
  let inspectGate: (() => Promise<void>) | undefined;
  let callback: Parameters<NonNullable<MessagingProvider['consume']>>[0]['onEvent'] | undefined;
  let leases = 0,
    sends = 0;
  const provider: MessagingProvider = {
    id: 'qa/lark',
    accounts: async () => [{ ref: 'app', platform, name: 'QA Bot', fingerprint, connected }],
    targets: async () => [
      {
        ref: 'team',
        name: 'QA team',
        digest,
        receiveScope: { kind: 'group', conversationId: 'chat' },
      },
    ],
    async inspect(_account, target) {
      await inspectGate?.();
      return {
        account: (await provider.accounts())[0]!,
        target: { ...(await provider.targets('app'))[0]!, ref: target },
      };
    },
    async consume(input) {
      ++leases;
      callback = input.onEvent;
      return () => {
        --leases;
      };
    },
    async send() {
      ++sends;
      return { accepted: true };
    },
    async reply() {
      ++sends;
      return { accepted: true };
    },
  };
  const make = () =>
    createOutboundMessaging({
      database: attachOperationalModule(owner, 'messaging'),
      isBotActive: () => true,
      timeoutMs: 1000,
    });
  let service = make();
  let dispose = service.register(provider);
  cleanup.push(() => {
    service.close();
    owner.close();
  });
  return {
    get service() {
      return service;
    },
    get leases() {
      return leases;
    },
    get sends() {
      return sends;
    },
    bind: (slug = 'ada') =>
      service.identity(slug, {
        kind: 'bind',
        providerId: provider.id,
        accountRef: 'app',
        fingerprint,
      }),
    authorize: (targetRef = 'team') =>
      service.authorize({
        botSlug: 'ada',
        providerId: provider.id,
        accountRef: 'app',
        fingerprint,
        targetRef,
        targetDigest: digest,
      }),
    setConnected: (value: boolean) => {
      connected = value;
    },
    setDigest: (value: string) => {
      digest = value;
    },
    gate: (value?: () => Promise<void>) => {
      inspectGate = value;
    },
    async event(id: string) {
      const event: MessagingInboundEvent = {
        version: 1,
        channel: 'feishu',
        botId: 'app',
        fingerprint,
        eventId: id,
        messageId: id,
        actor: { kind: 'user', id: 'human' },
        conversation: { kind: 'group', id: 'chat' },
        mentions: [],
        mentionedAccount: true,
        at: new Date().toISOString(),
        text: 'QA ' + id,
        reply: { messageId: id, conversationId: 'chat', actorId: 'human' },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      };
      return callback!(event, new AbortController().signal);
    },
    restart() {
      service.close();
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      service = make();
      dispose = service.register(provider);
    },
    disconnect() {
      dispose();
    },
  };
}

it('binds only an account; no grant, listener or outbound effect and ownership remains exclusive', async () => {
  const f = fixture();
  const identity = await f.bind();
  expect(identity.enabled).toBe(true);
  expect((await f.service.snapshot('ada')).grants).toEqual([]);
  expect(f.leases).toBe(0);
  expect(f.sends).toBe(0);
  await expect(f.bind('bob')).rejects.toThrow('binding-conflict');
  f.restart();
  expect((await f.service.snapshot('ada')).identities?.[0]?.id).toBe(identity.id);
});

it('pauses the identity while preserving route/history, then resumes exactly the same authorized scope', async () => {
  const f = fixture();
  const identity = await f.bind();
  const g = await f.authorize();
  await f.service.inbound.setEnabled('ada', g.id, true);
  await f.event('one');
  const source = await f.service.snapshot('ada');
  expect(source.grants[0]?.reception).toBe('receiving');
  const paused = await f.service.identity('ada', {
    kind: 'update',
    id: identity.id,
    expectedRevision: 1,
    name: 'Sales QA',
    enabled: false,
  });
  expect(f.leases).toBe(0);
  await expect(f.service.send('ada', g.id, 'paused-test', 'not sent')).rejects.toThrow(
    'identity-paused',
  );
  expect(f.sends).toBe(0);
  const snap = await f.service.snapshot('ada');
  expect(snap.identities?.[0]?.availability).toBe('paused');
  expect(snap.grants[0]?.receiveScope).toEqual(
    g.receiveScope ?? { kind: 'group', conversationId: 'chat' },
  );
  f.restart();
  expect((await f.service.snapshot('ada')).identities?.[0]?.enabled).toBe(false);
  const resumed = await f.service.identity('ada', {
    kind: 'reconnect',
    id: identity.id,
    expectedRevision: paused.revision,
  });
  expect(resumed.revision).toBe(3);
  expect(f.leases).toBe(1);
  expect((await f.service.send('ada', g.id, 'resumed-test', 'sent')).state).toBe(
    'provider-accepted',
  );
  await f.event('two');
  expect(f.sends).toBe(1);
});

it('rejects stale edits and changed target recovery without widening the paused grant', async () => {
  const f = fixture();
  const i = await f.bind();
  await f.authorize();
  await f.service.identity('ada', {
    kind: 'update',
    id: i.id,
    expectedRevision: 1,
    name: i.name,
    enabled: false,
  });
  await expect(
    f.service.identity('ada', {
      kind: 'update',
      id: i.id,
      expectedRevision: 1,
      name: 'stale',
      enabled: true,
    }),
  ).rejects.toThrow('identity-stale');
  f.setDigest('c'.repeat(64));
  await expect(
    f.service.identity('ada', { kind: 'reconnect', id: i.id, expectedRevision: 2 }),
  ).rejects.toThrow('rebind-required');
  expect((await f.service.snapshot('ada')).identities?.[0]?.enabled).toBe(false);
});

it('identity pause racing dispatch rejects the unstarted operation; already accepted outcome stays accepted', async () => {
  const f = fixture();
  const i = await f.bind();
  const g = await f.authorize();
  expect((await f.service.send('ada', g.id, 'first-send', 'before')).state).toBe(
    'provider-accepted',
  );
  let release!: () => void, reached!: () => void;
  const started = new Promise<void>((r) => (reached = r));
  let calls = 0;
  f.gate(async () => {
    if (++calls === 2) {
      reached();
      await new Promise<void>((r) => (release = r));
    }
  });
  const pending = f.service.send('ada', g.id, 'racing-send', 'after');
  await started;
  await f.service.identity('ada', {
    kind: 'update',
    id: i.id,
    expectedRevision: 1,
    name: i.name,
    enabled: false,
  });
  release();
  expect(await pending).toMatchObject({ state: 'failed', reason: 'identity-paused' });
  expect(f.sends).toBe(1);
  expect(f.service.history('ada').find((x) => x.text === 'before')?.state).toBe(
    'provider-accepted',
  );
});

it('unbind invalidates all own scopes, retains accepted history and releases the account for explicit binding', async () => {
  const f = fixture();
  const i = await f.bind();
  const a = await f.authorize();
  const b = await f.authorize('another');
  await f.service.send('ada', a.id, 'retain-send', 'keep history');
  const value = await f.service.identity('ada', { kind: 'unbind', id: i.id, expectedRevision: 1 });
  expect(value.revokedAt).toBeDefined();
  const s = await f.service.snapshot('ada');
  expect(s.identities).toEqual([]);
  expect(s.grants.every((g) => g.revokedAt !== undefined)).toBe(true);
  expect(s.intents[0]?.state).toBe('provider-accepted');
  await expect(f.service.send('ada', b.id, 'old-scope', 'no')).rejects.toThrow('grant-revoked');
  expect((await f.bind('bob')).botSlug).toBe('bob');
});

it('provider loss reports unavailable while enabled preference remains durable and offline pause still works', async () => {
  const f = fixture();
  const i = await f.bind();
  f.disconnect();
  expect((await f.service.snapshot('ada')).identities?.[0]).toMatchObject({
    enabled: true,
    availability: 'unavailable',
  });
  await f.service.identity('ada', {
    kind: 'update',
    id: i.id,
    expectedRevision: 1,
    name: i.name,
    enabled: false,
  });
  await expect(
    f.service.identity('ada', { kind: 'reconnect', id: i.id, expectedRevision: 2 }),
  ).rejects.toThrow('provider-unavailable');
});

it.each(['feishu', 'slack'] as const)(
  '%s inherits live identity defaults, preserves custom choices, restores inheritance, and fences queued sends',
  async (platform) => {
    const f = fixture(platform);
    let identity = await f.bind();
    const grant = await f.authorize();
    await f.service.inbound.setEnabled('ada', grant.id, true);
    expect(identity.enabledInheritance).toBe('inherit');
    expect(f.leases).toBe(1);
    const save = (identityEnabled: boolean) => {
      const value = f.service.defaults(platform);
      const { revision, changedAt: _at, ...preferences } = value;
      return f.service.setDefaults({ ...preferences, expectedRevision: revision, identityEnabled });
    };
    await save(false);
    expect(f.leases).toBe(0);
    identity = (await f.service.snapshot('ada')).identities![0]!;
    expect(identity).toMatchObject({
      enabled: false,
      availability: 'paused',
      enabledInheritance: 'inherit',
    });
    await expect(f.service.send('ada', grant.id, 'paused-request', 'QA')).rejects.toThrow(
      'identity-paused',
    );
    identity = await f.service.identity('ada', {
      kind: 'update',
      id: identity.id,
      expectedRevision: identity.revision,
      name: identity.name,
      enabled: true,
    });
    expect(identity.enabledInheritance).toBe('custom');
    await save(true);
    await save(false);
    expect((await f.service.snapshot('ada')).identities![0]!.enabled).toBe(true);
    identity = await f.service.identity('ada', {
      kind: 'update',
      id: identity.id,
      expectedRevision: identity.revision,
      expectedDefaultRevision: f.service.defaults(platform).revision,
      name: identity.name,
      enabled: true,
      inheritEnabled: true,
    });
    expect(identity.enabled).toBe(false);
    expect(f.leases).toBe(0);
    await save(true);
    expect(f.leases).toBe(1);
    f.restart();
    expect(f.service.defaults(platform).identityEnabled).toBe(true);
    expect((await f.service.snapshot('ada')).identities![0]!.enabledInheritance).toBe('inherit');
    let release!: () => void;
    f.gate(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const sending = f.service.send('ada', grant.id, 'paused-during-inspect', 'QA');
    await Promise.resolve();
    const pausing = save(false);
    release();
    await pausing;
    await expect(sending).rejects.toThrow('identity-paused');
    expect(f.sends).toBe(0);
  },
);
it('rejects stale global writes without silently replacing the committed preferences', async () => {
  const f = fixture();
  const defaults = f.service.defaults();
  const { revision, changedAt: _at, ...preferences } = defaults;
  await f.service.setDefaults({ ...preferences, expectedRevision: revision, count: 2 });
  await expect(
    f.service.setDefaults({ ...preferences, expectedRevision: revision, count: 1 }),
  ).rejects.toThrow('defaults-stale');
  expect(f.service.defaults().count).toBe(2);
  f.restart();
  expect(f.service.defaults()).toMatchObject({ revision: 1, count: 2 });
});
