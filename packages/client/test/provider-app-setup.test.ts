import { expect, it } from 'vitest';
import { ProviderAppSetup } from '../src/client/provider-app-setup.js';

it('submits credentials only to the Provider transport and resumes with identity after the dialog closes', async () => {
  const calls: { endpoint: string; payload: unknown }[] = [];
  const client = new ProviderAppSetup({
    async call(channel, endpoint, payload) {
      expect(channel).toBe('/api');
      calls.push({ endpoint, payload });
      const method = (payload as { method: string }).method;
      return {
        ok: true,
        value: {
          version: 1,
          attemptId: 'opaque-attempt',
          channel: 'feishu',
          state: method === 'setup.start' ? 'credentials' : 'ready',
          expiresAt: Date.now() + 60000,
          ...(method === 'setup.start'
            ? {}
            : {
                accountRef: 'new-app',
                description: {
                  version: 1,
                  channel: 'feishu',
                  botId: 'new-app',
                  account: { fingerprint: 'a'.repeat(64), name: 'New app' },
                  connected: true,
                  capabilities: ['proactive-text-checked'],
                },
              }),
        },
      };
    },
  });
  await client.start('ada', {
    providerId: 'dsh-im/feishu',
    version: 1,
    platform: 'feishu',
    kind: 'credentials',
    endpoint: 'dsh-im/app-setup',
  });
  await client.credentials('ada', {
    appId: 'cli_new',
    appSecret: 'private-sentinel',
    domain: 'lark',
  });
  expect(calls.every((call) => call.endpoint === 'dsh-im/app-setup')).toBe(true);
  expect(client.current('ada')).toMatchObject({ state: 'ready', accountRef: 'new-app' });
  expect(JSON.stringify(client.current('ada'))).not.toContain('private-sentinel');
  expect(client.binding('ada')).toEqual({
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'new-app',
    fingerprint: 'a'.repeat(64),
  });
});

it('cancels verification without waiting for the pending credential request to finish first', async () => {
  let release!: () => void;
  let cancelled = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const client = new ProviderAppSetup({
    async call(_channel, _endpoint, payload) {
      const method = (payload as { method: string }).method;
      if (method === 'setup.credentials') {
        await gate;
        return { ok: false, error: { code: 'cancelled', message: 'cancelled', details: {} } };
      }
      if (method === 'setup.cancel') {
        cancelled = true;
        release();
      }
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'feishu',
          attemptId: 'cancel-one',
          state: method === 'setup.cancel' ? 'cancelled' : 'credentials',
          expiresAt: Date.now() + 60000,
        },
      };
    },
  });
  await client.start('ada', {
    providerId: 'dsh-im/feishu',
    version: 1,
    platform: 'feishu',
    kind: 'credentials',
    endpoint: 'dsh-im/app-setup',
  });
  const pending = client
    .credentials('ada', { appId: 'cli_cancel', appSecret: 'private-cancel', domain: 'lark' })
    .catch(() => undefined);
  const cancelling = client.cancel('ada');
  try {
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelled).toBe(true);
  } finally {
    release();
    await pending;
    await cancelling;
  }
  expect(client.current('ada')?.state).toBe('cancelled');
});

it('allows a fresh setup after a closed dialog expires instead of trapping it on the old handle', async () => {
  let expired = false;
  let starts = 0;
  const descriptor = {
    providerId: 'dsh-im/feishu',
    version: 1 as const,
    platform: 'feishu' as const,
    kind: 'credentials' as const,
    endpoint: 'dsh-im/app-setup' as const,
  };
  const client = new ProviderAppSetup({
    async call(_channel, _endpoint, payload) {
      const method = (payload as { method: string }).method;
      if (method === 'setup.start') {
        starts++;
        expired = false;
      }
      if (expired)
        return {
          ok: false,
          error: { code: 'setup-expired', message: 'setup-expired', details: {} },
        };
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'feishu',
          attemptId: 'setup-' + starts,
          state: 'credentials',
          expiresAt: Date.now() + 60000,
        },
      };
    },
  });
  await client.start('ada', descriptor);
  expired = true;
  await expect(client.poll('ada')).rejects.toThrow();
  expect(client.current('ada')).toBeUndefined();
  await client.start('ada', descriptor);
  expect(client.current('ada')?.attemptId).toBe('setup-2');
});

it('resumes a WeChat QR verification and hands only authenticated identity to binding', async () => {
  let verified = false;
  const methods: string[] = [];
  const client = new ProviderAppSetup({
    async call(_carrier, endpoint, payload) {
      expect(endpoint).toBe('dsh-im/app-setup');
      const request = payload as { method: string; payload: { verifyCode?: string } };
      methods.push(request.method);
      if (request.method === 'setup.verify') {
        expect(request.payload.verifyCode).toBe('123456');
        verified = true;
      }
      return {
        ok: true,
        value: {
          version: 1,
          channel: 'weixin',
          attemptId: 'opaque-qr-attempt',
          expiresAt: Date.now() + 60000,
          state: verified
            ? 'ready'
            : request.method === 'setup.start'
              ? 'pending'
              : 'needs_verification',
          qrDataUrl: 'data:image/png;base64,aGVsbG8=',
          qrToken: 'private-qr-sentinel',
          botToken: 'private-token-sentinel',
          ...(verified
            ? {
                accountRef: 'wx_paired',
                description: {
                  version: 1,
                  channel: 'weixin',
                  botId: 'wx_paired',
                  account: { fingerprint: 'b'.repeat(64) },
                  connected: true,
                },
              }
            : {}),
        },
      };
    },
  });
  await client.start('ada', {
    providerId: 'dsh-im/weixin',
    version: 1,
    platform: 'weixin',
    kind: 'qr',
    endpoint: 'dsh-im/app-setup',
  });
  expect(client.current('ada')?.qrDataUrl).toContain('data:image/png;base64,');
  await client.poll('ada');
  expect(client.current('ada')?.state).toBe('needs_verification');
  await client.verify('ada', '123456');
  expect(client.binding('ada')).toEqual({
    kind: 'bind',
    providerId: 'dsh-im/weixin',
    accountRef: 'wx_paired',
    fingerprint: 'b'.repeat(64),
  });
  expect(JSON.stringify(client.current('ada'))).not.toContain('private-');
  expect(client.current('ada')?.qrDataUrl).toBeUndefined();
  expect(methods).toEqual(['setup.start', 'setup.poll', 'setup.verify']);
});
