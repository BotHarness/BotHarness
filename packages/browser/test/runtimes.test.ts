import { describe, expect, it, vi } from 'vitest';

import type { BotBrowserRuntime, BotBrowserRuntimeOptions } from '../src/runtime/browser.js';
import { createBotBrowserRuntimes, sanitizeProfileName } from '../src/runtimes.js';

function fakeRuntime(): BotBrowserRuntime & { stop: ReturnType<typeof vi.fn> } {
  return {
    ensure: vi.fn(async () => undefined),
    isRunning: () => true,
    open: vi.fn(async (url: string) => ({ tabId: 't', url, title: '' })),
    observe: vi.fn(async () => ({ url: '', title: '', elements: [], text: '' })),
    click: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    clickAt: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    type: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    pressKey: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    scroll: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    uploadFile: vi.fn(async () => undefined),
    createTab: vi.fn(async (url: string) => ({ tabId: 't', url, title: '' })),
    listTabs: vi.fn(async () => []),
    tabInfo: vi.fn(async () => ({ url: '', title: '' })),
    closeTab: vi.fn(async () => undefined),
    captureScreenshot: vi.fn(async () => undefined),
    openWindow: vi.fn(async () => ({ tabId: 't', url: '', title: '' })),
    currentUrl: () => undefined,
    binaryPath: () => undefined,
    stop: vi.fn(async () => undefined),
  };
}

function setup(profiles: Record<string, string>): {
  runtimes: ReturnType<typeof createBotBrowserRuntimes>;
  created: BotBrowserRuntimeOptions[];
  factories: Map<string, BotBrowserRuntime & { stop: ReturnType<typeof vi.fn> }>;
} {
  const created: BotBrowserRuntimeOptions[] = [];
  const factories = new Map<string, BotBrowserRuntime & { stop: ReturnType<typeof vi.fn> }>();
  const runtimes = createBotBrowserRuntimes({
    browserDir: '/tmp/botharness/browser',
    installDir: '/tmp/botharness/browser-chromium',
    profileOf: (slug) => profiles[slug] ?? '',
    create: (options) => {
      created.push(options);
      const runtime = fakeRuntime();
      factories.set(options.userDataDir, runtime);
      return runtime;
    },
  });
  return { runtimes, created, factories };
}

describe('browser profiles', () => {
  it('sanitizes names and falls back to the default profile', () => {
    expect(sanitizeProfileName('work')).toBe('work');
    expect(sanitizeProfileName('work.v2')).toBe('work.v2');
    expect(sanitizeProfileName('.work')).toBe('.work');
    expect(sanitizeProfileName('work..')).toBe('work..');
    expect(sanitizeProfileName(' work-2 ')).toBe('work-2');
    expect(sanitizeProfileName('default')).toBe('');
    expect(sanitizeProfileName('bad/name')).toBe('');
    expect(sanitizeProfileName('')).toBe('');
  });

  it.each(['.', '..', ' . ', ' .. '])(
    'keeps reserved stored profile %s in the existing default fallback',
    (name) => {
      const { runtimes, created } = setup({ a: name, b: '' });
      expect(sanitizeProfileName(name)).toBe('');
      expect(runtimes.for('a')).toBe(runtimes.for('b'));
      expect(runtimes.profileOf('a')).toBe('');
      expect(created.map((options) => options.userDataDir)).toEqual(['/tmp/botharness/browser']);
    },
  );

  it('shares one runtime per profile and isolates different profiles', () => {
    const { runtimes, created } = setup({ a: 'work', b: 'work', c: '' });
    expect(runtimes.for('a')).toBe(runtimes.for('b'));
    expect(runtimes.for('c')).not.toBe(runtimes.for('a'));
    expect(created).toHaveLength(2);
    expect(created.map((options) => options.userDataDir)).toEqual([
      '/tmp/botharness/browser-profiles/work',
      '/tmp/botharness/browser',
    ]);
    expect(runtimes.profileOf('a')).toBe('work');
    expect(runtimes.profileOf('c')).toBe('');
  });

  it('stops only idle profiles, and stops or clears on request', async () => {
    const { runtimes, factories } = setup({ a: 'work', c: '' });
    runtimes.for('a');
    runtimes.for('c');
    const work = factories.get('/tmp/botharness/browser-profiles/work')!;
    const fallback = factories.get('/tmp/botharness/browser')!;
    runtimes.touch('c');
    await runtimes.closeIdle(60_000);
    expect(work.stop).not.toHaveBeenCalled();
    expect(fallback.stop).not.toHaveBeenCalled();
    await runtimes.closeIdle(0);
    expect(work.stop).toHaveBeenCalled();
    expect(fallback.stop).toHaveBeenCalled();
    await runtimes.stop('a');
    expect(work.stop).toHaveBeenCalledTimes(2);
    const another = setup({ a: 'work' });
    another.runtimes.for('a');
    const runtime = another.factories.get('/tmp/botharness/browser-profiles/work')!;
    await another.runtimes.stopAll();
    expect(runtime.stop).toHaveBeenCalled();
  });
});
