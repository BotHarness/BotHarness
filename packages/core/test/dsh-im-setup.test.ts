import { expect, it } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';

it('negotiates identity-only setup metadata and never exposes Provider credentials or QR tokens', async () => {
  const service = {
    contractVersion: 1,
    setupVersion: 1,
    describeSetup: async () => ({
      version: 1,
      channel: 'feishu',
      endpoint: 'dsh-im/app-setup',
      kind: 'credentials',
      appSecret: 'private-sentinel',
      qrToken: 'private-qr',
    }),
    describeBot: async () => undefined,
    sendChecked: async () => undefined,
    listBots: async () => [],
    listTargets: async () => [],
  } as unknown as DshImOutboundService;
  const provider = createDshImProvider(service)!;
  expect(await provider.setup?.()).toEqual({
    version: 1,
    platform: 'feishu',
    endpoint: 'dsh-im/app-setup',
    kind: 'credentials',
  });
  delete service.setupVersion;
  expect(await createDshImProvider(service)!.setup?.()).toBeUndefined();
});
