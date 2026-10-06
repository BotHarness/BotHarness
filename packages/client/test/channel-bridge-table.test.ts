// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Switch: ({
    checked,
    label,
    disabled,
    onChange,
  }: {
    checked: boolean;
    label: string;
    disabled?: boolean;
    onChange(value: boolean): void;
  }) =>
    createElement('button', {
      role: 'switch',
      'aria-checked': checked,
      'aria-label': label,
      disabled,
      onClick: () => onChange(!checked),
    }),
  Modal: ({ open, children, title }: PropsWithChildren<{ open: boolean; title: string }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children) : null,
}));
import { ChannelBridgeTable } from '../src/client/channel-bridge-table.js';
import { zhTranslate } from '../src/client/locale.js';
import type { ChannelBridgeSnapshot } from '../../core/src/messaging/channel-bridge.js';
it('Bridge Switch failures refresh committed state and stale edits preserve the draft with exact authority revisions', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: ChannelBridgeSnapshot = {
    channelId: 'group',
    sources: [],
    bridges: [
      {
        grantId: 'grant',
        grantRevision: 9,
        botSlug: 'ada',
        platform: 'feishu',
        accountName: 'QA receiving account',
        conversationName: 'QA group',
        ordinaryDelivery: 'unverified',
        name: 'QA intake',
        enabled: true,
        collection: 'mentions',
        revision: 3,
        availability: 'available',
        reception: 'receiving',
      },
    ],
  };
  const actions = {
    channelBridges: vi.fn(async () => snapshot),
    channelBridge: vi.fn(async () => {
      throw Object.assign(new Error('stale'), { code: 'bridge-stale' });
    }),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ChannelBridgeTable, {
          channelId: 'group',
          channelName: 'Shared work',
          botNames: new Map([['ada', 'Ada']]),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(actions.channelBridges).toHaveBeenCalledTimes(2);
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'grant',
      expectedGrantRevision: 9,
      expectedRevision: 3,
      name: 'QA intake',
      enabled: false,
      collection: 'mentions',
    });
    const edit = container.querySelector<HTMLButtonElement>(
      '[aria-label="编辑频道连接器：QA intake"]',
    )!;
    await act(async () => edit.click());
    const input = container.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Retained draft',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === zhTranslate('bridge.save'),
    )!;
    await act(async () => save.click());
    expect(input.value).toBe('Retained draft');
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      '配置已',
    );
    expect(container.querySelector<HTMLOptionElement>('option[value="all"]')?.disabled).toBe(true);
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'grant',
      expectedGrantRevision: 9,
      expectedRevision: 3,
      name: 'Retained draft',
      collectionInheritance: 'custom',
      enabled: true,
      collection: 'mentions',
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it('WeChat DM connector edits expose only supported paired-owner intake', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const snapshot: ChannelBridgeSnapshot = {
    channelId: 'group',
    sources: [],
    bridges: [
      {
        grantId: 'wechat',
        grantRevision: 2,
        botSlug: 'ada',
        platform: 'weixin',
        accountName: 'WeChat QA',
        conversationName: 'Paired owner',
        ordinaryDelivery: 'unverified',
        name: 'Owner intake',
        enabled: true,
        collection: 'all',
        collectionInheritance: 'custom',
        revision: 1,
        availability: 'available',
        reception: 'receiving',
      },
    ],
  };
  const actions = {
    channelBridges: vi.fn(async () => snapshot),
    channelBridge: vi.fn(async () => {}),
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ChannelBridgeTable, {
          channelId: 'group',
          channelName: 'Shared work',
          botNames: new Map([['ada', 'Ada']]),
          actions,
          t: zhTranslate,
        }),
      ),
    );
    expect(container.textContent).toContain('扫码绑定者私聊消息');
    expect(container.textContent).not.toContain(zhTranslate('bridge.unverified'));
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>('[aria-label="编辑频道连接器：Owner intake"]')!
        .click(),
    );
    const dialog = container.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain(zhTranslate('bridge.wechatDMHint'));
    expect(dialog.querySelector('option[value="mentions"]')).toBeNull();
    expect(dialog.querySelector('option[value="inherit"]')).toBeNull();
    const save = [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === zhTranslate('bridge.save'),
    )!;
    await act(async () => save.click());
    expect(actions.channelBridge).toHaveBeenLastCalledWith('group', {
      kind: 'update',
      grantId: 'wechat',
      expectedGrantRevision: 2,
      expectedRevision: 1,
      name: 'Owner intake',
      enabled: true,
      collection: 'all',
      collectionInheritance: 'custom',
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
