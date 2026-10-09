// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: ({
    anchor,
    open,
    items,
    listClassName,
    onClose,
  }: {
    anchor: ReactNode;
    open: boolean;
    items: { id: string; label?: string }[];
    listClassName?: string;
    onClose(): void;
  }) =>
    createElement(
      'div',
      {},
      anchor,
      open
        ? createPortal(
            createElement(
              'div',
              {
                role: 'menu',
                className: listClassName,
                onKeyDown: (event: { key: string; currentTarget: HTMLElement }) => {
                  if (event.key === 'Escape') onClose();
                  if (event.key === 'ArrowDown') {
                    const rows = [
                      ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
                    ];
                    rows[
                      (rows.findIndex((row) => row === document.activeElement) + 1) % rows.length
                    ]?.focus();
                  }
                },
              },
              items
                .filter((item) => item.label)
                .map((item) =>
                  createElement(
                    'button',
                    {
                      key: item.id,
                      role: 'menuitem',
                    },
                    item.label,
                  ),
                ),
            ),
            document.body,
          )
        : null,
    ),
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
}));

it('hands character keyboard focus to the portaled menu and restores it after dismissal', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.stubGlobal('requestAnimationFrame', () => 1);
  vi.stubGlobal('cancelAnimationFrame', () => {});
  const events = new EventTarget();
  const companion = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  await companion.start();
  companion.select('ada');
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        bot: { slug: 'ada', name: 'Ada', paused: false },
        activity: { generation: 'host', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
      }),
    }),
  );
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion,
          openDm() {},
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    const character = node.querySelector('.bh-companion-character');
    if (!(character instanceof HTMLButtonElement)) throw new Error('Missing character');
    await act(() => character.focus());
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'F10',
          shiftKey: true,
          bubbles: true,
        }),
      ),
    );
    await act(() => vi.advanceTimersByTime(0));
    const rows = [...document.querySelectorAll<HTMLButtonElement>('[role="menu"] button')];
    expect(rows.length).toBeGreaterThan(2);
    expect(document.activeElement).toBe(rows[0]);
    await act(() =>
      rows[0]!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'ArrowDown',
          bubbles: true,
        }),
      ),
    );
    expect(document.activeElement).toBe(rows[1]);
    await act(() =>
      rows[1]!.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          bubbles: true,
        }),
      ),
    );
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(character);
    await act(() =>
      character.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'F10', shiftKey: true, bubbles: true }),
      ),
    );
    await act(() => root.unmount());
    const survivingControl = document.createElement('button');
    document.body.append(survivingControl);
    survivingControl.focus();
    await act(() => vi.advanceTimersByTime(0));
    expect(document.activeElement).toBe(survivingControl);
    survivingControl.remove();
  } finally {
    await act(() => root.unmount());
    companion.dispose();
    node.remove();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
