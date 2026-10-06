// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    size: _size,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; variant?: string }) =>
    createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
import { PairingSettings } from '../src/client/pairing-settings.js';
import { zhTranslate } from '../src/client/locale.js';
import type { PairingRequest } from '../../core/src/messaging/pairing.js';
const request: PairingRequest = {
  id: 'qa-request',
  reference: 'PAIRTEST',
  botSlug: 'ada',
  bindingId: 'lark-qa',
  accountName: 'QA Lark',
  actorId: 'ou_demo',
  actorName: 'Alice QA',
  conversationId: 'oc_demo',
  status: 'pending',
  capabilities: [],
  createdAt: '2026-10-06T00:00:00.000Z',
  expiresAt: '2026-10-06T00:10:00.000Z',
  revision: 1,
  attempts: 1,
};
it('no capability is preselected; Web submits only explicit capabilities with the exact request revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [request],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    const approve = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.approve'),
    )!;
    expect(approve.disabled).toBe(true);
    expect(Array.from(host.querySelectorAll('input')).every((input) => !input.checked)).toBe(true);
    await act(async () => host.querySelector('input')!.click());
    expect(approve.disabled).toBe(false);
    await act(async () => approve.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'approve',
      id: request.id,
      expectedRevision: 1,
      capabilities: ['approve'],
    });
    expect(host.textContent).toContain('ou_demo');
    expect(host.textContent).toContain('QA Lark');
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, revision: 2 }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(Array.from(host.querySelectorAll('input')).every((input) => !input.checked)).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
it('approved authority lists only the granted capabilities and offers revocation with an exact revision', async () => {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host),
    review = vi.fn(async () => {});
  try {
    await act(async () =>
      root.render(
        createElement(PairingSettings, {
          requests: [{ ...request, status: 'approved', revision: 2, capabilities: ['answer'] }],
          busy: false,
          refresh: async () => {},
          review,
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelectorAll('input')).toHaveLength(0);
    const revoke = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === zhTranslate('pairing.revoke'),
    )!;
    await act(async () => revoke.click());
    expect(review).toHaveBeenCalledExactlyOnceWith({
      kind: 'revoke',
      id: request.id,
      expectedRevision: 2,
    });
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
