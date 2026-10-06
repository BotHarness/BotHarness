import { expect, it } from 'vitest';
import { isChannelMessage } from '../src/channels/channel.js';
import { projectBridgeMessage } from '../src/messaging/channel-target.js';
import type { ExternalSource } from '../src/messaging/inbound.js';

const platforms: ExternalSource['event']['channel'][] = ['discord', 'feishu'];

function source(
  platform: ExternalSource['event']['channel'],
  name?: string,
  senderId = '123456789012345678',
): ExternalSource {
  return {
    id: `source-${senderId}`,
    body: 'Synthetic QA',
    at: '2026-10-06T15:00:00Z',
    platform,
    accountName: 'QA Bot',
    conversationName: 'QA',
    grantId: 'grant',
    grantRevision: 2,
    event: {
      version: 1,
      channel: platform,
      botId: 'account',
      fingerprint: 'a'.repeat(64),
      eventId: `event-${senderId}`,
      messageId: `message-${senderId}`,
      actor: { kind: 'user', id: senderId, ...(name === undefined ? {} : { name }) },
      conversation: { kind: 'group', id: 'conversation' },
      mentions: [],
      mentionedAccount: true,
      at: '2026-10-06T15:00:00Z',
      reply: {
        conversationId: 'conversation',
        messageId: `message-${senderId}`,
        actorId: senderId,
        threadId: 'thread',
      },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    },
  };
}

it.each(platforms)(
  'reprojects the retained %s name without modifying the canonical event',
  (platform) => {
    const retained = source(platform, ' DoodleBear ');
    const original = JSON.stringify(retained);
    const message = projectBridgeMessage(retained, retained.body);
    expect(message.bridgeOrigin).toMatchObject({
      senderName: 'DoodleBear',
      senderId: retained.event.actor.id,
      messageId: retained.event.messageId,
      threadId: 'thread',
    });
    expect(isChannelMessage(message)).toBe(true);
    expect(JSON.stringify(retained)).toBe(original);
    expect(projectBridgeMessage(JSON.parse(original), retained.body)).toEqual(message);
    expect(
      isChannelMessage({ ...message, bridgeOrigin: { ...message.bridgeOrigin, senderName: 42 } }),
    ).toBe(false);
  },
);

it('keeps stable sender/source IDs for same-name users and omits absent or blank names', () => {
  const first = projectBridgeMessage(source('discord', 'Alex', '111'), 'first');
  const second = projectBridgeMessage(source('discord', 'Alex', '222'), 'second');
  expect(first.bridgeOrigin?.senderName).toBe(second.bridgeOrigin?.senderName);
  expect(first.id).not.toBe(second.id);
  expect(first.bridgeOrigin?.senderId).not.toBe(second.bridgeOrigin?.senderId);
  for (const name of [undefined, '', '   ']) {
    const unnamed = projectBridgeMessage(source('discord', name), 'unnamed');
    expect(unnamed.bridgeOrigin?.senderName).toBeUndefined();
    expect(unnamed.author).toEqual({ kind: 'bridged', source: unnamed.bridgeOrigin?.senderId });
    expect(isChannelMessage(unnamed)).toBe(true);
  }
});
