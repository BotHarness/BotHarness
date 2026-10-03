// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentType, ReactNode } from 'react';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  const control = (p: Record<string, unknown>) => {
    const { children, variant: _variant, size: _size, ...rest } = p;
    return createElement('button', { type: 'button', ...rest }, children as ReactNode);
  };
  return {
    Button: control,
    Pill: control,
    StateDot: () => null,
    IconFullscreenOutlineRegular: () => null,
    Modal: (p: { children: ReactNode; title: string; onClose(): void }) =>
      createElement(
        'div',
        { role: 'dialog', 'aria-label': p.title },
        createElement('button', { onClick: p.onClose }, 'Close'),
        p.children,
      ),
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
let target: 'local' | 'container';
let takeover: boolean;
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
    takeover,
    target,
    viewerUrl: target === 'container' ? '/viewer/qa/' : null,
    tabs: tabs.map((t) => ({ ...t, current: t.targetId === current })),
  };
}
async function poll(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1500);
  });
}
async function click(selector: string): Promise<void> {
  const interaction = selector.match(
    /^\[aria-label="(Enable interaction|Disable interaction)"\]$/,
  )?.[1];
  await act(async () => {
    const button =
      interaction === undefined
        ? host.querySelector<HTMLButtonElement>(selector)
        : [...host.querySelectorAll('button')].find((b) => b.textContent === interaction);
    expect(button).toBeDefined();
    button!.click();
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect(): void {}
    },
  );
  current = 'work';
  target = 'local';
  takeover = false;
  urls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url === '/api/browser/takeover') takeover = JSON.parse(String(init?.body)).active;
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
    inject: (names, callback) => {
      if (names.includes('configForms')) return;
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
      } as unknown as BrowserClientContext);
    },
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

describe('Container Human viewer', () => {
  async function expand(): Promise<HTMLIFrameElement> {
    target = 'container';
    await poll();
    const frame = host.querySelector('iframe')!;
    expect(frame.style.pointerEvents).toBe('none');
    expect(frame.tabIndex).toBe(-1);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Open Bot Browser')!
        .click(),
    );
    expect(host.querySelector('[role="dialog"]')).not.toBeNull();
    return frame;
  }
  it('shares one frame through fullscreen, disables input on collapse and preserves Pause', async () => {
    const frame = await expand();
    await click('[aria-label="Enable interaction"]');
    expect(takeover).toBe(true);
    expect(host.querySelector('iframe')).toBe(frame);
    expect(frame.style.pointerEvents).toBe('auto');
    await click('[aria-label="Disable interaction"]');
    expect(takeover).toBe(true);
    expect(frame.style.pointerEvents).toBe('none');
    await click('[aria-label="Enable interaction"]');
    await click('[aria-label="Leave fullscreen"]');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector('iframe')).toBe(frame);
    expect(frame.style.pointerEvents).toBe('none');
    expect(takeover).toBe(true);
    await act(async () =>
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Resume')!.click(),
    );
    expect(takeover).toBe(false);
    expect(frame.style.pointerEvents).toBe('none');
  });
  it('keeps an already live static frame connected when toggling interaction', async () => {
    const frame = await expand();
    const frameDocument = frame.contentDocument!;
    frameDocument.open();
    frameDocument.write('<html><body></body></html>');
    frameDocument.close();
    const canvas = frameDocument.createElement('canvas');
    const pixels = new Uint8ClampedArray(1024);
    const context = vi
      .spyOn(Object.getPrototypeOf(canvas) as HTMLCanvasElement, 'getContext')
      .mockReturnValue({
        drawImage: vi.fn(),
        getImageData: () => ({ data: pixels }),
      } as unknown as CanvasRenderingContext2D);
    canvas.id = 'videoCanvas';
    canvas.width = 640;
    frameDocument.body.append(canvas);
    try {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      pixels[0] = 10;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1000);
      });
      await click('[aria-label="Enable interaction"]');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(host.querySelector('iframe')).toBe(frame);
      expect(frame.style.pointerEvents).toBe('auto');
      await click('[aria-label="Disable interaction"]');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(host.querySelector('iframe')).toBe(frame);
      expect(frame.style.pointerEvents).toBe('none');
      expect(frame.inert).toBe(true);
    } finally {
      context.mockRestore();
    }
  });
  it('waits for the Host acknowledgement and ignores it after fullscreen collapses', async () => {
    const frame = await expand();
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(
      () =>
        new Promise<Response>((done) => {
          resolve = done;
        }),
    );
    await click('[aria-label="Enable interaction"]');
    expect(frame.style.pointerEvents).toBe('none');
    await click('[aria-label="Leave fullscreen"]');
    await act(async () => {
      takeover = true;
      resolve({ ok: true, json: async () => observation('/observation') } as Response);
    });
    expect(frame.style.pointerEvents).toBe('none');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
  it('shows a failed takeover in fullscreen and keeps input disabled', async () => {
    const frame = await expand();
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Pause failed'));
    await click('[aria-label="Enable interaction"]');
    expect(frame.style.pointerEvents).toBe('none');
    expect(host.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      'Pause failed',
    );
  });
  it('revokes interaction when the target switches away from Container', async () => {
    await expand();
    await click('[aria-label="Enable interaction"]');
    target = 'local';
    await poll();
    expect(host.querySelector('iframe')).toBeNull();
    target = 'container';
    await poll();
    expect(host.querySelector('iframe')!.style.pointerEvents).toBe('none');
  });
  it('coalesces slow observation polls while Human Open remains available', async () => {
    let resolve!: (response: object) => void;
    const delayed = new Promise<object>((done) => {
      resolve = done;
    });
    const fetch = vi.mocked(globalThis.fetch);
    fetch.mockImplementationOnce(() => delayed as Promise<Response>);
    await poll();
    const count = fetch.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(fetch.mock.calls.length).toBe(count);
    await act(async () =>
      [...host.querySelectorAll('button')]
        .find((b) => b.textContent === 'Open Bot Browser')!
        .click(),
    );
    expect(fetch.mock.calls.at(-1)?.[0]).toBe('/api/browser/open');
    await act(async () => resolve({ ok: true, json: async () => observation('/observation') }));
    expect(fetch.mock.calls.length).toBe(count + 2);
  });
});
