// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  IconInfoOutlineRegular: () => null,
  Tooltip: ({ children }: PropsWithChildren) => children,
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
  Modal: ({
    open,
    children,
    title,
    footer,
  }: PropsWithChildren<{ open: boolean; title: string; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
}));
import { ExternalIdentityList } from '../src/client/external-identity-list.js';
import { zhTranslate } from '../src/client/locale.js';

it('failed Switch writes retain the committed preference; stale Modal edits retain input rather than overwrite', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const identity = {
    id: 'binding',
    botSlug: 'ada',
    providerId: 'lark',
    platform: 'feishu',
    accountRef: 'app',
    fingerprint: 'a'.repeat(64),
    name: 'QA Bot',
    enabled: true,
    revision: 7,
    createdAt: '2026-10-02T00:00:00Z',
    availability: 'available' as const,
    grantCount: 1,
    scopes: ['QA group'],
  };
  const snapshot: MessagingSnapshot = {
    accounts: [],
    identities: [identity],
    grants: [],
    intents: [],
  };
  const mutate = vi.fn(async () => {
    throw Object.assign(new Error('stale'), { code: 'identity-stale' });
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(ExternalIdentityList, {
          snapshot,
          t: zhTranslate,
          mutate,
        }),
      ),
    );
    const toggle = container.querySelector<HTMLButtonElement>('[role="switch"]')!;
    await act(async () => toggle.click());
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'update',
      id: 'binding',
      expectedRevision: 7,
      name: 'QA Bot',
      enabled: false,
    });
    const edit = container.querySelector<HTMLButtonElement>('[title="编辑身份：QA Bot"]')!;
    await act(async () => edit.click());
    const input = container.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        'Retained edit',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const save = [...container.querySelectorAll<HTMLButtonElement>('button')].find(
      (b) => b.textContent === '保存身份',
    )!;
    await act(async () => save.click());
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(input.value).toBe('Retained edit');
    expect(container.querySelector('[role="dialog"] [role="alert"]')?.textContent).toContain(
      '配置已在另一处更改',
    );
    expect(mutate).toHaveBeenLastCalledWith({
      kind: 'update',
      id: 'binding',
      expectedRevision: 7,
      name: 'Retained edit',
      inheritEnabled: false,
      enabled: true,
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
