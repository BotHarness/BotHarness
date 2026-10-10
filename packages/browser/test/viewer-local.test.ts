import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';

import { LOCAL_VIEWER_PREFIX, localViewerUrl, registerLocalViewer } from '../src/viewer-local.js';
import { createTakeoverService, type TakeoverService } from '../src/takeover.js';

function fixture(options?: {
  running?: boolean;
  shot?: { data: string; mimeType: string } | undefined;
  access?: boolean;
  rejected?: number;
  takeover?: boolean;
}) {
  const running = options?.running ?? true;
  const shot = options?.shot ?? {
    data: Buffer.from('frame').toString('base64'),
    mimeType: 'image/jpeg',
  };
  const clickAt = vi.fn(async (tabId: string, x: number, y: number) => ({
    tabId,
    url: `https://example.com/${x},${y}`,
    title: 'Example',
  }));
  const scroll = vi.fn(async (tabId: string, direction: 'up' | 'down', amount: number) => ({
    tabId,
    url: `https://example.com/${direction}/${amount}`,
    title: 'Example',
  }));
  const insertText = vi.fn(async (tabId: string, text: string) => ({
    tabId,
    url: 'https://example.com/typed',
    title: 'Example',
    chars: text.length,
  }));
  const pressKey = vi.fn(async (tabId: string, key: string) => ({
    tabId,
    url: `https://example.com/key/${key}`,
    title: 'Example',
  }));
  const note = vi.fn();
  const touch = vi.fn();
  const takeover: TakeoverService = createTakeoverService();
  let route!: Parameters<Parameters<typeof registerLocalViewer>[0]['host']['register']>[0];
  const release = vi.fn();
  const dispose = registerLocalViewer({
    host: {
      register: (next) => {
        route = next;
        return release;
      },
      registerUpgrade: () => release,
    },
    runtimes: {
      for: () => ({
        isRunning: () => running,
        captureScreenshot: vi.fn(async () => shot),
        clickAt,
        scroll,
        insertText,
        pressKey,
      }),
    } as never,
    currentTab: () => (running ? 'tab-1' : undefined),
    isTakeover: () => options?.takeover ?? true,
    touch,
    hasAccess: () => options?.access ?? true,
    note,
    takeover,
    rejection: () => options?.rejected,
  });
  const call = async (
    url: string,
    method = 'GET',
    headers: Record<string, string> = {},
    body?: unknown,
  ) => {
    const response = { writeHead: vi.fn(), end: vi.fn() };
    const stream = new Readable({ read() {} });
    if (body !== undefined) {
      stream.push(JSON.stringify(body));
    }
    stream.push(null);
    Object.assign(stream, { headers, url, method });
    await route.handler(
      stream as unknown as IncomingMessage,
      response as unknown as ServerResponse,
    );
    return response;
  };
  return { dispose, release, call, clickAt, scroll, insertText, pressKey, note, touch, takeover };
}

describe('local browser viewer stream', () => {
  it('exposes a Host-served viewer URL for the local target', () => {
    expect(localViewerUrl('qa')).toBe(`${LOCAL_VIEWER_PREFIX}/?slug=qa`);
    expect(localViewerUrl('a b')).toContain('slug=a%20b');
  });

  it('serves a responsive viewer with pointer input and trackpad mode', async () => {
    const f = fixture();
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/?slug=qa`);
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'content-type': 'text/html; charset=utf-8' }),
    );
    const page = String(response.end.mock.calls[0]?.[0] ?? '');
    expect(page).toContain('name="viewport"');
    expect(page).toContain('width=device-width');
    expect(page).toContain('frame?slug=');
    expect(page).toContain('id="videoCanvas"');
    expect(page).toContain('createImageBitmap');
    expect(page).toContain('Trackpad');
    expect(page).toContain('Direct tap');
    expect(page).toContain('id="kbd"');
    expect(page).toContain('id="sendBtn"');
    f.dispose();
    expect(f.release).toHaveBeenCalledOnce();
  });

  it('streams the latest screenshot frame while running', async () => {
    const f = fixture();
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/frame?slug=qa`);
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'content-type': 'image/jpeg', 'cache-control': 'no-store' }),
    );
    expect(Buffer.isBuffer(response.end.mock.calls[0]?.[0])).toBe(true);
    f.dispose();
  });

  it('forwards viewer clicks to the browser tab while paused', async () => {
    const f = fixture();
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'click',
        x: 120,
        y: 240,
      },
    );
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'content-type': 'application/json' }),
    );
    expect(f.clickAt).toHaveBeenCalledWith('tab-1', 120, 240);
    expect(f.touch).toHaveBeenCalledWith('qa');
    expect(JSON.parse(String(response.end.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
    f.dispose();
  });

  it('forwards viewer scrolls with bounded amounts', async () => {
    const f = fixture();
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'scroll',
        direction: 'up',
        amount: 5000,
      },
    );
    expect(f.scroll).toHaveBeenCalledWith('tab-1', 'up', 2000);
    expect(JSON.parse(String(response.end.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
    f.dispose();
  });

  it('forwards viewer typed text without recording its content', async () => {
    const f = fixture();
    const sentinel = 'SENTINEL-TAKEOVER-SECRET-9417';
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'type',
        text: sentinel,
      },
    );
    expect(response.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'content-type': 'application/json' }),
    );
    expect(f.insertText).toHaveBeenCalledWith('tab-1', sentinel);
    const payload = String(response.end.mock.calls[0]?.[0] ?? '');
    expect(payload).not.toContain(sentinel);
    const notes = f.note.mock.calls.map((call) => String(call[0] ?? '')).join('\n');
    expect(notes).not.toContain(sentinel);
    expect(notes).toContain(`chars=${sentinel.length}`);
    f.dispose();
  });

  it('forwards viewer key presses', async () => {
    const f = fixture();
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'key',
        key: 'Enter',
      },
    );
    expect(f.pressKey).toHaveBeenCalledWith('tab-1', 'Enter');
    expect(JSON.parse(String(response.end.mock.calls[0]?.[0]))).toMatchObject({ ok: true });
    f.dispose();
  });

  it('rejects empty typed text', async () => {
    const f = fixture();
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'type',
        text: '',
      },
    );
    expect(response.writeHead).toHaveBeenCalledWith(400, expect.anything());
    expect(f.insertText).not.toHaveBeenCalled();
    f.dispose();
  });

  it('requires pause before human input', async () => {
    const f = fixture({ takeover: false });
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'click',
        x: 10,
        y: 10,
      },
    );
    expect(response.writeHead).toHaveBeenCalledWith(409, expect.anything());
    expect(f.clickAt).not.toHaveBeenCalled();
    f.dispose();
  });

  it('rejects invalid click coordinates', async () => {
    const f = fixture();
    const response = await f.call(
      `${LOCAL_VIEWER_PREFIX}/input`,
      'POST',
      {},
      {
        slug: 'qa',
        kind: 'click',
        x: -5,
        y: 10,
      },
    );
    expect(response.writeHead).toHaveBeenCalledWith(400, expect.anything());
    expect(f.clickAt).not.toHaveBeenCalled();
    f.dispose();
  });

  it('returns 404 when the browser is not running', async () => {
    const f = fixture({ running: false });
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/frame?slug=qa`);
    expect(response.writeHead).toHaveBeenCalledWith(404, expect.anything());
    f.dispose();
  });

  it('requires a slug and refuses other methods', async () => {
    const f = fixture();
    const missing = await f.call(`${LOCAL_VIEWER_PREFIX}/`);
    expect(missing.writeHead).toHaveBeenCalledWith(400, expect.anything());
    const denied = await f.call(`${LOCAL_VIEWER_PREFIX}/?slug=qa`, 'POST');
    expect(denied.writeHead).toHaveBeenCalledWith(405, expect.anything());
    f.dispose();
  });

  it('refuses unauthenticated viewers before touching the runtime', async () => {
    const f = fixture({ rejected: 401 });
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/?slug=qa`, 'GET', {
      cookie: 'session=none',
    });
    expect(response.writeHead).toHaveBeenCalledWith(401);
    f.dispose();
  });

  it('refuses viewers when Browser Access is off', async () => {
    const f = fixture({ access: false });
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/?slug=qa`);
    expect(response.writeHead).toHaveBeenCalledWith(403, expect.anything());
    f.dispose();
  });

  it('serves handoff instructions and records accept plus completion', async () => {
    const f = fixture();
    const record = f.takeover.mint('qa', 'Log in to Example');
    const details = await f.call(`${LOCAL_VIEWER_PREFIX}/handoff?token=${record.token}`);
    expect(details.writeHead).toHaveBeenCalledWith(
      200,
      expect.objectContaining({ 'content-type': 'application/json' }),
    );
    expect(String(details.end.mock.calls[0]?.[0] ?? '')).toContain('Log in to Example');
    const accepted = await f.call(
      `${LOCAL_VIEWER_PREFIX}/handoff/accept`,
      'POST',
      {},
      {
        token: record.token,
      },
    );
    expect(accepted.writeHead).toHaveBeenCalledWith(200, expect.anything());
    const done = await f.call(
      `${LOCAL_VIEWER_PREFIX}/handoff/complete`,
      'POST',
      {},
      {
        token: record.token,
        reason: 'done',
      },
    );
    expect(done.writeHead).toHaveBeenCalledWith(200, expect.anything());
    const again = await f.call(
      `${LOCAL_VIEWER_PREFIX}/handoff/complete`,
      'POST',
      {},
      {
        token: record.token,
        reason: 'done',
      },
    );
    expect(again.writeHead).toHaveBeenCalledWith(410, expect.anything());
    f.dispose();
  });

  it('rejects unknown handoff tokens with gone', async () => {
    const f = fixture();
    const response = await f.call(`${LOCAL_VIEWER_PREFIX}/handoff?token=nope`);
    expect(response.writeHead).toHaveBeenCalledWith(410, expect.anything());
    f.dispose();
  });
});
