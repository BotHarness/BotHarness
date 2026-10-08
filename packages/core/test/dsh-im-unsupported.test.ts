import { expect, it } from 'vitest';
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
