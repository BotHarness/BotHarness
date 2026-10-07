// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { ChannelBridgeSnapshot } from '../../core/src/messaging/channel-bridge.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  Button: ({
    variant: _variant,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', { className: 'tag' }, children),
  Switch: ({ label, checked }: { label: string; checked: boolean }) =>
    createElement('button', { role: 'switch', 'aria-label': label, 'aria-checked': checked }),
  Checkbox: () => null,
  IconInfoOutlineRegular: () => null,
  Tooltip: ({ children }: PropsWithChildren) => children,
  Modal: ({
    open,
    title,
    children,
    footer,
  }: PropsWithChildren<{ open: boolean; title: string; footer?: ReactNode }>) =>
    open ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer) : null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { Combobox } from '../src/client/combobox.js';
import {
  ExternalConnectorsEntry,
  ExternalIdentitiesEntry,
} from '../src/client/external-entries.js';
import { zhTranslate } from '../src/client/locale.js';
import { useMessagingSnapshot } from '../src/client/messaging-store.js';
import { revealSidebarAnchor } from '../src/client/sidebar-anchor.js';
import { combobox, comboboxOption, openCombobox } from './primitive-mocks.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

const snapshot: MessagingSnapshot = {
  accounts: [
    {
      providerId: 'dsh-im/feishu',
      ref: 'qa',
      platform: 'feishu',
      name: 'QA Lark',
      fingerprint: 'a'.repeat(64),
      connected: true,
    },
  ],
  identities: [
    {
      id: 'binding',
      botSlug: 'ada',
      providerId: 'dsh-im/feishu',
      platform: 'feishu',
      accountRef: 'qa',
      fingerprint: 'a'.repeat(64),
      name: 'Ada on Lark',
      enabled: true,
      revision: 1,
      createdAt: '2026-10-07T00:00:00Z',
      availability: 'available',
      newConversations: 'auto',
      grantCount: 0,
      scopes: [],
    },
  ],
  grants: [],
  intents: [],
  pairings: [
    {
      id: 'request',
      reference: 'PAIR',
      botSlug: 'ada',
      bindingId: 'binding',
      accountName: 'QA Lark',
      actorId: 'ou_demo',
      conversationId: 'oc_demo',
      status: 'pending',
      capabilities: [],
      createdAt: '2026-10-07T00:00:00Z',
      expiresAt: '2026-10-07T00:10:00Z',
      revision: 1,
      attempts: 1,
    },
  ],
};

const bridges: ChannelBridgeSnapshot = {
  channelId: 'dm',
  sources: [],
  bridges: [
    {
      grantId: 'grant',
      grantRevision: 1,
      botSlug: 'ada',
      platform: 'feishu',
      accountName: 'QA Lark',
      conversationName: 'QA group',
      ordinaryDelivery: 'verified',
      name: 'QA intake',
      enabled: true,
      collection: 'mentions',
      revision: 1,
      availability: 'available',
      reception: 'receiving',
    },
  ],
};

const actions = {
  messagingSnapshot: vi.fn(async () => snapshot),
  messagingIdentity: vi.fn(),
  messagingTargets: vi.fn(async () => []),
  pairingReview: vi.fn(),
  channelBridges: vi.fn(async () => bridges),
  channelBridge: vi.fn(),
} as unknown as BridgeActions;

const props = {
  scope: 'personabot' as const,
  channelId: 'dm',
  botSlug: 'ada',
  actions,
  t: zhTranslate,
};

it('lists the Bot identities, the Lark guide and pending pairings as sidebar rows', async () => {
  await act(async () => root.render(createElement(ExternalIdentitiesEntry, props)));
  const titles = [...host.querySelectorAll('.bh-card-title')].map((node) => node.textContent);
  expect(titles).toEqual([
    'Ada on Lark',
    zhTranslate('identity.bind'),
    zhTranslate('setup.title'),
    zhTranslate('pairing.title'),
    zhTranslate('approvalIm.title'),
  ]);
  expect(host.querySelector('[role="switch"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('identity.enableFor', { name: 'Ada on Lark' }),
  );
  expect(host.textContent).toContain(zhTranslate('pairing.pendingCount', { count: 1 }));
  expect(host.querySelector('[data-anchor="lark-bind"]')).not.toBeNull();
});

it('lists connectors as rows with the conversation authorization row last', async () => {
  await act(async () => root.render(createElement(ExternalConnectorsEntry, props)));
  const rows = [...host.querySelectorAll('.bh-card-row')];
  expect(rows.map((row) => row.querySelector('.bh-card-title')?.textContent)).toEqual([
    'QA intake',
    zhTranslate('bridge.add'),
    zhTranslate('im.authorizeRow'),
  ]);
  expect(rows[0]?.textContent).toContain('QA group');
  expect(rows[0]?.textContent).toContain(zhTranslate('bridge.state.receiving'));
  expect(rows[2]?.getAttribute('data-anchor')).toBe('lark-grant');
  await act(async () => rows[0]!.querySelector<HTMLButtonElement>('.bh-card-main')!.click());
  expect(host.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe(
    zhTranslate('bridge.edit'),
  );
});

it('expands a collapsed sidebar entry to reveal a guide anchor', async () => {
  document.body.innerHTML =
    '<div data-entry-id="external-connectors"><button aria-expanded="false">entry</button></div>';
  const head = document.querySelector('button')!;
  head.addEventListener('click', () => {
    const row = document.createElement('li');
    row.dataset.anchor = 'lark-grant';
    document.querySelector('[data-entry-id]')!.append(row);
  });
  const ready = vi.fn();
  const unavailable = vi.fn();
  revealSidebarAnchor(document, 'external-connectors', 'lark-grant', ready, unavailable);
  await act(async () => undefined);
  expect(ready).toHaveBeenCalledWith(document.querySelector('[data-anchor="lark-grant"]'));
  expect(unavailable).not.toHaveBeenCalled();
  revealSidebarAnchor(document, 'external-identities', 'lark-bind', ready, unavailable);
  expect(unavailable).toHaveBeenCalledTimes(1);
});

it('keeps disabled combobox options out of keyboard and click selection', async () => {
  const onSelect = vi.fn();
  await act(async () =>
    root.render(
      createElement(Combobox, {
        label: 'Account',
        toggleLabel: 'Account',
        value: '',
        onSelect,
        options: [
          { value: 'offline', label: 'Offline', disabled: true },
          { value: 'online', label: 'Online' },
        ],
      }),
    ),
  );
  await openCombobox('Account');
  expect(comboboxOption('offline')?.disabled).toBe(true);
  const input = combobox('Account');
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true })),
  );
  await act(async () =>
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })),
  );
  expect(onSelect).toHaveBeenCalledExactlyOnceWith('online');
});

it('clears a failed load after a successful explicit refresh', async () => {
  const messagingSnapshot = vi
    .fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValue(snapshot);
  const store = { messagingSnapshot } as unknown as BridgeActions;
  let refresh: () => Promise<void> = async () => undefined;
  function Probe() {
    const state = useMessagingSnapshot('refresh-probe', store);
    refresh = state.refresh;
    return createElement('div', { ref: state.mount }, state.failed ? 'failed' : 'ok');
  }
  await act(async () => root.render(createElement(Probe)));
  expect(host.textContent).toBe('failed');
  await act(async () => refresh());
  expect(host.textContent).toBe('ok');
});
