// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType } from 'react';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  return {
    Switch: (p: { checked: boolean; label: string; onChange(v: boolean): void }) =>
      createElement('button', {
        role: 'switch',
        'aria-label': p.label,
        'aria-checked': p.checked,
        onClick: () => p.onChange(!p.checked),
      }),
  };
});
vi.mock('../src/client/profile-combobox.js', () => ({ ProfileCombobox: () => null }));
import { apply, type BrowserClientContext } from '../src/client/index.js';
import { en } from '../src/client/locale.js';

let root: Root;
let host: HTMLDivElement;
let current: string;
const urls: string[] = [];
const tabs = [
  { targetId: 'home', title: 'Home', url: 'http://fixture/home' },
  { targetId: 'work', title: 'Work', url: 'http://fixture/work' },
];
function observation(url: string): object {
  const preview = new URL(url, 'http://host').searchParams.get('tab') ?? current;
  return {
    focused: preview,
    running: true,
    frame: `frame:${preview}`,
    takeover: false,
    tabs: tabs.map((t) => ({ ...t, current: t.targetId === current })),
  };
}
async function poll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
}
async function click(selector: string): Promise<void> {
  await act(async () => (host.querySelector(selector) as HTMLButtonElement).click());
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  current = 'work';
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      urls.push(url);
      return { ok: true, json: async () => observation(url) };
    }),
  );
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  let Body: ComponentType<{ botSlug: string }> | undefined;
  apply({
    locale: { bind: () => (key) => en[key], register: () => () => {} },
    effect: (callback) => {
      callback();
    },
    inject: (_names, callback) =>
      callback({
        channelSidebar: {
          register: (entry: { component: typeof Body }) => {
            Body = entry.component;
            return () => {};
          },
        },
        connection: {
          rpc: { call: async () => ({ ok: true, value: { bots: [{ slug: 'qa' }] } }) },
        },
      } as unknown as BrowserClientContext),
  });
  await act(async () => root.render(createElement(Body!, { botSlug: 'qa' })));
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Browser current work versus Human preview', () => {
  it('pins the current Bot tab first and shows title and URL without hovering', () => {
    const rows = host.querySelectorAll('button[title]');
    expect(rows[0]?.textContent).toContain('Work');
    expect(rows[0]?.textContent).toContain('http://fixture/work');
    expect(rows[1]?.textContent).toContain('http://fixture/home');
  });
  it('locks the visible tab when Follow is turned off and resumes current work when re-enabled', async () => {
    await click('[role="switch"]');
    current = 'home';
    await poll();
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:work');
    expect(urls.at(-1)).toContain('tab=work');
    await click('[role="switch"]');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:home');
    expect(urls.at(-1)).not.toContain('&tab=');
  });
  it('keeps Bot current pinned while a different tab is previewed without a command', async () => {
    await click('button[title="http://fixture/home"]');
    expect(host.querySelector('[role="switch"]')?.getAttribute('aria-checked')).toBe('false');
    expect(host.querySelector('img')?.getAttribute('src')).toBe('frame:home');
    expect(host.querySelector('button[title]')?.getAttribute('title')).toBe('http://fixture/work');
    expect(current).toBe('work');
    expect(urls.every((url) => url.startsWith('/api/browser/observation?'))).toBe(true);
  });
});
