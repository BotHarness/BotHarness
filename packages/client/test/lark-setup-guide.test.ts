// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type MouseEventHandler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: ({
    children,
    onClick,
    disabled,
  }: PropsWithChildren<{ onClick?: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }>) =>
    createElement('button', { onClick, disabled }, children),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Tooltip: ({ children }: PropsWithChildren) => children,
  IconInfoOutlineRegular: () => null,
  Modal: ({ open, children, title }: PropsWithChildren<{ open: boolean; title: string }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children) : null,
}));

import { LarkSetupGuide } from '../src/client/lark-setup-guide.js';
import { zhTranslate } from '../src/client/locale.js';
import { chooseOption } from './primitive-mocks.js';

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const snapshot = (): MessagingSnapshot => ({
  accounts: ['one', 'two'].map((ref) => ({
    providerId: 'dsh-im/feishu',
    ref,
    platform: 'feishu',
    name: ref,
    fingerprint: ref,
    connected: true,
  })),
  grants: [],
  identities: [],
  intents: [],
  setup: { providerReady: true, receipts: [] },
});

async function choose(key: string) {
  await chooseOption(zhTranslate('im.account'), key);
}

const steps = () =>
  [...container.querySelectorAll('.bh-lark-setup-steps li')].map((li) =>
    li.textContent?.includes('已确认'),
  );

it('walks three steps from a connected app to a bound Bot and returns to unconfirmed on disconnection', async () => {
  const current = snapshot();
  const refresh = vi.fn(async () => {});
  const render = () =>
    root.render(createElement(LarkSetupGuide, { snapshot: current, t: zhTranslate, refresh }));
  await act(async () => render());
  await act(async () => container.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  expect(steps()).toEqual([false, false, false]);
  await choose('dsh-im/feishu:one');
  expect(steps()).toEqual([true, false, false]);
  current.identities = [
    {
      id: 'identity',
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      accountRef: 'one',
      platform: 'feishu',
      name: 'one',
      fingerprint: 'one',
      enabled: true,
      availability: 'available',
      newConversations: 'auto',
      revision: 1,
      createdAt: 'now',
      grantCount: 0,
      scopes: [],
    },
  ];
  await act(async () => render());
  expect(steps()).toEqual([true, true, false]);
  current.accounts[0]!.connected = false;
  await act(async () => render());
  expect(steps()).toEqual([false, true, false]);
});
