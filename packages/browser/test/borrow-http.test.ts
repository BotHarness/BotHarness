import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { createBorrowService } from '../src/borrow.js';
import { registerBorrowHttp } from '../src/borrow-http.js';
import type { BrowserViewerHost } from '../src/viewer.js';

const origin = `chrome-extension://${'a'.repeat(32)}`;
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const close of cleanup.splice(0)) await close();
});

async function fixture() {
  const service = createBorrowService({
    bot: () => ({ displayName: 'HTTP QA', browserAccess: true }),
    enabled: () => true,
    onChange: () => undefined,
    note: () => undefined,
  });
  let route: Parameters<BrowserViewerHost['register']>[0] | undefined;
  const dispose = registerBorrowHttp(
    {
      register: (value) => {
        route = value;
        return () => {
          route = undefined;
        };
      },
      registerUpgrade: () => () => undefined,
    },
    service,
  );
  const server: Server = createServer((request, response) => {
    const path = new URL(request.url!, 'http://127.0.0.1').pathname;
    if (route && (path === route.path || path.startsWith(`${route.path}/`)))
      void route.handler(request, response);
    else {
      response.writeHead(404);
      response.end();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test address');
  const base = `http://127.0.0.1:${address.port}/botharness-browser/extension/`;
  cleanup.push(async () => {
    dispose();
    service.dispose();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  const post = (action: string, body: unknown, token?: string, source = origin) =>
    fetch(base + action, {
      method: 'POST',
      headers: {
        origin: source,
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  return { base, service, post };
}

describe('daily-browser loopback HTTP boundary', () => {
  it('admits extension preflight, refuses web/missing origins and binds the one-use code', async () => {
    const f = await fixture();
    const pair = f.service.pair('bot');
    for (const source of ['https://evil.example', '']) {
      const refusal = await f.post('pair', { code: pair.code }, undefined, source);
      expect(refusal.status).toBe(403);
      expect(refusal.headers.has('access-control-allow-origin')).toBe(false);
    }
    const preflight = await fetch(f.base + 'pair', { method: 'OPTIONS', headers: { origin } });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(origin);
    const response = await f.post('pair', { code: pair.code });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const lease = (await response.json()).value as { token: string };
    const replay = await f.post('pair', { code: pair.code });
    expect(replay.status).toBe(409);
    expect(await replay.text()).not.toContain(pair.code);
    const shared = await f.post(
      'share',
      { tabId: 7, url: 'https://example.com', title: 'QA' },
      lease.token,
    );
    expect(shared.status).toBe(200);
    expect(f.service.view('bot')?.title).toBe('QA');
    const wrongOrigin = await f.post(
      'return',
      {},
      lease.token,
      `chrome-extension://${'b'.repeat(32)}`,
    );
    expect(wrongOrigin.status).toBe(409);
    expect(f.service.view('bot')).toBeDefined();
    expect((await f.post('return', {}, lease.token)).status).toBe(200);
    expect(f.service.view('bot')).toBeUndefined();
  });
  it('bounds malformed/oversized requests and refuses unauthenticated lease operations', async () => {
    const f = await fixture();
    for (const body of [[], null, { text: 'x'.repeat(128_000) }])
      expect((await f.post('pair', body)).status).toBe(409);
    expect((await f.post('share', { tabId: 1, url: 'https://example.com' })).status).toBe(409);
    expect((await fetch(f.base + 'pair', { headers: { origin } })).status).toBe(405);
    expect((await f.post('unknown', {})).status).toBe(404);
  });
});
