// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';
import { WindowCompanionView } from '../src/client/window-companion-view.js';
import { zhTranslate } from '../src/client/locale.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Menu: ({ anchor }: { anchor: ReactNode }) => anchor,
  IconEllipsisOutlineRegular: () => null,
  IconCloseFillRegular: () => null,
  IconNewChatOutlineRegular: () => null,
}));

it('drags inside the shell, lands on the floor without opening DM, persists keyboard movement and releases frames', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback);
    return frameId;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  const measurement = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 1000,
    bottom: 800,
    width: 1000,
    height: 800,
    toJSON: () => ({}),
  });
  const events = new EventTarget();
  const close = vi.fn();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close }),
  });
  await owner.start();
  owner.select('ada');
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
  const openDm = vi.fn();
  try {
    await act(() =>
      root.render(
        createElement(WindowCompanionView, {
          companion: owner,
          openDm,
          openAttention() {},
          openChannel() {},
          t: zhTranslate,
        }),
      ),
    );
    const character = node.querySelector('.bh-companion-character');
    const surface = node.querySelector('.bh-companion');
    if (!(character instanceof HTMLButtonElement) || !(surface instanceof HTMLElement))
      throw new Error('Missing companion controls');
    character.setPointerCapture = vi.fn();
    character.releasePointerCapture = vi.fn();
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      character.dispatchEvent(event);
    };
    await act(() => pointer('pointerdown', 700, 750));
    await act(() => pointer('pointermove', 400, 400));
    expect(Number.parseFloat(surface.style.bottom)).toBeGreaterThan(12);
    await act(() => {
      pointer('pointerup', 400, 400);
      character.click();
    });
    expect(surface.style.bottom).toBe('12px');
    expect(openDm).not.toHaveBeenCalled();
    await act(() => vi.runOnlyPendingTimers());
    await act(() =>
      character.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })),
    );
    expect(owner.getSnapshot().selection?.position).toBeCloseTo(
      Number.parseFloat(surface.style.left) / 896,
    );
    await act(() => character.click());
    expect(openDm).toHaveBeenCalledExactlyOnceWith('ada');
    expect(frames.size).toBeGreaterThan(0);
    await act(() => root.unmount());
    expect(frames.size).toBe(0);
  } finally {
    await act(() => root.unmount());
    owner.dispose();
    expect(close).toHaveBeenCalledOnce();
    node.remove();
    measurement.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }
});
