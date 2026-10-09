import { afterEach, expect, it } from 'vitest';
import { createCore, type BotHarnessCore } from '../src/plugin.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createTempRoot } from './helpers.js';

const cores: BotHarnessCore[] = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

it('a bound app posts to a reachable group without saved targets or an inbound Source Event', async () => {
  const fingerprint = 'a'.repeat(64);
  const posts: string[] = [];
  const transport: DshImOutboundService = {
    contractVersion: 1,
    reachableConversationVersion: 1,
    listBots: async () => [{ botId: 'qa', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'qa',
      channel: 'feishu',
      connected: true,
      account: { fingerprint },
      capabilities: ['proactive-text-checked', 'reachable-conversations-checked'],
    }),
    sendChecked: async () => {
      throw new Error('No saved target is allowed');
    },
    listReachableConversations: async () => ({
      version: 1,
      conversations: [{ id: 'oc_new', kind: 'group', name: 'New QA group' }],
      hasMore: false,
    }),
    postConversationChecked: async (_app, conversationId, text, options) => {
      expect(options.beforeSend()).toBe(true);
      posts.push(text);
      return { sent: true, receipt: { version: 1, messageId: 'om_first', conversationId } };
    },
  };
  const core = createCore({ dshHome: createTempRoot('reachable-') });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const provider = createDshImProvider(transport)!;
  core.externalMessaging.register(provider);
  const binding = await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: provider.id,
    accountRef: 'qa',
    fingerprint,
  });
  const page = await core.externalMessaging.reachable('ada', binding.id);
  expect(page.conversations).toEqual([{ id: 'oc_new', kind: 'group', name: 'New QA group' }]);
  const result = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'first-request',
    'First report',
  );
  expect(result.state).toBe('provider-accepted');
  expect(result.sourceEventId).toBeUndefined();
  expect(result.receipt?.messageId).toBe('om_first');
  const snapshot = await core.externalMessaging.snapshot('ada');
  expect(snapshot.grants).toHaveLength(1);
  expect(snapshot.grants[0]?.origin).toBe('implicit');
  expect(snapshot.grants[0]?.receiveScope?.conversationId).toBe('oc_new');
  await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'first-request',
    'First report',
  );
  expect(posts).toEqual(['First report']);
  await core.externalMessaging.setPostLimit('ada', binding.id, binding.revision, 1);
  const denied = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'limited-request',
    'Second report',
  );
  expect(denied.state).toBe('failed');
  expect(denied.reason).toBe('post-rate-limited');
  expect(posts).toEqual(['First report']);
  const updated = (await core.externalMessaging.snapshot('ada')).identities!.find(
    (value) => value.id === binding.id,
  )!;
  await core.externalMessaging.setPostLimit('ada', binding.id, updated.revision, null);
  expect(
    (
      await core.externalMessaging.postConversation(
        'ada',
        binding.id,
        'oc_new',
        'unlimited-request',
        'Third report',
      )
    ).state,
  ).toBe('provider-accepted');
  expect(posts).toEqual(['First report', 'Third report']);
  transport.postConversationChecked = async () => {
    throw Object.assign(new Error('Private provider read error'), {
      code: 'send-preflight-unavailable',
    });
  };
  const preflight = await core.externalMessaging.postConversation(
    'ada',
    binding.id,
    'oc_new',
    'preflight-request',
    'Read must finish before sending',
  );
  expect(preflight.state).toBe('failed');
  expect(preflight.reason).toBe('send-preflight-unavailable');
});
