import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun, BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'c'.repeat(64);
const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

function dm(id: string, overrides: Partial<MessagingInboundEvent> = {}): MessagingInboundEvent {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-app',
    fingerprint,
    eventId: `ev-${id}`,
    messageId: `om-${id}`,
    actor: { kind: 'user', id: 'ou_owner', name: 'Owner' },
    conversation: { kind: 'dm', id: 'oc_owner' },
    mentions: [],
    mentionedAccount: false,
    at: '2026-10-07T00:00:00.000Z',
    text: `hello ${id}`,
    reply: { messageId: `om-${id}`, conversationId: 'oc_owner', actorId: 'ou_owner' },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    ...overrides,
  };
}

function mention(id: string, mentioned = true): MessagingInboundEvent {
  return dm(id, {
    conversation: { kind: 'group', id: 'oc_team' },
    mentions: mentioned ? [{ id: 'ou-bot', key: '@_user_1' }] : [],
    mentionedAccount: mentioned,
    text: mentioned ? `@_user_1 question ${id}` : `chatter ${id}`,
    reply: {
      messageId: `om-${id}`,
      conversationId: 'oc_team',
      actorId: 'ou_owner',
      threadId: 'omt-topic',
      rootId: 'om-root',
    },
  });
}

type Platform = 'feishu' | 'slack' | 'discord' | 'weixin';

async function fixture(
  platform: Platform = 'feishu',
  targets: Awaited<ReturnType<DshImOutboundService['listTargets']>> = [],
) {
  const home = createTempRoot('botharness-default-traffic-');
  const runs: OrchestratorAgentRun[] = [];
  const agents: BotAgentAdapter = {
    async runOrchestrator(run) {
      runs.push(run);
    },
    async runAssignment() {},
    requestAssignment() {
      return { delivery: 'steer' };
    },
    async stopAssignment() {},
    async close() {},
  };
  let core = createCore({ dshHome: home, agents });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  let subscriptions = 0;
  const replies: { route: MessagingReplyRoute; text: string }[] = [];
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'lark-app', channel: platform }],
    listTargets: async () => targets,
    describeBot: async (botId) => ({
      version: 1,
      channel: platform,
      botId,
      account: { fingerprint, name: 'Support Lark app' },
      connected: true,
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'ordinary-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: async () => ({ sent: true as const }),
    consumeInbound: async (_id, input) => {
      ++subscriptions;
      consumer = input;
      return () => {
        --subscriptions;
      };
    },
    qualifyReplyChecked: async (_botId, route) => route,
    replyChecked: async (_botId, route, text, options) => {
      if (options.beforeSend && !options.beforeSend())
        throw Object.assign(new Error('stale-route'), { code: 'stale-route' });
      replies.push({ route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'reply-' + route.messageId,
          conversationId: route.conversationId,
        },
      };
    },
  };
  const register = () => core.externalMessaging.register(createDshImProvider(service, platform)!);
  let dispose = register();
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  const identity = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: `dsh-im/${platform}`,
    accountRef: 'lark-app',
    fingerprint,
  });
  await settle();
  const query = (sql: string) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    get core() {
      return core;
    },
    identity,
    runs,
    replies,
    query,
    settle,
    get subscriptions() {
      return subscriptions;
    },
    async receive(event: MessagingInboundEvent) {
      if (!consumer) throw new Error('Not subscribed');
      const result = await consumer.onEvent(
        { ...event, channel: platform },
        { signal: consumer.signal },
      );
      await settle();
      return result;
    },
    entries() {
      return query(
        "SELECT json_extract(body, '$.origin') AS origin, json_extract(body, '$.receiveScope.kind') AS kind, json_extract(body, '$.receiveScope.conversationId') AS conversation, revoked_at FROM messaging_grants ORDER BY created_at",
      );
    },
    admissions() {
      return query(
        "SELECT a.reason, json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM inbox_admissions a JOIN source_events e USING(source_event_id) ORDER BY e.created_at, messageId",
      );
    },
    sourceId(messageId: string) {
      return (
        query(
          `SELECT source_event_id FROM source_events WHERE json_extract(payload_json, '$.external.event.messageId') = '${messageId}'`,
        )[0] as { source_event_id: string }
      ).source_event_id;
    },
    async update(input: { enabled?: boolean; newConversations?: 'auto' | 'ask' }) {
      const current = (await core.externalMessaging.snapshot('ada')).identities![0]!;
      await core.externalMessaging.identity('ada', {
        kind: 'update',
        id: current.id,
        expectedRevision: current.revision,
        name: current.name,
        enabled: input.enabled ?? current.enabled,
        ...(input.newConversations ? { newConversations: input.newConversations } : {}),
      });
      await settle();
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
      await settle();
    },
  };
}

it('a bound Lark app admits a DM to the Inbox with no saved target and replies in the same DM', async () => {
  const fx = await fixture();
  expect(fx.identity.newConversations).toBe('auto');
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.identities?.[0]).toMatchObject({ reception: 'receiving' });
  expect(snapshot.grants).toEqual([]);
  await expect(fx.receive(dm('1'))).resolves.toEqual({ accepted: true });
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  expect(fx.runs).toHaveLength(1);
  expect(fx.runs[0]!.inbox).toContain('hello 1');
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi from Ada');
  await fx.settle();
  expect(fx.replies).toEqual([
    {
      route: { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      text: 'Hi from Ada',
    },
  ]);
  const after = await fx.core.externalMessaging.snapshot('ada');
  expect(after.grants).toHaveLength(1);
  expect(after.grants[0]).toMatchObject({
    origin: 'implicit',
    targetName: 'Owner',
    canPost: false,
    reception: 'receiving',
    lastMessageAt: expect.any(String),
  });
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toEqual([
    { reason: 'human-dm', messageId: 'om-1' },
    { reason: 'human-dm', messageId: 'om-2' },
  ]);
});

it('admits a group mention and replies in its topic, but leaves unmentioned group text alone', async () => {
  const fx = await fixture();
  await fx.receive(mention('quiet', false));
  expect(fx.entries()).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(mention('ask'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.receive(mention('quiet-2', false));
  expect(fx.admissions()).toHaveLength(1);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Answer');
  await fx.settle();
  expect(fx.replies[0]?.route).toMatchObject({
    conversationId: 'oc_team',
    threadId: 'omt-topic',
    rootId: 'om-root',
  });
});

it('keeps /pair with pairing and admits nothing for it', async () => {
  const fx = await fixture();
  await fx.receive(dm('pair', { text: '/pair' }));
  expect(fx.admissions()).toEqual([]);
  expect(fx.entries()).toEqual([]);
  expect((await fx.core.externalMessaging.snapshot('ada')).pairings).toHaveLength(1);
});

it('admits nothing from new conversations in ask mode while existing entries keep working', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ newConversations: 'ask' });
  expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
    newConversations: 'ask',
  });
  await fx.receive(mention('new-group'));
  expect(fx.entries()).toHaveLength(1);
  await fx.receive(dm('2'));
  expect(fx.admissions().map((row) => (row as { messageId: string }).messageId)).toEqual([
    'om-1',
    'om-2',
  ]);
});

it('keeps entries across a restart and keeps admitting without duplicates', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.restart();
  await fx.receive(dm('1'));
  await fx.receive(dm('2'));
  expect(fx.entries()).toHaveLength(1);
  expect(fx.admissions()).toHaveLength(2);
  expect(fx.subscriptions).toBe(1);
});

it('stops admission on pause and invalidates entries on unbind', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  await fx.update({ enabled: false });
  expect(fx.subscriptions).toBe(0);
  await fx.update({ enabled: true });
  await fx.receive(dm('2'));
  expect(fx.admissions()).toHaveLength(2);
  const current = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: current.id,
    expectedRevision: current.revision,
  });
  await fx.settle();
  expect(fx.subscriptions).toBe(0);
  expect(fx.entries()).toEqual([
    {
      origin: 'implicit',
      kind: 'dm',
      conversation: 'oc_owner',
      revoked_at: expect.any(String),
    },
  ]);
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-2'), 'too late'),
  ).rejects.toThrow();
});

it.each(['slack', 'discord'] as const)(
  'a bound %s app admits DMs and mentions and replies in place',
  async (platform) => {
    const fx = await fixture(platform);
    expect((await fx.core.externalMessaging.snapshot('ada')).identities?.[0]).toMatchObject({
      reception: 'receiving',
    });
    await fx.receive(dm('1'));
    await fx.receive(mention('quiet', false));
    await fx.receive(mention('ask'));
    expect(fx.entries()).toEqual([
      { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
      { origin: 'implicit', kind: 'group', conversation: 'oc_team', revoked_at: null },
    ]);
    expect(fx.admissions()).toEqual([
      { reason: 'human-dm', messageId: 'om-1' },
      { reason: 'group-mention', messageId: 'om-ask' },
    ]);
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'DM answer');
    await fx.core.externalMessaging.reply('ada', fx.sourceId('om-ask'), 'Topic answer');
    await fx.settle();
    expect(fx.replies.map((item) => item.route)).toEqual([
      { messageId: 'om-1', conversationId: 'oc_owner', actorId: 'ou_owner' },
      expect.objectContaining({ conversationId: 'oc_team', threadId: 'omt-topic' }),
    ]);
  },
);

it('a bound WeChat app admits only its paired owner DM', async () => {
  const fx = await fixture('weixin', [
    { targetId: 'owner', name: 'QR paired owner', kind: 'user', route: { toUserId: 'oc_owner' } },
  ]);
  await fx.receive(
    dm('stranger', {
      conversation: { kind: 'dm', id: 'oc_stranger' },
      reply: { messageId: 'om-stranger', conversationId: 'oc_stranger', actorId: 'ou_owner' },
    }),
  );
  await fx.receive(mention('group'));
  expect(fx.entries()).toEqual([]);
  await fx.receive(dm('1'));
  expect(fx.entries()).toEqual([
    { origin: 'implicit', kind: 'dm', conversation: 'oc_owner', revoked_at: null },
  ]);
  expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: 'om-1' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'Hi owner');
  await fx.settle();
  expect(fx.replies).toHaveLength(1);
});

it('a recorded group follows the platform default: collecting all text admits unmentioned messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  await fx.receive(mention('quiet', false));
  expect(fx.admissions()).toHaveLength(1);
  const defaults = fx.core.externalMessaging.defaults('feishu');
  const { revision, changedAt: _at, ...preferences } = defaults;
  await fx.core.externalMessaging.setDefaults({
    ...preferences,
    expectedRevision: revision,
    collection: 'all',
  });
  await fx.settle();
  await fx.receive(mention('chatter', false));
  expect(fx.admissions()).toEqual([
    { reason: 'group-mention', messageId: 'om-ask' },
    { reason: 'group-ordinary', messageId: 'om-chatter' },
  ]);
});

async function grantFor(fx: Awaited<ReturnType<typeof fixture>>, conversation: string) {
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  return snapshot.grants.find(
    (grant) => !grant.revokedAt && grant.receiveScope?.conversationId === conversation,
  )!;
}

it('blocking an entry stops admission and survives restart and rebind; allowing again admits only new messages', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await fx.receive(mention('after-block'));
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-ask' }]);
  await fx.restart();
  await fx.receive(mention('after-restart'));
  expect(fx.admissions()).toHaveLength(1);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      bindingId: snapshot.identities![0]!.id,
      revision: 1,
    }),
  ]);
  const identity = snapshot.identities![0]!;
  await fx.core.externalMessaging.identity('ada', {
    kind: 'unbind',
    id: identity.id,
    expectedRevision: identity.revision,
  });
  await fx.settle();
  const rebound = await fx.core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'lark-app',
    fingerprint,
  });
  await fx.settle();
  await fx.receive(mention('after-rebind'));
  expect(fx.admissions()).toHaveLength(1);
  const blocked = (await fx.core.externalMessaging.snapshot('ada')).blockedConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: rebound.id,
    conversation: blocked.conversation,
    from: 'blocked',
    expectedRevision: blocked.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).blockedConversations).toEqual([]);
  await fx.receive(mention('allowed'));
  expect(
    fx
      .admissions()
      .map((row) => (row as { messageId: string }).messageId)
      .sort(),
  ).toEqual(['om-allowed', 'om-ask']);
});

it('a stale revision is refused and blocking revokes the old reply route', async () => {
  const fx = await fixture();
  await fx.receive(dm('1'));
  const grant = await grantFor(fx, 'oc_owner');
  await expect(
    fx.core.externalMessaging.conversation('ada', {
      kind: 'block',
      grantId: grant.id,
      expectedRevision: grant.revision + 5,
    }),
  ).rejects.toMatchObject({ code: 'conversation-stale' });
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block',
    grantId: grant.id,
    expectedRevision: grant.revision,
  });
  await fx.settle();
  await expect(
    fx.core.externalMessaging.reply('ada', fx.sourceId('om-1'), 'too late'),
  ).rejects.toThrow();
  expect(fx.replies).toEqual([]);
});

it('a muted entry is admitted silently without a run and can still be answered', async () => {
  const fx = await fixture();
  await fx.receive(mention('ask'));
  expect(fx.runs).toHaveLength(1);
  const grant = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: grant.id,
    expectedRevision: grant.preferenceRevision ?? 0,
    muted: true,
  });
  await fx.settle();
  expect(await grantFor(fx, 'oc_team')).toMatchObject({ muted: true, revision: grant.revision });
  await fx.receive(mention('muted'));
  expect(fx.runs).toHaveLength(1);
  expect(
    fx.query(
      "SELECT a.wake_mode FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE json_extract(e.payload_json, '$.external.event.messageId') = 'om-muted'",
    ),
  ).toEqual([{ wake_mode: 'silent' }]);
  await fx.core.externalMessaging.reply('ada', fx.sourceId('om-muted'), 'Seen');
  await fx.settle();
  expect(fx.replies.map((item) => item.text)).toEqual(['Seen']);
  const muted = await grantFor(fx, 'oc_team');
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'mute',
    grantId: muted.id,
    expectedRevision: muted.preferenceRevision ?? 0,
    muted: false,
  });
  await fx.settle();
  await fx.receive(mention('loud'));
  expect(fx.runs).toHaveLength(2);
});

it('ask mode holds a new conversation without a Source Event until it is allowed', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(mention('first'));
  await fx.receive(mention('second'));
  expect(fx.query('SELECT count(*) AS n FROM source_events')).toEqual([{ n: 0 }]);
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([
    expect.objectContaining({
      conversation: { kind: 'group', id: 'oc_team' },
      reason: 'ask',
      count: 2,
    }),
  ]);
  const held = snapshot.heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'allow',
    bindingId: held.bindingId,
    conversation: held.conversation,
    from: 'held',
    expectedRevision: held.revision,
  });
  await fx.settle();
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([]);
  expect(fx.admissions()).toEqual([]);
  await fx.receive(mention('third'));
  expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: 'om-third' }]);
});

it('blocking a held conversation keeps it out of the Inbox', async () => {
  const fx = await fixture();
  await fx.update({ newConversations: 'ask' });
  await fx.receive(dm('1'));
  const held = (await fx.core.externalMessaging.snapshot('ada')).heldConversations![0]!;
  await fx.core.externalMessaging.conversation('ada', {
    kind: 'block-held',
    bindingId: held.bindingId,
    conversation: held.conversation,
    expectedRevision: held.revision,
  });
  await fx.update({ newConversations: 'auto' });
  await fx.receive(dm('2'));
  const snapshot = await fx.core.externalMessaging.snapshot('ada');
  expect(snapshot.heldConversations).toEqual([]);
  expect(snapshot.blockedConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_owner' }, name: 'Owner' }),
  ]);
  expect(fx.admissions()).toEqual([]);
});

it('holds new conversations past the hourly limit instead of creating entries', async () => {
  const fx = await fixture();
  for (let i = 0; i < 21; i++)
    await fx.receive(
      dm(`n${i}`, {
        conversation: { kind: 'dm', id: `oc_${i}` },
        reply: { messageId: `om-n${i}`, conversationId: `oc_${i}`, actorId: 'ou_owner' },
      }),
    );
  expect(fx.entries()).toHaveLength(20);
  expect((await fx.core.externalMessaging.snapshot('ada')).heldConversations).toEqual([
    expect.objectContaining({ conversation: { kind: 'dm', id: 'oc_20' }, reason: 'hourly-limit' }),
  ]);
});

it('syncs an implicit group entry into a Channel, which then receives its later mentions', async () => {
  const fx = await fixture();
  await fx.receive(mention('first'));
  const entry = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!;
  const room = fx.core.channels.createGroup({ name: 'Team room', members: ['ada'] });
  await fx.core.externalMessaging.inbound.channelBridge(room.id, {
    kind: 'add',
    grantId: entry.id,
    expectedGrantRevision: entry.revision,
    delivery: 'channel',
    name: 'Team',
    enabled: true,
    collection: 'mentions',
    collectionInheritance: 'inherit',
  });
  await fx.receive({ ...mention('second'), at: new Date(Date.now() + 1000).toISOString() });
  const placed = fx.query(
    `SELECT json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM channel_placements p JOIN source_events e USING(source_event_id) WHERE p.channel_id = '${room.id}'`,
  );
  expect(placed).toEqual([{ messageId: 'om-second' }]);
  const routes = (await fx.core.externalMessaging.snapshot('ada')).grants[0]!.bridgeRoutes;
  expect(routes?.map((route) => route.channelId)).toContain(room.id);
  const synced = await fx.core.externalMessaging.channelBridges(room.id);
  expect(synced.bridges.map((row) => [row.name, row.delivery])).toEqual([['Team', 'channel']]);
  const dm = fx.core.channels.getOrCreateDm('ada', 'Ada')!;
  expect((await fx.core.externalMessaging.channelBridges(dm.id)).bridges).toEqual([]);
});
