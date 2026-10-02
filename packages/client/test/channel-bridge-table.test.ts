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
      enabled: true,
      collection: 'mentions',
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
