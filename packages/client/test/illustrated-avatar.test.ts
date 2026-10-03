// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';

it('keeps same-Bot SVG instances independent and releases mounted animation resources', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const containers = [document.createElement('div'), document.createElement('div')];
  containers.forEach((node) => document.body.append(node));
  const roots = containers.map((node) => createRoot(node));
  const animations: { cancel: ReturnType<typeof vi.fn>; target: Element }[] = [];
  const animate = vi.fn(function (this: Element) {
    const animation = {
      cancel: vi.fn(),
      target: this,
      finished: new Promise<void>(() => undefined),
    };
    animations.push(animation);
    return animation;
  });
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe() {}
      disconnect = vi.fn();
    },
  );
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    size: 160,
    state: 'working' as const,
    effect: 'coding' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
    attention: { approvalCount: 1 },
  };
  try {
    await act(() => roots.forEach((root) => root.render(createElement(PersonaBotAvatar, props))));
    expect(animations).toHaveLength(4);
    expect(animations[0]!.target).not.toBe(animations[2]!.target);
    expect(containers[0]!.querySelector('svg')!.innerHTML).toBe(
      containers[1]!.querySelector('svg')!.innerHTML,
    );
    expect(containers.every((node) => node.querySelector('[id]') === null)).toBe(true);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    await act(() => {
      Object.defineProperty(document, 'hidden', { configurable: true, value: false });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(animate).toHaveBeenCalledTimes(8);
    await act(() => {
      document.documentElement.dataset['botharnessMotion'] = 'reduce';
    });
    expect(animations.every((animation) => animation.cancel.mock.calls.length === 1)).toBe(true);
    expect(
      containers.every((node) => node.querySelector('[data-approval-count="1"]') !== null),
    ).toBe(true);
    await act(() => roots.forEach((root) => root.unmount()));
    expect(animate).toHaveBeenCalledTimes(8);
  } finally {
    await act(() => roots.forEach((root) => root.unmount()));
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    delete document.documentElement.dataset['botharnessMotion'];
    vi.unstubAllGlobals();
    containers.forEach((node) => node.remove());
  }
});
