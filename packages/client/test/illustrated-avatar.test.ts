// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';
import { DEFAULT_LINE_RECIPE } from '../../core/src/bots/avatar-line.js';

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

it('keeps an idle small avatar still while the large avatar only blinks', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: Element[] = [];
  const animate = vi.fn(function (
    this: Element,
    _frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push(this);
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    state: 'idle' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  try {
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 34 })));
    expect(loops).toHaveLength(0);
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 160 })));
    expect(loops.map((loop) => loop.getAttribute('class'))).toEqual([
      'bh-illustrated-gaze',
      'bh-illustrated-blink',
    ]);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('loops the gaze only on the large working avatar and keeps waiting avatars still', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: { target: Element; frames: Keyframe[] }[] = [];
  const animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push({ target: this, frames });
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  const classes = () => loops.map((loop) => loop.target.getAttribute('class'));
  try {
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          size: 34,
          state: 'working',
          effect: 'searching',
        }),
      ),
    );
    expect(classes()).toEqual(['bh-illustrated-head']);
    loops.length = 0;
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          ...props,
          size: 160,
          state: 'working',
          effect: 'searching',
        }),
      ),
    );
    expect(classes()).toEqual([
      'bh-illustrated-head',
      'bh-illustrated-gaze',
      'bh-illustrated-blink',
      null,
    ]);
    expect(loops[3]!.target.getAttribute('data-avatar-mark')).toBe('searching');
    const gaze = loops[1]!.frames.map((frame) => String(frame.transform));
    expect(gaze).toContain('translate(-1px, 0px)');
    expect(gaze).toContain('translate(1px, 0px)');
    expect(loops[1]!.frames.every((frame) => frame.easing === 'steps(1, end)')).toBe(true);
    expect(loops[2]!.frames.some((frame) => frame.opacity === 1)).toBe(true);
    loops.length = 0;
    await act(async () =>
      root.render(createElement(PersonaBotAvatar, { ...props, size: 160, state: 'waiting' })),
    );
    expect(loops).toHaveLength(0);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('turns the large thinking avatar through noise-scheduled yaw frames and keeps small avatars on head steps', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const loops: { target: Element; frames: Keyframe[] }[] = [];
  const animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    if (options.iterations === Infinity) loops.push({ target: this, frames });
    return { cancel: vi.fn(), finished: Promise.resolve() };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const props = {
    personaBotId: 'ada',
    name: 'Ada',
    state: 'thinking' as const,
    appearance: { recipe: DEFAULT_ILLUSTRATED_RECIPE, revision: 'a'.repeat(64) },
  };
  try {
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 160 })));
    const turns = loops.filter((loop) => loop.target.hasAttribute('data-avatar-turn'));
    expect(turns).toHaveLength(4);
    const shown = (index: number) =>
      [
        ...loops.filter((loop) =>
          ['bh-illustrated-head'].includes(loop.target.getAttribute('class') ?? ''),
        ),
        ...turns,
      ].filter((loop) => loop.frames[index]?.opacity === 1).length;
    for (let index = 0; index < 40; index++) expect(shown(index)).toBe(1);
    expect(new Set(turns.flatMap((loop) => loop.frames.map((frame) => frame.opacity))).size).toBe(
      2,
    );
    loops.length = 0;
    await act(async () => root.render(createElement(PersonaBotAvatar, { ...props, size: 34 })));
    expect(node.querySelector('[data-avatar-turn]')).toBeNull();
    expect(loops.map((loop) => loop.target.getAttribute('class'))).toEqual(['bh-illustrated-head']);
  } finally {
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});

it('morphs line features through bounded dots on real presentation changes only', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const node = document.createElement('div');
  document.body.append(node);
  const root = createRoot(node);
  const calls: { target: Element; options: KeyframeAnimationOptions; frames: Keyframe[] }[] = [];
  const animate = vi.fn(function (
    this: Element,
    frames: Keyframe[],
    options: KeyframeAnimationOptions,
  ) {
    calls.push({ target: this, options, frames });
    return { cancel: vi.fn(), finished: new Promise<void>(() => undefined) };
  });
  const previous = Object.getOwnPropertyDescriptor(Element.prototype, 'animate');
  Object.defineProperty(Element.prototype, 'animate', { configurable: true, value: animate });
  Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  const base = {
    personaBotId: 'ada',
    name: 'Ada',
    appearance: { recipe: DEFAULT_LINE_RECIPE, revision: 'a'.repeat(64) },
  };
  const render = (size: number, effect: 'coding' | 'executing' | 'searching') =>
    act(async () =>
      root.render(createElement(PersonaBotAvatar, { ...base, size, state: 'working', effect })),
    );
  const dots = () =>
    calls.filter(
      (call) => call.target.closest('[data-avatar-transition]') && call.target.tagName === 'circle',
    );
  try {
    await render(160, 'coding');
    expect(dots()).toHaveLength(0);
    await render(160, 'executing');
    expect(dots()).toHaveLength(12);
    expect(dots().every((call) => call.options.duration === 900)).toBe(true);
    calls.length = 0;
    await render(160, 'searching');
    expect(dots()).toHaveLength(12);
    calls.length = 0;
    await render(34, 'coding');
    expect(dots()).toHaveLength(12);
    expect(dots().every((call) => call.options.duration === 450)).toBe(true);
    expect(node.querySelectorAll('[data-avatar-transition] circle')).toHaveLength(12);
    calls.length = 0;
    document.documentElement.dataset['botharnessMotion'] = 'reduce';
    await render(34, 'executing');
    expect(dots()).toHaveLength(0);
    delete document.documentElement.dataset['botharnessMotion'];
    await act(async () => undefined);
    expect(dots()).toHaveLength(0);
  } finally {
    delete document.documentElement.dataset['botharnessMotion'];
    await act(() => root.unmount());
    if (previous) Object.defineProperty(Element.prototype, 'animate', previous);
    else Reflect.deleteProperty(Element.prototype, 'animate');
    Reflect.deleteProperty(document, 'hidden');
    node.remove();
  }
});
