// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { MessagingGrant, MessagingSnapshot } from '../../core/src/messaging/outbound.js';
import type { BridgeActions } from '../src/client/actions.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
  IconChevronRightOutlineRegular: () => null,
}));

import { MessagingProfile } from '../src/client/messaging-profile.js';
import { zhTranslate } from '../src/client/locale.js';

it('requires explicit target authorization and an explicit send; unknown outcomes survive refresh without resend', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const account = {
    providerId: 'test',
    ref: 'account',
    platform: 'test',
    name: 'Test account',
    fingerprint: 'a'.repeat(64),
    connected: true,
  };
  const target = { ref: 'self', name: 'Self', digest: 'b'.repeat(64) };
  const grant: MessagingGrant = {
    id: 'grant',
    bindingId: 'binding',
    botSlug: 'ada',
    providerId: 'test',
    accountRef: account.ref,
    accountName: account.name,
    fingerprint: account.fingerprint,
    platform: 'test',
    targetRef: target.ref,
    targetName: target.name,
    targetDigest: target.digest,
    revision: 1,
    createdAt: '2026-10-01T00:00:00Z',
  };
  let snapshot: MessagingSnapshot = { accounts: [account], grants: [], intents: [] };
  const messagingAuthorize = vi.fn(async () => {
    snapshot = { ...snapshot, grants: [{ ...grant, availability: 'available' }] };
    return grant;
  });
  const messagingSend = vi.fn(
    async (_slug: string, grantId: string, requestId: string, text: string) => {
      expect(grantId).toBe(grant.id);
      expect(requestId.length).toBeGreaterThan(0);
      const intent = {
        id: 'intent',
        botSlug: 'ada',
        grantId,
        grantRevision: 1,
        text,
        state: 'unknown-outcome' as const,
        createdAt: '2026-10-01T00:00:01Z',
      };
      snapshot = { ...snapshot, intents: [intent] };
      return intent;
    },
  );
  const actions: Pick<
    BridgeActions,
    | 'messagingSnapshot'
    | 'messagingTargets'
    | 'messagingAuthorize'
    | 'messagingRevoke'
    | 'messagingSend'
  > = {
    messagingSnapshot: async () => snapshot,
    messagingTargets: async () => [target],
    messagingAuthorize,
    messagingRevoke: async () => undefined,
    messagingSend,
  };
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const button = (label: string) => {
    const node = [...container.querySelectorAll('button')].find(
      (item) => item.textContent === label,
    );
    if (!node) throw new Error(`missing button ${label}`);
    return node;
  };
  const select = async (label: string, value: string) => {
    const node = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    if (!node) throw new Error(`missing selector ${label}`);
    await act(async () => {
      node.value = value;
      node.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  try {
    await act(async () =>
      root.render(createElement(MessagingProfile, { slug: 'ada', actions, t: zhTranslate })),
    );
    expect(messagingAuthorize).not.toHaveBeenCalled();
    expect(messagingSend).not.toHaveBeenCalled();
    expect(button(zhTranslate('im.authorize')).disabled).toBe(true);
    await select(zhTranslate('im.account'), 'test:account');
    await select(zhTranslate('im.target'), 'self');
    expect(messagingAuthorize).not.toHaveBeenCalled();
    await act(async () => button(zhTranslate('im.authorize')).click());
    expect(messagingAuthorize).toHaveBeenCalledWith({
      botSlug: 'ada',
      providerId: 'test',
      accountRef: 'account',
      fingerprint: account.fingerprint,
      targetRef: 'self',
      targetDigest: target.digest,
    });
    expect(messagingSend).not.toHaveBeenCalled();
    const textarea = container.querySelector('textarea');
    if (!textarea) throw new Error('missing message');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
        textarea,
        'Hello',
      );
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button(zhTranslate('im.send')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(zhTranslate('im.unknown'));
    expect(container.textContent).toContain(zhTranslate('im.noRetry'));
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(messagingSend).toHaveBeenCalledTimes(1);
    snapshot = { ...snapshot, grants: [{ ...grant, availability: 'rebind-required' }] };
    await act(async () => button(zhTranslate('im.refresh')).click());
    expect(container.textContent).toContain(zhTranslate('im.rebind'));
    expect(button(zhTranslate('im.send')).disabled).toBe(true);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
