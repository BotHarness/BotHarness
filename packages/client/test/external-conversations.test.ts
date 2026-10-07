// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingSnapshot } from '../../core/src/messaging/outbound.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => ({
  ...(await import('./primitive-mocks.js')).comboboxPrimitives(),
  IconInfoOutlineRegular: () => null,
  Tooltip: ({ children }: PropsWithChildren) => children,
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Input: (props: Record<string, unknown>) => createElement('input', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  Modal: () => null,
}));
import { ExternalConversations } from '../src/client/external-conversations.js';
import { zhTranslate } from '../src/client/locale.js';

const identity = {
  id: 'binding',
  botSlug: 'ada',
  providerId: 'dsh-im/feishu',
  platform: 'feishu',
  accountRef: 'app',
  fingerprint: 'a'.repeat(64),
  name: 'QA Bot',
  enabled: true,
  revision: 2,
  createdAt: '2026-10-07T00:00:00Z',
  availability: 'available' as const,
  newConversations: 'ask' as const,
  grantCount: 2,
  scopes: [],
};

const entry = (id: string, name: string, muted: boolean) =>
  ({
    id,
    bindingId: 'binding',
    targetName: name,
    revision: 3,
    preferenceRevision: muted ? 1 : undefined,
    muted,
    receiveScope: { kind: 'group', conversationId: `oc_${id}` },
  }) as unknown as MessagingSnapshot['grants'][number];

const snapshot: MessagingSnapshot = {
  accounts: [],
  identities: [identity],
  grants: [entry('g1', 'Team', false), entry('g2', 'Noisy', true)],
  intents: [],
  heldConversations: [
    {
      bindingId: 'binding',
      conversation: { kind: 'dm', id: 'oc_new' },
      name: 'Stranger',
      reason: 'hourly-limit',
      firstSeenAt: '2026-10-07T00:00:00Z',
      lastSeenAt: '2026-10-07T00:01:00Z',
      count: 3,
      revision: 1,
    },
  ],
  blockedConversations: [
    {
      botSlug: 'ada',
      fingerprint: 'a'.repeat(64),
      bindingId: 'binding',
      conversation: { kind: 'group', id: 'oc_spam' },
      name: 'Spam',
      blockedAt: '2026-10-07T00:00:00Z',
      revision: 2,
    },
  ],
};

it('groups conversations, confirms Block before sending it, and sends revision-checked commands', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const change = vi.fn(async () => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(ExternalConversations, {
        identity,
        snapshot,
        busy: false,
        t: zhTranslate,
        change,
        rules: vi.fn(),
      }),
    ),
  );
  const groups = [...container.querySelectorAll('section')].map((s) => [
    s.getAttribute('aria-label'),
    [...s.querySelectorAll('.bh-card-title')].map((n) => n.textContent),
  ]);
  expect(groups).toEqual([
    ['等待处理', ['Stranger']],
    ['活跃', ['Team']],
    ['已静音', ['Noisy']],
    ['已屏蔽', ['Spam']],
  ]);
  expect(container.textContent).toContain('已达每小时 20 个新会话上限');
  const button = (section: number, label: string) =>
    [...container.querySelectorAll('section')[section]!.querySelectorAll('button')].find(
      (b) => b.textContent === label,
    )!;
  await act(async () => button(1, '屏蔽').click());
  expect(change).not.toHaveBeenCalled();
  await act(async () => button(1, '确认屏蔽').click());
  expect(change).toHaveBeenLastCalledWith({ kind: 'block', grantId: 'g1', expectedRevision: 3 });
  await act(async () => button(2, '取消静音').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'mute',
    grantId: 'g2',
    expectedRevision: 1,
    muted: false,
  });
  await act(async () => button(0, '允许').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'allow',
    bindingId: 'binding',
    conversation: { kind: 'dm', id: 'oc_new' },
    from: 'held',
    expectedRevision: 1,
  });
  await act(async () => button(3, '再次允许').click());
  expect(change).toHaveBeenLastCalledWith({
    kind: 'allow',
    bindingId: 'binding',
    conversation: { kind: 'group', id: 'oc_spam' },
    from: 'blocked',
    expectedRevision: 2,
  });
  await act(async () => root.unmount());
  container.remove();
});
