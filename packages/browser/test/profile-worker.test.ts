import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
const worker = readFileSync(
  new URL('../profile-extension/worker.mjs', import.meta.url),
  'utf8',
).replace(/^import .*;\n/u, '');
function setup(failFirst: boolean) {
  const requests: { clientId: string; signal: AbortSignal }[] = [];
  let alive = true;
  let alarm: () => void = () => undefined;
  let message: (input: unknown, sender: unknown, reply: (value: unknown) => void) => boolean = () =>
    false;
  const chrome = {
    storage: {
      local: {
        get: async () =>
          alive ? { profileBinding: { host: 'http://127.0.0.1:3143', token: 'test-only' } } : {},
        remove: async () => {
          alive = false;
        },
      },
    },
    tabs: {
      query: async () => [],
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
    },
    action: { setBadgeText: vi.fn(async () => undefined) },
    alarms: {
      create: async () => undefined,
      onAlarm: {
        addListener(fn: () => void) {
          alarm = fn;
        },
      },
    },
    runtime: {
      id: 'test',
      getURL: (path: string) => `chrome-extension://test/${path}`,
      onMessage: {
        addListener(fn: typeof message) {
          message = fn;
        },
      },
      onStartup: { addListener() {} },
    },
  };
  const fetch = vi.fn(async (_url: string, input: { body: string; signal: AbortSignal }) => {
    const body = JSON.parse(input.body) as { clientId: string };
    requests.push({ clientId: body.clientId, signal: input.signal });
    if (failFirst && requests.length === 1) throw new Error('synthetic disconnect');
    return await new Promise<never>((_resolve, reject) =>
      input.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }),
    );
  });
  runInNewContext(worker, {
    chrome,
    fetch,
    crypto: webcrypto,
    URL,
    AbortSignal,
    AbortController,
    Map,
    Set,
    profilePage: () => undefined,
  });
  return {
    requests,
    alarm: () => alarm(),
    reconnect: () =>
      new Promise((resolve) =>
        message(
          { action: 'reconnect' },
          { id: 'test', url: 'chrome-extension://test/popup.html' },
          resolve,
        ),
      ),
    close() {
      alive = false;
      for (const request of requests) request.signal.dispatchEvent(new Event('abort'));
    },
  };
}
it('automatic recovery creates a new connection identity within the old heartbeat window', async () => {
  const h = setup(true);
  try {
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    h.alarm();
    await vi.waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[1]!.clientId).not.toBe(h.requests[0]!.clientId);
  } finally {
    h.close();
  }
});
it('explicit reconnect cancels the old poll and immediately uses a new connection identity', async () => {
  const h = setup(false);
  try {
    await vi.waitFor(() => expect(h.requests).toHaveLength(1));
    await h.reconnect();
    await vi.waitFor(() => expect(h.requests).toHaveLength(2));
    expect(h.requests[0]!.signal.aborted).toBe(true);
    expect(h.requests[1]!.clientId).not.toBe(h.requests[0]!.clientId);
  } finally {
    h.close();
  }
});
