// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Modal: ({
    open,
    title,
    children,
    onClose,
  }: PropsWithChildren<{ open: boolean; title: string; onClose(): void }>) =>
    open
      ? createElement(
          'div',
          { role: 'dialog', 'aria-label': title },
          children,
          createElement('button', { onClick: onClose }, 'Close'),
        )
      : null,
}));
import { BridgeSourceAuthor } from '../src/client/bridge-source-author.js';
import { zhTranslate } from '../src/client/locale.js';

it('opens only the selected source details, restores compact presentation on close, and supports a thread', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () =>
      root.render(
        createElement(BridgeSourceAuthor, {
          origin: {
            platform: 'feishu',
            conversationName: 'QA <group>',
            conversationId: 'conversation',
            sourceEventId: 'canonical-source',
            senderId: 'sender',
            messageId: 'message',
            threadId: 'thread',
          },
          t: zhTranslate,
        }),
      ),
    );
    const button = container.querySelector('button')!;
    expect(button.textContent).toBe('【Lark/飞书 QA <group>】');
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(container.querySelector('[role=dialog]')).toBeNull();
    await act(async () => button.click());
    const dialog = container.querySelector('[role=dialog]')!;
    expect(dialog.getAttribute('aria-label')).toBe('来源详情');
    expect([...dialog.querySelectorAll('dd')].map((e) => e.textContent)).toEqual([
      'Lark/飞书',
      'QA <group>',
      'conversation',
      'sender',
      'message',
      'canonical-source',
      'thread',
    ]);
    expect(dialog.querySelector('group')).toBeNull();
    await act(async () => dialog.querySelector('button')!.click());
    expect(container.querySelector('[role=dialog]')).toBeNull();
    expect(container.textContent).toBe('【Lark/飞书 QA <group>】');
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
