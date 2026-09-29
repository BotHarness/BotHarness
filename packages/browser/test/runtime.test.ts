import { EventEmitter } from 'node:events';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CdpClient } from '../src/runtime/browser.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

import { spawn } from 'node:child_process';

import {
  browserCandidates,
  buildLaunchArgs,
  connectCdp,
  createBotBrowserRuntime,
  discoverBrowserBinary,
  parseDevToolsUrl,
} from '../src/runtime/browser.js';

const spawnMock = vi.mocked(spawn);

beforeEach(() => {
  spawnMock.mockReset();
});

describe('binary discovery and launch arguments', () => {
  it('lists platform candidates in preference order', () => {
    expect(browserCandidates('darwin')[0]).toContain('Google Chrome.app');
    expect(browserCandidates('win32')[0]).toContain('chrome.exe');
    expect(browserCandidates('linux')).toContain('/usr/bin/google-chrome');
    expect(browserCandidates('linux')).toContain('/usr/bin/microsoft-edge');
  });

  it('prefers an explicit browserPath and reports a missing one as absent', () => {
    const exists = (path: string): boolean => path === '/opt/chrome';
    expect(discoverBrowserBinary('/opt/chrome', 'linux', {}, exists)).toBe('/opt/chrome');
    expect(discoverBrowserBinary('/opt/missing', 'linux', {}, exists)).toBeUndefined();
    expect(discoverBrowserBinary('', 'linux', {}, (path) => path === '/usr/bin/chromium')).toBe(
      '/usr/bin/chromium',
    );
  });

  it('launches with a dedicated profile, an ephemeral debugging port, and optional headless', () => {
    const args = buildLaunchArgs({ userDataDir: '/data/browser' });
    expect(args).toContain('--user-data-dir=/data/browser');
    expect(args).toContain('--remote-debugging-port=0');
    expect(args).toContain('--new-window');
    expect(args).not.toContain('--headless=new');
    expect(buildLaunchArgs({ userDataDir: '/data/browser', headless: true })).toContain(
      '--headless=new',
    );
  });

  it('extracts the DevTools endpoint from Chromium stderr', () => {
    const line =
      'DevTools listening on ws://127.0.0.1:49531/devtools/browser/6b0f1e2a-1111-2222-3333-444455556666';
    expect(parseDevToolsUrl(`noise\n${line}\nmore`)).toBe(
      'ws://127.0.0.1:49531/devtools/browser/6b0f1e2a-1111-2222-3333-444455556666',
    );
    expect(parseDevToolsUrl('nothing here')).toBeUndefined();
  });
});

class FakeWebSocket {
  static last: FakeWebSocket | undefined;
  readonly sent: string[] = [];
  private readonly handlers = new Map<string, (event: { data?: unknown }) => void>();

  constructor(readonly url: string) {
    FakeWebSocket.last = this;
  }

  addEventListener(type: string, listener: (event: { data?: unknown }) => void): void {
    this.handlers.set(type, listener);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.handlers.get('close')?.({});
  }

  open(): void {
    this.handlers.get('open')?.({});
  }

  message(payload: unknown): void {
    this.handlers.get('message')?.({ data: JSON.stringify(payload) });
  }
}

describe('minimal CDP client', () => {
  it('frames requests and resolves replies by id', async () => {
    const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
    const socket = FakeWebSocket.last!;
    socket.open();
    const client = await connecting;
    const pending = client.send('Target.getTargetInfo', { targetId: 'tab-1' });
    expect(JSON.parse(socket.sent[0]!)).toEqual({
      id: 1,
      method: 'Target.getTargetInfo',
      params: { targetId: 'tab-1' },
    });
    socket.message({ id: 1, result: { targetInfo: { targetId: 'tab-1' } } });
    await expect(pending).resolves.toEqual({ targetInfo: { targetId: 'tab-1' } });
  });

  it('fails requests on CDP errors and on connection loss', async () => {
    const connecting = connectCdp('ws://127.0.0.1:1/devtools/browser/x', FakeWebSocket);
    const socket = FakeWebSocket.last!;
    socket.open();
    const client = await connecting;
    const failed = client.send('Page.navigate');
    socket.message({ id: 1, error: { message: 'Cannot navigate' } });
    await expect(failed).rejects.toThrow('Cannot navigate');
    const pending = client.send('Page.navigate');
    socket.close();
    await expect(pending).rejects.toThrow(/websocket closed/);
  });
});

interface FakeChild {
  readonly proc: EventEmitter & {
    stderr: EventEmitter;
    exitCode: number | null;
    killed: boolean;
    kill: ReturnType<typeof vi.fn>;
  };
  ready(): void;
}

function fakeChild(): FakeChild {
  const stderr = new EventEmitter();
  const proc = new EventEmitter() as FakeChild['proc'];
  proc.stderr = stderr;
  proc.exitCode = null;
  proc.killed = false;
  proc.kill = vi.fn(() => {
    proc.exitCode = 0;
    proc.emit('exit', 0);
  });
  return {
    proc,
    ready: () =>
      stderr.emit(
        'data',
        Buffer.from('DevTools listening on ws://127.0.0.1:1/devtools/browser/a\n'),
      ),
  };
}

function fakeClient(): CdpClient & { calls: { method: string; sessionId?: string }[] } {
  const calls: { method: string; sessionId?: string }[] = [];
  return {
    calls,
    send: vi.fn(async (method: string, params?: Record<string, unknown>, sessionId?: string) => {
      calls.push({ method, ...(sessionId === undefined ? {} : { sessionId }) });
      if (method === 'Runtime.evaluate') {
        const expression = String(params?.['expression'] ?? '');
        if (expression === 'document.readyState') return { result: { value: 'complete' } };
        if (expression.startsWith('({ url:')) {
          return { result: { value: { url: 'https://example.com/', title: 'Example' } } };
        }
        return {
          result: {
            value: {
              url: 'https://example.com/',
              title: 'Example',
              elements: [{ ref: 'e1', role: 'a', name: 'More' }],
              text: 'Hello world',
            },
          },
        };
      }
      if (method === 'Target.createTarget') return { targetId: 'tab-1' };
      if (method === 'Target.attachToTarget') return { sessionId: 'session-1' };
      return {};
    }),
    close: vi.fn(),
  };
}

describe('runtime lifecycle', () => {
  it('errors readably when no browser is installed and the Host stays up', async () => {
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: () => false,
    });
    await expect(runtime.ensure()).rejects.toThrow(/No Chrome, Edge, or Chromium/);
    expect(runtime.isRunning()).toBe(false);
  });

  it('launches, opens, reuses the tab, observes, and stops', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'linux',
      env: {},
      fileExists: (path) => path === '/usr/bin/google-chrome',
      connect: async () => client,
    });

    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    expect(runtime.isRunning()).toBe(true);
    expect(runtime.binaryPath()).toBe('/usr/bin/google-chrome');
    expect(spawnMock).toHaveBeenCalledWith(
      '/usr/bin/google-chrome',
      expect.arrayContaining(['--remote-debugging-port=0']),
      expect.objectContaining({ stdio: ['ignore', 'ignore', 'pipe'] }),
    );

    const opened = await runtime.open('https://example.com');
    expect(opened).toEqual({ tabId: 'tab-1', url: 'https://example.com/', title: 'Example' });
    expect(client.calls.map((call) => call.method)).toContain('Target.createTarget');
    expect(client.calls.map((call) => call.method)).toContain('Page.navigate');

    const reopened = await runtime.open('https://example.org', 'tab-1');
    expect(reopened.tabId).toBe('tab-1');
    expect(client.calls.filter((call) => call.method === 'Target.createTarget')).toHaveLength(1);

    const observation = await runtime.observe('tab-1');
    expect(observation.elements).toEqual([{ ref: 'e1', role: 'a', name: 'More' }]);
    expect(runtime.currentUrl()).toBe('https://example.com/');

    await runtime.stop();
    expect(runtime.isRunning()).toBe(false);
    expect(child.proc.kill).toHaveBeenCalled();
  });

  it('opens the Human sign-in window', async () => {
    const child = fakeChild();
    spawnMock.mockReturnValue(child.proc as never);
    const client = fakeClient();
    const runtime = createBotBrowserRuntime({
      userDataDir: '/tmp/browser-test',
      platform: 'darwin',
      env: {},
      fileExists: (path) => path.includes('Google Chrome.app'),
      connect: async () => client,
    });
    const ensuring = runtime.ensure();
    child.ready();
    await ensuring;
    const window = await runtime.openWindow();
    expect(window.tabId).toBe('tab-1');
  });
});
