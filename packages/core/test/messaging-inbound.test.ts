import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'a'.repeat(64);
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function event(overrides: Partial<MessagingInboundEvent> = {}): MessagingInboundEvent {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-app',
    fingerprint,
    eventId: 'ev-1',
    messageId: 'om-1',
    actor: { kind: 'user', id: 'ou-human' },
    conversation: { kind: 'group', id: 'oc-team' },
    mentions: [{ id: 'ou-bot', key: '@_user_1' }],
    mentionedAccount: true,
    at: '2026-10-01T00:00:00.000Z',
    text: '@_user_1 Please reply in this topic',
    reply: {
      messageId: 'om-1',
      conversationId: 'oc-team',
      actorId: 'ou-human',
      threadId: 'omt-topic',
      rootId: 'om-root',
      parentId: 'om-parent',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    ...overrides,
  };
}

async function fixture(
  options: {
    onRun?: (run: OrchestratorAgentRun) => Promise<void>;
    steer?: (botSlug: string, text: string) => boolean;
  } = {},
) {
  const home = createTempRoot('botharness-inbound-');
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
      await options.onRun?.(run);
    },
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
    ...(options.steer === undefined ? {} : { steerOrchestrator: options.steer }),
  };
  let core = createCore({ dshHome: home, agents });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let callback: Consumer['onEvent'] | undefined;
  let consumerSignal: AbortSignal | undefined;
  let subscriptions = 0;
  const replies: { route: MessagingReplyRoute; text: string; botId: string }[] = [];
  let result: (() => Promise<{ sent: true }>) | undefined;
  let ready = true;
  const publicService: DshImOutboundService = {
    contractVersion: 1,
    listBots: async () => [{ botId: 'lark-app', channel: 'feishu' }],
    listTargets: async () => [
      { targetId: 'team', name: 'QA team', kind: 'group', route: { chatId: 'oc-team' } },
    ],
    describeBot: async () => {
      if (!ready) throw Object.assign(new Error('Starting account'), { code: 'unknown-bot' });
      return {
        version: 1,
        channel: 'feishu',
        botId: 'lark-app',
        account: { fingerprint, name: 'My Lark identity' },
        connected: true,
        capabilities: ['proactive-text-checked', 'exclusive-text-consumer', 'reply-text-checked'],
      };
    },
    sendChecked: vi.fn(async () => ({ sent: true as const })),
    consumeInbound: async (_id, input) => {
      ++subscriptions;
      callback = input.onEvent;
      consumerSignal = input.signal;
      return () => {
        --subscriptions;
      };
    },
    replyChecked: async (botId, route, text) => {
      replies.push({ botId, route, text });
      expect(core.externalMessaging.history('ada')[0]?.state).toBe('in-flight');
      return result ? result() : { sent: true };
    },
  };
  const register = () => {
    const provider = createDshImProvider(publicService);
    if (!provider) throw new Error('Provider missing');
    return core.externalMessaging.register(provider);
  };
  let dispose = register();
  const authorize = async () => {
    const targets = await core.externalMessaging.targets('dsh-im/feishu', 'lark-app');
    return core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      accountRef: 'lark-app',
      targetRef: 'team',
      fingerprint,
      targetDigest: targets[0]!.digest,
    });
  };
  const grant = await authorize();
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    get core() {
      return core;
    },
    grant,
    runs,
    replies,
    publicService,
    query,
    get subscriptions() {
      return subscriptions;
    },
    get callback() {
      return callback;
    },
    async enable() {
      await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    },
    async receive(raw: unknown = event()) {
      if (!callback || !consumerSignal) throw new Error('Not subscribed');
      return callback(raw, { signal: consumerSignal });
    },
    async idle() {
      await tick();
      await core.runtime.whenIdle();
      await tick();
    },
    setReady(value: boolean) {
      ready = value;
    },
    setReply(value: () => Promise<{ sent: true }>) {
      result = value;
    },
    dispose() {
      dispose();
    },
    async restart() {
      dispose();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      cores.splice(cores.indexOf(core), 1);
      core = createCore({ dshHome: home, agents });
      cores.push(core);
      dispose = register();
      await tick();
      await tick();
    },
  };
}

it('requires Human receive authorization, commits before ACK, runs the real Inbox without a DM placement, and replies via the trusted source', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      expect(run.inboundChannelId).toBeUndefined();
      expect(run.inbox).toContain('My Lark identity');
      expect(run.inbox).toContain('omt-topic');
      const item = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message');
      if (!item) throw new Error('Admission not projected');
      await expect(run.channels.send({ body: 'Wrong local destination' })).rejects.toThrow(
        'No inbound local Channel',
      );
      expect(run.externalMessaging?.read(item.id).event.actor.id).toBe('ou-human');
      await run.externalMessaging?.reply(item.id, 'Original-topic response');
    },
  });
  expect(fx.subscriptions).toBe(0);
  await fx.enable();
  expect(fx.subscriptions).toBe(1);
  expect(await fx.receive()).toEqual({ accepted: true });
  expect(
    fx.query("SELECT source_kind FROM source_events WHERE source_kind = 'bridge-message'"),
  ).toHaveLength(1);
  const stored = fx.query(
    "SELECT body, payload_json FROM source_events WHERE source_kind = 'bridge-message'",
  )[0] as { body: string; payload_json: string };
  expect(stored.body).toBe(event().text);
  const payload = JSON.parse(stored.payload_json);
  expect(payload.external).not.toHaveProperty('body');
  expect(payload.external.event).not.toHaveProperty('text');
  expect(fx.query('SELECT * FROM channel_placements')).toHaveLength(0);
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toEqual([
    { botId: 'lark-app', route: event().reply, text: 'Original-topic response' },
  ]);
  expect(fx.core.externalMessaging.history('ada')[0]).toMatchObject({
    state: 'provider-accepted',
    sourceEventId: expect.any(String),
  });
  expect(
    fx.query("SELECT last_error FROM inbox_admissions WHERE reason = 'group-mention'"),
  ).toEqual([{ last_error: null }]);
  const item = fx.core.attention.list({ botSlug: 'ada' }).items[0];
  expect(item).toMatchObject({
    state: 'handled',
    authorKind: 'bridged',
    externalOrigin: {
      conversationName: 'QA team',
      accountName: 'My Lark identity',
      senderId: 'ou-human',
    },
  });
});

it('ignores ordinary traffic, other group traffic and non-user sources; rejects forged account/route evidence', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive(
    event({ mentionedAccount: false, mentions: [{ id: 'ou-other-bot', key: '@_user_1' }] }),
  );
  await fx.receive(
    event({
      conversation: { kind: 'group', id: 'oc-other' },
      reply: { ...event().reply, conversationId: 'oc-other' },
    }),
  );
  await expect(fx.receive({ ...event(), actor: { kind: 'bot', id: 'ou-bot' } })).rejects.toThrow();
  await expect(fx.receive(event({ fingerprint: 'b'.repeat(64) }))).rejects.toThrow(
    'untrusted-source',
  );
  await expect(
    fx.receive(event({ reply: { ...event().reply, actorId: 'ou-other' } })),
  ).rejects.toThrow('untrusted-source');
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  expect(fx.runs).toHaveLength(0);
});

it('deduplicates redelivery and restart without duplicate admission, attention or reply', async () => {
  const fx = await fixture({
    onRun: async (run) => {
      const id = fx.core.attention
        .list({ botSlug: 'ada' })
        .items.find((item) => item.sourceKind === 'bridge-message')?.id;
      if (id) await run.externalMessaging?.reply(id, 'One reply');
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.receive();
  await fx.idle();
  await fx.restart();
  await fx.receive();
  await fx.idle();
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    1,
  );
  expect(fx.runs).toHaveLength(1);
  expect(fx.replies).toHaveLength(1);
  expect(fx.subscriptions).toBe(1);
});

it('fails closed for revocation, old callbacks, cross-Bot sources and stopped consumers', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  expect(() => fx.core.externalMessaging.inbound.read('other-bot', id)).toThrow(
    'source-unavailable',
  );
  fx.core.externalMessaging.revoke('ada', fx.grant.id);
  expect(fx.subscriptions).toBe(0);
  await expect(fx.receive()).rejects.toThrow();
  await expect(fx.core.externalMessaging.reply('ada', id, 'Forbidden')).rejects.toThrow(
    'source-unavailable',
  );
  expect(fx.core.externalMessaging.inbound.read('ada', id).body).toBe(event().text);
  expect(fx.replies).toHaveLength(0);
});

it('does not repeat unknown reply outcomes and refuses a changed payload for the same source', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw new Error('network uncertainty');
  });
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  expect((await fx.core.externalMessaging.reply('ada', id, 'hello')).state).toBe('unknown-outcome');
  await expect(fx.core.externalMessaging.reply('ada', id, 'different')).rejects.toThrow(
    'request-conflict',
  );
  expect(fx.replies).toHaveLength(1);
});

it('marks stale/deleted remote sources as definite failure rather than rerouting to a group send', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.setReply(async () => {
    throw Object.assign(new Error('stale'), { code: 'stale-route' });
  });
  expect(await fx.core.externalMessaging.reply('ada', id, 'hello')).toMatchObject({
    state: 'failed',
    reason: 'stale-route',
  });
  expect(fx.publicService.sendChecked).not.toHaveBeenCalled();
});

it('keeps receive lifecycle separate from proactive authorization and exposes it through the real RPC methods', async () => {
  const fx = await fixture();
  const methods = createBridgeMethods({ ...fx.core });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
  expect(
    await methods.messagingReceive({ slug: 'ada', grantId: fx.grant.id, enabled: true }),
  ).toEqual({ ok: true, value: { updated: true } });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('receiving');
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  expect(await methods.messagingSource({ slug: 'ada', sourceEventId: id })).toMatchObject({
    ok: true,
    value: { source: { body: event().text } },
  });
  expect(
    await methods.messagingReceive({ slug: 'other', grantId: fx.grant.id, enabled: false }),
  ).toMatchObject({ ok: false });
  await methods.messagingReceive({ slug: 'ada', grantId: fx.grant.id, enabled: false });
  expect(fx.subscriptions).toBe(0);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
});

it('keeps a failed external turn observable without an unbounded automatic retry', async () => {
  const fx = await fixture({
    onRun: async () => {
      throw new Error('known failure');
    },
  });
  await fx.enable();
  await fx.receive();
  await fx.idle();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT attempt_state, last_error FROM inbox_admissions WHERE reason = 'group-mention'",
    ),
  ).toEqual([{ attempt_state: 'retryable', last_error: 'Error: known failure' }]);
});

it('archives fail closed before admission and stops consumer loss from authorizing a reply', async () => {
  const fx = await fixture();
  await fx.enable();
  fx.core.registry.setPaused('ada', true);
  await expect(fx.receive()).rejects.toThrow('consumer-unavailable');
  expect(fx.query("SELECT * FROM source_events WHERE source_kind = 'bridge-message'")).toHaveLength(
    0,
  );
  fx.core.registry.setPaused('ada', false);
  await fx.receive();
  await fx.idle();
  const id = fx.core.attention.list({ botSlug: 'ada' }).items[0]!.id;
  fx.dispose();
  expect(fx.subscriptions).toBe(0);
  expect(fx.core.externalMessaging.inbound.available('ada', id)).toBe(false);
  await expect(fx.core.externalMessaging.reply('ada', id, 'no borrowed identity')).rejects.toThrow(
    'source-unavailable',
  );
});

it('recovers pending committed events only after its exclusive provider lease returns', async () => {
  const fx = await fixture();
  await fx.enable();
  await fx.receive();
  fx.dispose();
  await fx.idle();
  expect(fx.runs).toHaveLength(0);
  await fx.restart();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({ state: 'handled' });
});

it('uses existing group-mention steer when an Orchestrator is already active', async () => {
  let release: (() => void) | undefined;
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  const steer = vi.fn(() => true);
  const fx = await fixture({ steer, onRun: async () => waiting });
  await fx.enable();
  await fx.receive();
  await tick();
  expect(fx.runs).toHaveLength(1);
  const second = event({
    eventId: 'ev-2',
    messageId: 'om-2',
    text: 'second mention',
    reply: { ...event().reply, messageId: 'om-2' },
  });
  await fx.receive(second);
  await tick();
  expect(steer).toHaveBeenCalledWith('ada', expect.stringContaining('second mention'));
  release?.();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
  expect(fx.core.attention.list({ botSlug: 'ada' }).items.map((item) => item.state)).toEqual([
    'handled',
    'handled',
  ]);
});

it('restores exclusive intake after a cold-start account registration race without widening the grant', async () => {
  const fx = await fixture();
  await fx.enable();
  const revision = (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision;
  fx.setReady(false);
  await fx.restart();
  expect(fx.subscriptions).toBe(0);
  fx.setReady(true);
  await vi.waitFor(() => expect(fx.subscriptions).toBe(1), { timeout: 1500 });
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.revision).toBe(revision);
  await fx.receive();
  await fx.idle();
  expect(fx.runs).toHaveLength(1);
});

it('rejects an older receive toggle without stopping the newer authorized consumer', async () => {
  const fx = await fixture();
  await fx.enable();
  const describe = fx.publicService.describeBot;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let delayOnce = true;
  fx.publicService.describeBot = async (id) => {
    if (delayOnce) {
      delayOnce = false;
      await gate;
    }
    return describe(id);
  };
  const stale = fx.enable();
  await tick();
  await fx.enable();
  const current = (await fx.core.externalMessaging.snapshot('ada')).grants[0];
  expect(fx.subscriptions).toBe(1);
  release();
  await expect(stale).rejects.toThrow();
  expect(fx.subscriptions).toBe(1);
  expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
    revision: current?.revision,
    reception: 'receiving',
  });
});
