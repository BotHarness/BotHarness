// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MessagingDefaultsSettings } from '../src/client/messaging-defaults-settings.js';
import { en, zhTranslate } from '../src/client/locale.js';
import type { BridgeCall } from '../src/client/bridge.js';
const enTranslate: typeof zhTranslate = (key, params) => {
  let message = Object.entries(en).find(([name]) => name === key)?.[1] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    message = message.replaceAll(`{${name}}`, String(value));
  return message;
};
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
it.each([zhTranslate, enTranslate])(
  'shows only qualified owner-DM and typing defaults for WeChat (%#)',
  async (t) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const saves: unknown[] = [];
    const call: BridgeCall = async (method, payload) => {
      if (method === 'messagingDefaults')
        return {
          ok: true,
          value: {
            platform: payload.platform ?? 'feishu',
            revision: 0,
            changedAt: '',
            collection: payload.platform === 'weixin' ? 'all' : 'mentions',
            wake: payload.platform === 'weixin' ? 'immediate' : 'digest',
            count: 5,
            intervalSeconds: 30,
            identityEnabled: true,
            typingEnabled: true,
            newConversations: 'auto',
          },
        };
      if (method === 'messagingDefaultsSet') {
        saves.push(payload);
        return { ok: true, value: undefined };
      }
      throw new Error(method);
    };
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => root.render(createElement(MessagingDefaultsSettings, { call, t })));
      const platform = container.querySelector<HTMLSelectElement>(
        `[aria-label="${t('defaults.platform')}"]`,
      )!;
      await act(async () => {
        platform.value = 'weixin';
        platform.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const region = container.querySelector<HTMLElement>(
        '[role="region"][aria-label="WeChat / 微信"]',
      )!;
      expect(region.hidden).toBe(false);
      expect(region.querySelector('select')).toBeNull();
      expect(region.textContent).toContain(t('defaults.weixinScope'));
      expect(region.textContent).not.toContain(t('defaults.authorization'));
      expect(region.querySelectorAll('input[type="checkbox"]')).toHaveLength(2);
      await act(async () =>
        region
          .querySelector<HTMLButtonElement>(`[aria-label="${t('defaults.enableTyping')}"]`)!
          .click(),
      );
      await act(async () =>
        [...region.querySelectorAll('button')]
          .find((b) => b.textContent === t('defaults.save'))!
          .click(),
      );
      expect(saves).toEqual([
        {
          input: {
            platform: 'weixin',
            expectedRevision: 0,
            collection: 'all',
            wake: 'immediate',
            count: 5,
            intervalSeconds: 30,
            identityEnabled: true,
            typingEnabled: false,
            newConversations: 'auto',
          },
        },
      ]);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  },
);

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
    if (method === 'messagingDefaults')
      return {
        ok: true,
        value: {
          ...remote,
          platform: payload.platform ?? 'feishu',
          ...(payload.platform === 'weixin' ? { typingEnabled: true } : {}),
        },
      };
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
    const collection = container.querySelector<HTMLSelectElement>(
      'select[aria-label="默认收件条件"]',
    )!;
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
          newConversations: 'auto',
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

it.each(['slack', 'discord'] as const)(
  'keeps platform drafts and live revisions separate while switching and saving %s',
  async (targetPlatform) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const base = {
      collection: 'mentions' as const,
      wake: 'digest' as const,
      count: 5,
      intervalSeconds: 30,
      identityEnabled: true,
      revision: 0,
      changedAt: '',
    };
    const remote: Record<string, typeof base & { platform: string; typingEnabled?: boolean }> = {
      feishu: { ...base, platform: 'feishu' },
      slack: { ...base, platform: 'slack' },
      discord: { ...base, platform: 'discord' },
      weixin: { ...base, platform: 'weixin', typingEnabled: true },
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
      if (method === 'messagingDefaults')
        return { ok: true, value: remote[String(payload.platform ?? 'feishu')] };
      if (method === 'messagingDefaultsSet') {
        saves.push(payload);
        const input = payload.input as Record<string, unknown>;
        const platform = String(input.platform);
        remote[platform] = {
          ...remote[platform]!,
          count: Number(input.count),
          revision: remote[platform]!.revision + 1,
        };
        return { ok: true, value: remote[platform] };
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
      const platform = container.querySelector<HTMLSelectElement>(
        'select[aria-label="默认设置的平台"]',
      )!;
      const lark = container.querySelector<HTMLElement>('[role=region][aria-label="Lark / 飞书"]')!;
      const slack = container.querySelector<HTMLElement>(
        `[role=region][aria-label="${targetPlatform === 'slack' ? 'Slack' : 'Discord'}"]`,
      )!;
      const collection = lark.querySelector<HTMLSelectElement>('select')!;
      await act(async () => {
        collection.value = 'all';
        collection.dispatchEvent(new Event('change', { bubbles: true }));
        platform.value = targetPlatform;
        platform.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(slack.hidden).toBe(false);
      expect(lark.hidden).toBe(true);
      remote[targetPlatform] = { ...remote[targetPlatform]!, count: 2, revision: 1 };
      await act(async () => stream!.dispatchEvent(new Event('roster/changed')));
      expect(slack.querySelector<HTMLInputElement>('input[type=number]')!.value).toBe('2');
      expect(collection.value).toBe('all');
      expect(lark.textContent).toContain('当前全局版本：0');
      await act(async () => {
        const input = slack.querySelector<HTMLInputElement>('input[type=number]')!;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '3');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await act(async () =>
        [...slack.querySelectorAll('button')]
          .find((b) => b.textContent === '保存平台默认设置')!
          .click(),
      );
      expect(saves).toEqual([
        {
          input: {
            platform: targetPlatform,
            expectedRevision: 1,
            newConversations: 'auto',
            collection: 'mentions',
            wake: 'digest',
            count: 3,
            intervalSeconds: 30,
            identityEnabled: true,
          },
        },
      ]);
      expect(remote.feishu!.revision).toBe(0);
      await act(async () => {
        platform.value = 'feishu';
        platform.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(collection.value).toBe('all');
      expect(
        [...lark.querySelectorAll('button')].find((b) => b.textContent === '保存平台默认设置')!
          .disabled,
      ).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      vi.unstubAllGlobals();
    }
  },
);
