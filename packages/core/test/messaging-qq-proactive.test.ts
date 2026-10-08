import { afterEach, expect, it, vi } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function fixture(receive = false) {
  const dshHome = createTempRoot('qq-post-');
  const core = createCore({ dshHome });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bea', displayName: 'Bea' });
  const fingerprint = 'd'.repeat(64);
  type Consumer = Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  let consumer: Consumer | undefined;
  let ready!: () => void;
  const consumerReady = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    ...(receive
      ? {
          replyContextVersion: 1 as const,
          replyReceiptVersion: 1 as const,
          replyFenceVersion: 1 as const,
          consumeInbound: async (_account: string, input: Consumer) => {
            consumer = input;
            ready();
            return () => {};
          },
          qualifyReplyChecked: async () => {
            throw Object.assign(new Error('unused reply'), { code: 'stale-route' });
          },
          replyChecked: async () => {
            throw new Error('unexpected reply');
          },
        }
      : {}),
    postFenceVersion: 1,
    listBots: async () => [{ botId: 'qq-own', channel: 'qq' }],
    listTargets: async () => [
      { targetId: 'qa-group', name: 'QA group', kind: 'group', route: { groupOpenId: 'qa-group' } },
    ],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'qq',
      connected: true,
      account: { fingerprint, name: 'Own QQ' },
      capabilities: [
        'proactive-text-checked',
        'proactive-receipt-checked',
        'proactive-fence-checked',
        ...(receive
          ? [
              'exclusive-text-consumer',
              'reply-text-checked',
              'reply-context-checked',
              'reply-receipt-checked',
              'reply-fence-checked',
            ]
          : []),
      ],
    }),
    sendChecked: vi.fn<DshImOutboundService['sendChecked']>(
      async (_account, _target, _text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: 'native-qq-post',
            conversationId: 'qa-group',
          },
        };
      },
    ),
  };
  const provider = createDshImProvider(transport, 'qq')!;
  core.externalMessaging.register(provider);
  if (receive) {
    await core.externalMessaging.identity('ada', {
      kind: 'bind',
      providerId: provider.id,
      accountRef: 'qq-own',
      fingerprint,
    });
    await consumerReady;
  }
  const target = (await provider.targets('qq-own'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'qq-own',
    fingerprint,
    targetRef: 'qa-group',
    targetDigest: target.digest,
  });
  return {
    core,
    transport,
    provider,
    grant,
    dshHome,
    async receive() {
      if (!consumer) throw new Error('QQ receiver unavailable');
      await consumer.onEvent(
        {
          version: 1,
          channel: 'qq',
          botId: 'qq-own',
          fingerprint,
          eventId: 'source-one',
          messageId: 'source-one',
          actor: { kind: 'user', id: 'human-one' },
          conversation: { kind: 'group', id: 'qa-group' },
          mentions: [],
          mentionedAccount: true,
          at: new Date(Date.now() + 1000).toISOString(),
          text: 'source question',
          reply: { messageId: 'source-one', conversationId: 'qa-group', actorId: 'human-one' },
          replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
        },
        { signal: consumer.signal },
      );
      const received = (await core.externalMessaging.snapshot('ada')).grants.find(
        (g) => g.origin === 'implicit',
      );
      if (!received) throw new Error('No received conversation');
      return received;
    },
  };
}

it('qualified QQ post is external-only, current-own-authorized and idempotent through the Profile RPC', async () => {
  const { core, transport, grant } = await fixture();
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  const before = core.channels.readMessages(dm.id);
  expect((await core.externalMessaging.snapshot('ada')).grants[0]?.canPost).toBe(true);
  const bridge = createBridgeMethods(core);
  const input = {
    slug: 'ada',
    grantId: grant.id,
    requestId: 'unique_report_910',
    text: 'ONE unsolicited report',
  };
  const result = await bridge.messagingSend(input);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error('post failed');
  expect(result.value.intent).toMatchObject({
    state: 'provider-accepted',
    report: { platform: 'qq' },
    receipt: { messageId: 'native-qq-post', conversationId: 'qa-group' },
  });
  expect((await core.externalMessaging.post('ada', grant.id, input.requestId, input.text)).id).toBe(
    result.value.intent.id,
  );
  expect(transport.sendChecked).toHaveBeenCalledTimes(1);
  expect(core.channels.readMessages(dm.id)).toEqual(before);
  await expect(
    core.externalMessaging.post('bea', grant.id, 'borrowed_report', 'refuse'),
  ).rejects.toThrow('grant-unavailable');
  core.externalMessaging.revoke('ada', grant.id);
  expect(core.externalMessaging.inspectIntent('ada', result.value.intent.id).text).toBe(input.text);
  await expect(
    core.externalMessaging.post('ada', grant.id, 'revoked_report', 'refuse'),
  ).rejects.toThrow('grant-revoked');
});

it.each([
  ['send-rate-limited', 'failed'],
  ['send-permission-denied', 'failed'],
  ['send-result-unknown', 'unknown-outcome'],
] as const)('QQ %s remains %s without automatic resending', async (code, state) => {
  const { core, transport, grant } = await fixture();
  let nativeAttempts = 0;
  transport.sendChecked = async () => {
    nativeAttempts++;
    throw Object.assign(new Error('private provider detail'), { code });
  };
  const intent = await core.externalMessaging.post('ada', grant.id, 'qq_outcome_report', 'report');
  expect(intent.state).toBe(state);
  expect(intent.reason).toBe(code === 'send-result-unknown' ? 'provider-result-unknown' : code);
  expect(
    (await core.externalMessaging.post('ada', grant.id, 'qq_outcome_report', 'report')).id,
  ).toBe(intent.id);
  expect(nativeAttempts).toBe(1);
});

it('QQ unknown survives restart with the same retained request and no resend', async () => {
  const { core, transport, provider, grant, dshHome } = await fixture();
  let nativeAttempts = 0;
  transport.sendChecked = async () => {
    nativeAttempts++;
    throw Object.assign(new Error('lost native response'), { code: 'send-result-unknown' });
  };
  const intent = await core.externalMessaging.post(
    'ada',
    grant.id,
    'qq_restart_report',
    'retained result',
  );
  expect(intent.state).toBe('unknown-outcome');
  core.externalMessaging.close();
  await core.runtime.close();
  core.operationalDatabase.close();
  cores.splice(cores.indexOf(core), 1);
  const restored = createCore({ dshHome });
  cores.push(restored);
  restored.externalMessaging.register(provider);
  expect(restored.externalMessaging.inspectIntent('ada', intent.id)).toMatchObject({
    state: 'unknown-outcome',
    text: 'retained result',
    reason: 'provider-result-unknown',
  });
  expect(
    (await restored.externalMessaging.post('ada', grant.id, 'qq_restart_report', 'retained result'))
      .id,
  ).toBe(intent.id);
  expect(nativeAttempts).toBe(1);
});

it('QQ saved-target post refuses revocation at the final native-send fence', async () => {
  const { core, transport, grant } = await fixture();
  let nativeAttempts = 0;
  transport.sendChecked = async (_account, _target, _text, options) => {
    core.externalMessaging.revoke('ada', grant.id);
    if (options.beforeSend?.() !== true)
      throw Object.assign(new Error('revoked'), { code: 'send-permission-denied' });
    nativeAttempts++;
    return { sent: true };
  };
  expect(
    (await core.externalMessaging.post('ada', grant.id, 'qq_revoked_report', 'refuse')).state,
  ).not.toBe('provider-accepted');
  expect(nativeAttempts).toBe(0);
});

it('QQ hides unfenced Provider posting and rejects a foreign-group receipt as unknown', async () => {
  const { core, transport, grant } = await fixture();
  expect(
    createDshImProvider({ ...transport, postFenceVersion: undefined }, 'qq')!.post,
  ).toBeUndefined();
  transport.sendChecked = async () => ({
    sent: true,
    receipt: { version: 1, messageId: 'foreign-message', conversationId: 'foreign-group' },
  });
  expect(
    (await core.externalMessaging.post('ada', grant.id, 'qq_foreign_report', 'report')).state,
  ).toBe('unknown-outcome');
});

it.each(['before-post', 'during-preparation'] as const)(
  'QQ saved target honors a received-conversation block %s',
  async (phase) => {
    const fx = await fixture(true);
    const received = await fx.receive();
    const block = () =>
      fx.core.externalMessaging.conversation('ada', {
        kind: 'block',
        grantId: received.id,
        expectedRevision: received.revision,
      });
    let nativeAttempts = 0;
    fx.transport.sendChecked = async (_account, _target, _text, options) => {
      if (phase === 'during-preparation') await block();
      if (options.beforeSend?.() !== true)
        throw Object.assign(new Error('blocked before native dispatch'), {
          code: 'send-permission-denied',
        });
      nativeAttempts++;
      return {
        sent: true,
        receipt: { version: 1, messageId: 'forbidden-post', conversationId: 'qa-group' },
      };
    };
    if (phase === 'before-post') {
      await block();
      await expect(
        fx.core.externalMessaging.post('ada', fx.grant.id, 'qq_blocked_report', 'refuse'),
      ).rejects.toThrow('conversation-blocked');
    } else {
      expect(
        (await fx.core.externalMessaging.post('ada', fx.grant.id, 'qq_blocked_report', 'refuse'))
          .state,
      ).toBe('failed');
    }
    expect(nativeAttempts).toBe(0);
  },
);
