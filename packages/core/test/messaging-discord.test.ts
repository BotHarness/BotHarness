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

it.each([
  {
    name: 'channel nearby context',
    nearby: true,
    threadId: undefined,
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'thread nearby context',
    nearby: true,
    threadId: '555555555555555555',
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'channel reply',
    nearby: false,
    threadId: undefined,
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'thread reply',
    nearby: false,
    threadId: '555555555555555555',
    refusal: undefined,
    state: 'provider-accepted',
    reason: undefined,
  },
  {
    name: 'deleted source',
    nearby: false,
    threadId: undefined,
    refusal: 'source-not-found',
    state: 'failed',
    reason: 'source-not-found',
  },
  {
    name: 'thread permission refusal',
    nearby: false,
    threadId: '555555555555555555',
    refusal: 'reply-permission-denied',
    state: 'failed',
    reason: 'reply-permission-denied',
  },
  {
    name: 'unknown transport outcome',
    nearby: false,
    threadId: undefined,
    refusal: 'reply-result-unknown',
    state: 'unknown-outcome',
    reason: 'provider-result-unknown',
  },
])(
  'Discord canonical Inbox and own-identity reply preserve $name outcome',
  async ({ threadId, refusal, state, reason, nearby }) => {
    const fingerprint = 'd'.repeat(64);
    let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    let runs = 0;
    let replyCalls = 0;
    let historyCalls = 0;
    let outcome: unknown;
    let core: BotHarnessCore;
    const replies: { account: string; route: MessagingReplyRoute; text: string }[] = [];
    core = createCore({
      dshHome: createTempRoot('botharness-discord-'),
      agents: {
        async runOrchestrator(run) {
          runs++;
          const attentionSource = core.attention
            .list({ botSlug: 'ada' })
            .items.find((item) => item.sourceKind === 'bridge-message');
          expect(attentionSource).toBeDefined();
          const context = await run.externalMessaging!.context(attentionSource!.id, {
            scope: nearby ? 'nearby' : threadId ? 'thread' : 'group',
          });
          expect(context.messages.map((message) => message.text)).toEqual(
            nearby ? [source.text, 'cobalt-37'] : ['cobalt-37'],
          );
          if (nearby) expect(context.window).toEqual({ start: 1000, end: 1601 });
          outcome = await run.externalMessaging!.reply(attentionSource!.id, 'DISCORD-QA-OK');
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
          'history-text-checked',
          'thread-history-text-checked',
        ],
      }),
      sendChecked: vi.fn(async (): Promise<{ sent: true }> => ({ sent: true })),
      consumeInbound: async (_account, options) => {
        expect(options.ordinaryText).toBeUndefined();
        expect(options.sourceFiles).toBeUndefined();
        consumer = options;
        return () => {};
      },
      historyChecked: async (account, route, query, options) => {
        historyCalls++;
        expect(account).toBe('discord-qa');
        expect(options.expectedFingerprint).toBe(fingerprint);
        expect(route).toEqual(source.reply);
        expect(query.limit).toBe(20);
        if (nearby)
          expect(query).toMatchObject({ scope: 'nearby', beforeCount: 10, afterCount: 5 });
        return {
          version: 1,
          scope: query.scope,
          ...(nearby ? { window: { start: 1000, end: 1601 } } : {}),
          events: [
            ...(nearby ? [source] : []),
            {
              ...source,
              eventId: 'history:qa:700000000000000000',
              messageId: '700000000000000000',
              mentionedAccount: false,
              mentions: [],
              text: 'cobalt-37',
              reply: { ...source.reply, messageId: '700000000000000000' },
            },
          ],
          omitted: 0,
          hasMore: false,
          coverage: 'provider-visible-human-text',
        };
      },
      qualifyReplyChecked: async (_account, route) => route,
      replyChecked: async (account, route, text, options) => {
        replyCalls++;
        if (refusal) throw Object.assign(new Error(refusal), { code: refusal });
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
    expect(replyCalls).toBe(1);
    expect(historyCalls).toBe(1);
    expect(outcome).toMatchObject({ state, ...(reason ? { reason } : {}) });
    expect(replies).toEqual(
      refusal ? [] : [{ account: 'discord-qa', route: source.reply, text: 'DISCORD-QA-OK' }],
    );
    expect(transport.sendChecked).not.toHaveBeenCalled();
    expect(core.externalMessaging.history('ada')).toHaveLength(1);
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
    ).toHaveLength(2);
    expect(
      db.read((database) => database.prepare('SELECT * FROM inbox_admissions').all()),
    ).toHaveLength(1);
    expect(
      db.read((database) => database.prepare('SELECT * FROM channel_placements').all()),
    ).toHaveLength(0);
    await expect(
      core.externalMessaging.inbound.context(
        'other-bot',
        core.attention.list({ botSlug: 'ada' }).items[0]!.id,
        'borrow-context',
        { scope: 'group' },
      ),
    ).rejects.toThrow();
    expect(historyCalls).toBe(1);
    const anchor = core.attention.list({ botSlug: 'ada' }).items[0]!.id;
    await core.externalMessaging.revoke('ada', grant.id);
    await expect(
      core.externalMessaging.inbound.context('ada', anchor, 'revoked-context', {
        scope: 'group',
      }),
    ).rejects.toThrow('source-unavailable');
    expect(historyCalls).toBe(1);
    await expect(consumer!.onEvent(source, { signal: consumer!.signal })).rejects.toThrow();
    expect(replies).toHaveLength(refusal ? 0 : 1);
    expect(replyCalls).toBe(1);
  },
);
