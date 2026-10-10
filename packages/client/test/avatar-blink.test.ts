// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';

it('staggers different Bots with the same appearance while keeping each eye pair synchronized', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: {
    target: Element;
    options: KeyframeAnimationOptions;
    cancel: ReturnType<typeof vi.fn>;
  }[] = [];
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  const previousHidden = Object.getOwnPropertyDescriptor(document, 'hidden');
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    value: function (this: Element, _frames: Keyframe[], options: KeyframeAnimationOptions) {
      const animation = { target: this, options, cancel: vi.fn(), finished: Promise.resolve() };
      if (options.iterations === Infinity) loops.push(animation);
      return animation;
    },
  });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const render = (state: 'idle' | 'working') =>
    act(async () =>
      root.render(
        createElement(
          'div',
          null,
          ...['ada', 'grace'].map((personaBotId) =>
            createElement(PersonaBotAvatar, {
              key: personaBotId,
              personaBotId,
              name: personaBotId,
              size: 96,
              state,
              surface: 'companion',
              appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
            }),
          ),
        ),
      ),
    );
  const eyePairs = () =>
    [...node.querySelectorAll('.bh-persona-avatar')].map((avatar) => {
      const gaze = loops.findLast(
        (loop) => avatar.contains(loop.target) && loop.target.matches('.bh-illustrated-gaze'),
      );
      const blink = loops.findLast(
        (loop) => avatar.contains(loop.target) && loop.target.matches('.bh-illustrated-blink'),
      );
      expect(gaze).toBeDefined();
      expect(blink).toBeDefined();
      expect(gaze!.options).toEqual(blink!.options);
      return blink!.options;
    });
  try {
    await render('idle');
    const idle = eyePairs();
    expect(idle[0]!.delay ?? 0).not.toBe(idle[1]!.delay ?? 0);
    expect(idle[0]!.duration).not.toBe(idle[1]!.duration);
    expect(loops).toHaveLength(4);
    await render('working');
    const working = eyePairs();
    expect(working[0]!.delay ?? 0).not.toBe(working[1]!.delay ?? 0);
    expect(working.map((timing) => timing.duration)).toEqual([2000, 2000]);
    await render('idle');
    expect(eyePairs()).toEqual(idle);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(loops.every((loop) => loop.cancel.mock.calls.length === 1)).toBe(true);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(eyePairs()).toEqual(idle);
    await act(() => root.unmount());
    expect(loops.every((loop) => loop.cancel.mock.calls.length === 1)).toBe(true);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    if (previousHidden) Object.defineProperty(document, 'hidden', previousHidden);
    else Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});
