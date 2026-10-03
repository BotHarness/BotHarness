// @vitest-environment jsdom
import {
  act,
  createElement,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type PropsWithChildren,
} from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { MemberWakePolicyModal } from '../src/client/group-member-controls.js';
import { zhTranslate } from '../src/client/locale.js';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: (props: ButtonHTMLAttributes<HTMLButtonElement>) => createElement('button', props),
  Input: (props: InputHTMLAttributes<HTMLInputElement>) => createElement('input', props),
}));
vi.mock('../src/client/modal.js', () => ({
  Modal: ({ children, footer }: PropsWithChildren<{ footer: React.ReactNode }>) =>
    createElement('div', null, children, footer),
}));
it('restores saved inheritance even when the current threshold draft is invalid', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const setGroupWakePolicy = vi.fn(async () => true),
    onClose = vi.fn();
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(MemberWakePolicyModal, {
          group: {
            id: 'team',
            type: 'group',
            name: 'Team',
            createdAt: '2026-10-03T00:00:00Z',
            updatedAt: '2026-10-03T00:00:00Z',
            members: ['ada'],
            wakePolicies: { ada: { mode: 'digest', count: 2, intervalSeconds: 120, revision: 1 } },
          },
          slug: 'ada',
          name: 'Ada',
          t: zhTranslate,
          actions: { setGroupWakePolicy },
          onClose,
        }),
      ),
    );
    const input = container.querySelector<HTMLInputElement>('input')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '0');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.find((b) => b.textContent === '保存提醒设置')!.disabled).toBe(true);
    await act(async () => buttons.find((b) => b.textContent === '恢复继承')!.click());
    expect(setGroupWakePolicy).toHaveBeenCalledWith('team', 'ada', {
      mode: 'digest',
      count: 2,
      intervalSeconds: 120,
      inherit: true,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
