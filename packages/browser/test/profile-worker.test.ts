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

it.each([undefined, { error: 'Input focus unavailable' }])(
  'never dispatches input when the injected page command returns %j',
  async (failed) => {
    const sendCommand = vi.fn();
    const attach = vi.fn();
    const executeScript = vi.fn(async ({ args }: { args: string[] }) => {
      const method = args[0];
      const result =
        method === 'observe'
          ? { elements: [{ ref: 'current' }] }
          : method === 'prepare-type'
            ? { x: 10, y: 10, url: 'https://example.com' }
            : method === 'type'
              ? failed
              : null;
      return [{ documentId: 'document-a', result }];
    });
    const execute = runInNewContext(`${worker}; execute`, {
      chrome: {
        storage: { local: { get: async () => ({}) } },
        tabs: {
          query: async () => [{ id: 1, url: 'https://example.com', windowId: 1 }],
          update: async () => undefined,
          onUpdated: { addListener() {} },
          onRemoved: { addListener() {} },
        },
        windows: { update: async () => undefined },
        scripting: { executeScript },
        debugger: { attach, sendCommand, detach: async () => undefined },
        runtime: { onMessage: { addListener() {} }, onStartup: { addListener() {} } },
        alarms: { create: () => undefined, onAlarm: { addListener() {} } },
      },
      profilePage: () => undefined,
      crypto: webcrypto,
      URL,
      Map,
      Set,
      AbortController,
      AbortSignal,
    }) as (command: {
      slug: string;
      method: string;
      args: Record<string, unknown>;
    }) => Promise<unknown>;
    await execute({ slug: 'a', method: 'tabs', args: { action: 'select', targetId: '1' } });
    await execute({ slug: 'a', method: 'observe', args: {} });
    await expect(
      execute({ slug: 'a', method: 'type', args: { ref: 'current', text: 'must-not-insert' } }),
    ).rejects.toThrow(failed ? 'Input focus' : 'Page command');
    expect(attach).toHaveBeenCalledOnce();
    expect(sendCommand).not.toHaveBeenCalled();
  },
);
