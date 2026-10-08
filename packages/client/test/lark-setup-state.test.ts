import { expect, it } from 'vitest';
import { larkSetupState } from '../src/client/lark-setup-state.js';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';

it('trusts only a reply in a receiving conversation of this Bot’s bound, enabled app', () => {
  const account = {
    providerId: 'lark',
    ref: 'one',
    platform: 'feishu',
    name: 'App',
    fingerprint: 'a',
    connected: true,
  };
  const identity = {
    id: 'identity',
    botSlug: 'ada',
    providerId: 'lark',
    accountRef: 'one',
    platform: 'feishu',
    name: 'App',
    fingerprint: 'a',
    enabled: true,
    availability: 'available' as const,
    newConversations: 'auto' as const,
    revision: 1,
    createdAt: 'now',
    grantCount: 1,
    scopes: ['QA'],
  };
  const grant = {
    id: 'grant',
    bindingId: 'identity',
    botSlug: 'ada',
    providerId: 'lark',
    accountRef: 'one',
    fingerprint: 'a',
    platform: 'feishu',
    targetRef: 'group',
    targetName: 'QA',
    accountName: 'App',
    targetDigest: 'd',
    revision: 1,
    createdAt: 'now',
    availability: 'available' as const,
    reception: 'receiving' as const,
    receiveScope: { kind: 'group' as const, conversationId: 'oc-qa' },
  };
  const receipt = {
    sourceEventId: 'source',
    grantId: 'other-grant',
    messageId: 'om-1',
    conversationId: 'oc-qa',
    at: 'now',
    threadId: 'omt',
    replyState: 'provider-accepted' as const,
    replyMessageId: 'om-reply',
    echoObserved: true,
  };
  const snapshot: MessagingSnapshot = {
    accounts: [account],
    identities: [identity],
    grants: [grant],
    intents: [],
    setup: { providerReady: true, receipts: [receipt] },
  };
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(false);
  receipt.grantId = 'grant';
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(true);
  receipt.conversationId = 'oc-elsewhere';
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(false);
  receipt.conversationId = 'oc-qa';
  receipt.echoObserved = false;
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(true);
  snapshot.setup!.providerReady = false;
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(false);
  snapshot.setup!.providerReady = true;
  identity.enabled = false;
  expect(larkSetupState(snapshot, 'lark:one').next).toBe('bind');
  identity.enabled = true;
  account.connected = false;
  expect(larkSetupState(snapshot, 'lark:one').next).toBe('app');
  account.connected = true;
  grant.reception = 'off' as typeof grant.reception;
  expect(larkSetupState(snapshot, 'lark:one').complete).toBe(false);
});

it('missing Provider, empty accounts and unknown state are never successful', () => {
  expect(larkSetupState(undefined, '').complete).toBe(false);
  expect(larkSetupState({ accounts: [], grants: [], intents: [] }, '').providerReady).toBe(false);
});
