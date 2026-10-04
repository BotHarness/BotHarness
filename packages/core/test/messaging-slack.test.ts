import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import type { MessagingInboundEvent, MessagingReplyRoute } from '../src/messaging/provider.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('Slack @ enters canonical Inbox once, retains native thread and replies through its own identity', async () => {
  const fingerprint = 'a'.repeat(64);
  let callback: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
  let runs = 0;
  let core: BotHarnessCore;
  const replies: { botId: string; route: MessagingReplyRoute; text: string }[] = [];
  core = createCore({
    dshHome: createTempRoot('botharness-slack-'),
    agents: {
      async runOrchestrator(run) {
        runs++;
        const source = core.attention
          .list({ botSlug: 'ada' })
          .items.find((item) => item.sourceKind === 'bridge-message');
        expect(source).toBeDefined();
        await run.externalMessaging?.reply(source!.id, 'SLACK-QA-OK');
      },
      async runAssignment() {},
      requestAssignment() {
        return { delivery: 'steer' };
      },
      async stopAssignment() {},
      async close() {},
    },
  });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'slack-qa', channel: 'slack' }],
    listTargets: async () => [
      {
        targetId: 'qa',
        name: 'botharness-im-qa-802',
        kind: 'conversation',
        route: { channelId: 'C12345678' },
      },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'slack',
      connected: true,
      account: { fingerprint, name: 'Slack QA Bot' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    sendChecked: vi.fn(async (): Promise<{ sent: true }> => ({ sent: true })),
    consumeInbound: async (_id, input) => {
      callback = input;
      return () => {};
    },
    qualifyReplyChecked: async (_id, route) => route,
    replyChecked: async (botId, route, text, options) => {
      expect(options.beforeSend?.()).toBe(true);
      replies.push({ botId, route, text });
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: '1791127737.000001',
          conversationId: route.conversationId,
        },
      };
    },
  };
  const slack = createDshImProvider(transport, 'slack')!;
  const lark = createDshImProvider(transport)!;
  expect(slack.history).toBeUndefined();
  expect(slack.readFile).toBeUndefined();
  expect(slack.post).toBeUndefined();
  core.externalMessaging.register(slack);
  core.externalMessaging.register(lark);
  expect(await lark.accounts()).toEqual([]);
  const targets = await core.externalMessaging.targets(slack.id, 'slack-qa');
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: slack.id,
    accountRef: 'slack-qa',
    targetRef: 'qa',
    fingerprint,
    targetDigest: targets[0]!.digest,
  });
  await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
  expect(callback).toBeDefined();
  const source: MessagingInboundEvent = {
    version: 1,
    channel: 'slack',
    botId: 'slack-qa',
    fingerprint,
    eventId: 'Ev12345678',
    messageId: '1791127736.123456',
    actor: { kind: 'user', id: 'U87654321', name: 'QA Human' },
    conversation: { kind: 'group', id: 'C12345678' },
    mentions: [{ id: 'U12345678', key: '<@U12345678>' }],
    mentionedAccount: true,
    at: '2026-10-05T00:00:00.000Z',
    text: '<@U12345678> Reply in the thread',
    reply: {
      messageId: '1791127736.123456',
      conversationId: 'C12345678',
      actorId: 'U87654321',
      threadId: '1791127600.000001',
      rootId: '1791127600.000001',
    },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
  await callback!.onEvent(source, { signal: callback!.signal });
  await callback!.onEvent({ ...source, eventId: 'EvRedelivery' }, { signal: callback!.signal });
  await tick();
  await core.runtime.whenIdle();
  await tick();
  expect(runs).toBe(1);
  expect(replies).toEqual([{ botId: 'slack-qa', route: source.reply, text: 'SLACK-QA-OK' }]);
  expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
    authorKind: 'bridged',
    externalOrigin: {
      platform: 'slack',
      conversationName: 'botharness-im-qa-802',
      senderName: 'QA Human',
    },
  });
  const db = attachOperationalModule(core.operationalDatabase, 'test');
  expect(
    db.read((database) =>
      database.prepare("SELECT * FROM source_events WHERE source_kind = 'bridge-message'").all(),
    ),
  ).toHaveLength(1);
  expect(
    db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
  ).toHaveLength(0);
  await expect(
    callback!.onEvent({ ...source, channel: 'feishu' }, { signal: callback!.signal }),
  ).rejects.toThrow('untrusted-source');
  await core.externalMessaging.revoke('ada', grant.id);
  await expect(callback!.onEvent(source, { signal: callback!.signal })).rejects.toThrow();
});
