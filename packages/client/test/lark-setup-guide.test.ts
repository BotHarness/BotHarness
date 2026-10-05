// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren, type MouseEventHandler } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { MessagingTarget } from '../../core/src/messaging/provider.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: PropsWithChildren<{ onClick?: MouseEventHandler<HTMLButtonElement>; disabled?: boolean }>) =>
    createElement('button', { onClick, disabled }, children),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Modal: ({ open, children, title }: PropsWithChildren<{ open: boolean; title: string }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children) : null,
}));

import { LarkSetupGuide } from '../src/client/lark-setup-guide.js';
import { zhTranslate } from '../src/client/locale.js';

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

const target: MessagingTarget = {
  ref: 'qa',
  name: 'QA',
  digest: 'saved',
  receiveScope: { kind: 'group', conversationId: 'oc-qa' },
};

async function choose(key: string) {
  const account = container.querySelectorAll('select')[1]!;
  await act(async () => {
    account.value = key;
    account.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

it('recognizes a saved group target independently and returns it to unconfirmed on disconnection', async () => {
  const current = snapshot();
  const loadTargets = vi.fn(async () => [target]);
  const refresh = vi.fn(async () => {});
  const render = () =>
    root.render(
      createElement(LarkSetupGuide, { snapshot: current, t: zhTranslate, refresh, loadTargets }),
    );
  await act(async () => render());
  await act(async () => container.querySelector('button')!.click());
  await choose('dsh-im/feishu:one');
  expect(loadTargets).toHaveBeenCalledWith('dsh-im/feishu', 'one');
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[1]?.textContent).toContain('待确认');
  await act(async () => {
    const group = container.querySelectorAll('select')[2]!;
    group.value = 'qa';
    group.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[1]?.textContent).toContain('已确认');
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[2]?.textContent).toContain('待确认');
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[4]?.textContent).toContain('待确认');
  current.accounts[0]!.connected = false;
  await act(async () => render());
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[1]?.textContent).toContain('待确认');
});

it('ignores a delayed target response after a different account is selected', async () => {
  let resolveOne: (value: MessagingTarget[]) => void = () => {};
  const delayed = new Promise<MessagingTarget[]>((resolve) => {
    resolveOne = resolve;
  });
  const loadTargets = vi.fn(async (_provider: string, account: string) =>
    account === 'one' ? delayed : [],
  );
  await act(async () =>
    root.render(
      createElement(LarkSetupGuide, {
        snapshot: snapshot(),
        t: zhTranslate,
        refresh: async () => {},
        loadTargets,
      }),
    ),
  );
  await act(async () => container.querySelector('button')!.click());
  await choose('dsh-im/feishu:one');
  await choose('dsh-im/feishu:two');
  await act(async () => resolveOne([target]));
  expect(container.querySelectorAll('.bh-lark-setup-steps li')[1]?.textContent).toContain('待确认');
});
