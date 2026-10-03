// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MessagingDefaultsSettings } from '../src/client/messaging-defaults-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Switch: ({
    checked,
    label,
    onChange,
  }: {
    checked: boolean;
    label: string;
    onChange(v: boolean): void;
  }) =>
    createElement('input', {
      type: 'checkbox',
      checked,
      'aria-label': label,
      onChange: () => onChange(!checked),
    }),
}));
it('keeps a dirty draft at its captured revision, refuses a stale save, and refreshes explicitly', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let remote = {
    platform: 'feishu',
    collection: 'mentions',
    wake: 'digest',
    count: 5,
    intervalSeconds: 30,
    identityEnabled: true,
    revision: 1,
    changedAt: '2026-10-03T00:00:00Z',
  };
  let stream: EventTarget | undefined;
  class Events extends EventTarget {
    constructor() {
      super();
      stream = this;
    }
    close() {}
  }
  vi.stubGlobal('EventSource', Events);
  const saves: unknown[] = [];
  const call: BridgeCall = async (method, payload) => {
    if (method === 'messagingDefaults') return { ok: true, value: remote };
    if (method === 'messagingDefaultsSet') {
      saves.push(payload);
      return { ok: false, error: { code: 'defaults-stale', message: 'stale', details: {} } };
    }
    throw new Error(method);
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(createElement(MessagingDefaultsSettings, { call, t: zhTranslate })),
    );
    const collection = container.querySelector('select')!;
    await act(async () => {
      collection.value = 'all';
      collection.dispatchEvent(new Event('change', { bubbles: true }));
    });
    remote = { ...remote, count: 2, revision: 2 };
    await act(async () => stream!.dispatchEvent(new Event('roster/changed')));
    expect(collection.value).toBe('all');
    const save = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '保存平台默认设置',
    )!;
    await act(async () => save.click());
    expect(saves).toEqual([
      {
        input: {
          platform: 'feishu',
          expectedRevision: 1,
          collection: 'all',
          wake: 'digest',
          count: 5,
          intervalSeconds: 30,
          identityEnabled: true,
        },
      },
    ]);
    expect(container.querySelector('[role=alert]')?.textContent).toContain('已被其他操作修改');
    await act(async () =>
      [...container.querySelectorAll('button')].find((b) => b.textContent === '刷新')!.click(),
    );
    expect(collection.value).toBe('mentions');
    expect((container.querySelector('input[type=number]') as HTMLInputElement).value).toBe('2');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  }
});
