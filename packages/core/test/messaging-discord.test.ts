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

it.each([undefined, '555555555555555555'])(
  'Discord mention retains exact channel/thread %s through canonical Inbox and own-identity reply',
  async (threadId) => {
    const fingerprint = 'd'.repeat(64);
    let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    let runs = 0;
    let core: BotHarnessCore;
    const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
    core = createCore({
      dshHome: createTempRoot('botharness-discord-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          const source = core.attention
            .list({ botSlug: 'ada' })
            .items.find((item) => item.sourceKind === 'bridge-message');
          expect(source).toBeDefined();
          await run.externalMessaging!.reply(source!.id, 'DISCORD-QA-OK');
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
      listBots: async () => [{ botId: 'discord-qa', channel: 'discord' }],
      listTargets: async () => [
        {
          targetId: 'qa',
          name: 'Discord QA channel',
          kind: 'channel',
          route: { channelId: '444444444444444444' },
        },
      ],
      describeBot: async (botId) => ({
        version: 1,
        botId,
        channel: 'discord',
        connected: true,
        account: { fingerprint, name: 'Discord QA Bot' },
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
      consumeInbound: async (_account, options) => {
        expect(options.ordinaryText).toBeUndefined();
        expect(options.sourceFiles).toBeUndefined();
        consumer = options;
        return () => {};
      },
      qualifyReplyChecked: async (_account, route) => route,
      replyChecked: async (account, route, text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        replies.push({ account, route, text });
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: '999999999999999999',
            conversationId: route.conversationId,
          },
        };
      },
    };
    const provider = createDshImProvider(transport, 'discord')!;
    core.externalMessaging.register(provider);
    expect(await createDshImProvider(transport, 'slack')!.accounts()).toEqual([]);
    expect(provider.post).toBeUndefined();
    expect(provider.readFile).toBeUndefined();
    const target = (await core.externalMessaging.targets(provider.id, 'discord-qa'))[0]!;
    expect(target.receiveScope).toEqual({ kind: 'group', conversationId: '444444444444444444' });
    const grant = await core.externalMessaging.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'discord-qa',
      targetRef: 'qa',
      fingerprint,
      targetDigest: target.digest,
    });
    await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
    const source: MessagingInboundEvent = {
      version: 1,
      channel: 'discord',
      botId: 'discord-qa',
      fingerprint,
      eventId: 'gateway:qa:42',
      messageId: '777777777777777777',
      actor: { kind: 'user', id: '666666666666666666', name: 'QA Human' },
      conversation: { kind: 'group', id: '444444444444444444' },
      mentions: [{ id: '111111111111111111', key: '<@111111111111111111>' }],
      mentionedAccount: true,
      at: new Date().toISOString(),
      text: '<@111111111111111111> Reply here',
      reply: {
        messageId: '777777777777777777',
        actorId: '666666666666666666',
        conversationId: '444444444444444444',
        ...(threadId ? { threadId } : {}),
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    };
    await expect(
      consumer!.onEvent({ ...source, channel: 'slack' }, { signal: consumer!.signal }),
    ).rejects.toThrow('untrusted-source');
    await expect(
      consumer!.onEvent({ ...source, botId: 'wrong-account' }, { signal: consumer!.signal }),
    ).rejects.toThrow('untrusted-source');
    await consumer!.onEvent(source, { signal: consumer!.signal });
    await consumer!.onEvent({ ...source, eventId: 'gateway:qa:43' }, { signal: consumer!.signal });
    await tick();
    await core.runtime.whenIdle();
    await tick();
    expect(runs).toBe(1);
    expect(replies).toEqual([
      { account: 'discord-qa', route: source.reply, text: 'DISCORD-QA-OK' },
    ]);
    expect(core.attention.list({ botSlug: 'ada' }).items[0]).toMatchObject({
      externalOrigin: {
        platform: 'discord',
        conversationName: 'Discord QA channel',
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
      db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
    ).toHaveLength(1);
    expect(
      db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
    ).toHaveLength(0);
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(consumer!.onEvent(source, { signal: consumer!.signal })).rejects.toThrow();
    expect(replies).toHaveLength(1);
  },
);
