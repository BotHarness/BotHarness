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
