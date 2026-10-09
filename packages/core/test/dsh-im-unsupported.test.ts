import { expect, it, vi } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';

it('lists a Discord app without checked send as unsupported and refuses to inspect it for binding', async () => {
  const capabilities = { old: [] as string[], ready: ['proactive-text-checked'] };
  const service = {
    contractVersion: 1,
    listBots: async () => [
      { botId: 'old', channel: 'discord' },
      { botId: 'ready', channel: 'discord' },
    ],
    describeBot: async (botId: 'old' | 'ready') => ({
      version: 1,
      botId,
      channel: 'discord',
      connected: true,
      capabilities: capabilities[botId],
      account: { name: botId, fingerprint: (botId === 'old' ? 'a' : 'b').repeat(64) },
    }),
    listTargets: async () => [],
    sendChecked: async () => ({ ok: true }),
  } as unknown as DshImOutboundService;
  const provider = createDshImProvider(service, 'discord')!;
  expect(await provider.accounts()).toEqual([
    expect.objectContaining({ ref: 'old', unsupported: 'checked-send' }),
    expect.not.objectContaining({ unsupported: expect.anything() }),
  ]);
  await expect(provider.inspectAccount!('old')).rejects.toMatchObject({
    code: 'provider-incompatible',
  });
  await expect(provider.inspectAccount!('ready')).resolves.toMatchObject({ ref: 'ready' });
});

it('allows a fully checked QQ reply-only identity without granting proactive sends', async () => {
  const sendChecked = vi.fn(async () => ({ sent: true as const }));
  const service: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
    listTargets: async () => [],
    describeBot: async () => ({
      version: 1,
      botId: 'qq-app',
      channel: 'qq',
      connected: true,
      account: { fingerprint: 'a'.repeat(64), name: 'QQ QA' },
      capabilities: [
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    consumeInbound: async () => () => {},
    qualifyReplyChecked: async (_id, route) => route,
    replyChecked: async () => ({ sent: true }),
    sendChecked,
  };
  const provider = createDshImProvider(service, 'qq')!;
  await expect(provider.inspectAccount!('qq-app')).resolves.toMatchObject({ ref: 'qq-app' });
  await expect(
    provider.send({
      accountRef: 'qq-app',
      fingerprint: 'a'.repeat(64),
      targetRef: 'group',
      targetDigest: 'b'.repeat(64),
      text: 'hello',
      signal: new AbortController().signal,
    }),
  ).rejects.toMatchObject({ code: 'capability-unavailable', disposition: 'not-started' });
  expect(sendChecked).not.toHaveBeenCalled();
  for (const code of ['reply-window-expired', 'reply-limit-exceeded', 'reply-rate-limited']) {
    service.replyChecked = async () => {
      throw Object.assign(new Error(code), { code });
    };
    const input = {
      accountRef: 'qq-app',
      fingerprint: 'a'.repeat(64),
      route: { messageId: 'source', conversationId: 'group', actorId: 'member' },
      text: 'reply',
      signal: new AbortController().signal,
      beforeSend: () => true,
    };
    await expect(provider.reply!(input)).rejects.toMatchObject({
      code,
      disposition: 'not-started',
    });
    service.qualifyReplyChecked = async () => {
      throw Object.assign(new Error(code), { code });
    };
    await expect(provider.qualifyReply!(input)).rejects.toMatchObject({ code });
  }
});
