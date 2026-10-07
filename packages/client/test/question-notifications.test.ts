// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { QuestionDelivery } from '../../core/src/messaging/question-messaging.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
import { QuestionNotifications } from '../src/client/question-notifications.js';
import { zhTranslate } from '../src/client/locale.js';

it('offers explicit native reconciliation for uncertain submission but never resends uncertain delivery', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const repair = vi.fn(async () => undefined),
    openSession = vi.fn();
  const base: QuestionDelivery = {
    id: 'question-1',
    botSlug: 'ada',
    sessionId: 'native-session',
    reference: 'A'.repeat(12),
    questionHash: 'a'.repeat(64),
    route: {
      botSlug: 'ada',
      revision: 1,
      pairingId: 'pairing',
      pairingRevision: 2,
      bindingId: 'binding',
    },
    createdAt: '2026-10-07T00:00:00Z',
    status: 'pending',
    delivery: 'unknown-outcome',
    attempts: 1,
    submission: 'none',
    update: 'none',
  };
  try {
    await act(async () =>
      root.render(
        createElement(QuestionNotifications, {
          deliveries: [base],
          busy: false,
          repair,
          openSession,
          t: zhTranslate,
        }),
      ),
    );
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(host.textContent).toContain(zhTranslate('approvalIm.unknownHint'));
    await act(async () => host.querySelector('button')!.click());
    expect(openSession).toHaveBeenCalledWith('native-session');
    expect(repair).not.toHaveBeenCalled();
    await act(async () =>
      root.render(
        createElement(QuestionNotifications, {
          deliveries: [
            { ...base, delivery: 'sent', status: 'answered', submission: 'unknown-outcome' },
          ],
          busy: false,
          repair,
          openSession,
          t: zhTranslate,
        }),
      ),
    );
    const reconcile = [...host.querySelectorAll('button')].find(
      (button) => button.textContent === zhTranslate('questionIm.reconcile'),
    )!;
    await act(async () => reconcile.click());
    expect(repair).toHaveBeenCalledWith('question-1');
    expect(host.textContent).toContain(zhTranslate('questionIm.submission.unknown-outcome'));
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
