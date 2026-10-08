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

async function fixture() {
  const dshHome = createTempRoot('qq-post-');
  const core = createCore({ dshHome });
  cores.push(core);
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bea', displayName: 'Bea' });
  const fingerprint = 'd'.repeat(64);
  const transport: DshImOutboundService = {
    contractVersion: 1,
    receiptVersion: 1,
    postFenceVersion: 1,
    listBots: async () => [{ botId: 'qq-own', channel: 'qq' }],
    listTargets: async () => [
      { targetId: 'owner', name: 'Paired owner', kind: 'group', route: { groupOpenId: 'owner' } },
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
      ],
    }),
    sendChecked: vi.fn<DshImOutboundService['sendChecked']>(
      async (_account, _target, _text, options) => {
        expect(options.beforeSend?.()).toBe(true);
        return {
          sent: true,
          receipt: {
            version: 1,
            messageId: 'dsh-qq-client',
            conversationId: 'owner',
          },
        };
      },
    ),
  };
  const provider = createDshImProvider(transport, 'qq')!;
  core.externalMessaging.register(provider);
  const target = (await provider.targets('qq-own'))[0]!;
  const grant = await core.externalMessaging.authorize({
    botSlug: 'ada',
    providerId: provider.id,
    accountRef: 'qq-own',
    fingerprint,
    targetRef: 'owner',
    targetDigest: target.digest,
  });
  return { core, transport, provider, grant, dshHome };
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
    receipt: { messageId: 'dsh-qq-client', conversationId: 'owner' },
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
