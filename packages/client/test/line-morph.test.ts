// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { LINE_TOOL_SYMBOLS } from '../../core/src/bots/avatar-appearance.js';
import { morphLinePath, sampleLineSymbol } from '../src/client/line-morph.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

it('drives every running line morph from one shared animation frame', async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    callbacks.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const from = sampleLineSymbol(LINE_TOOL_SYMBOLS.search, 1);
  const to = sampleLineSymbol(LINE_TOOL_SYMBOLS.edit, 1);
  const paths = Array.from({ length: 8 }, () =>
    document.createElementNS('http://www.w3.org/2000/svg', 'path'),
  );
  const runs = paths.map((path) => morphLinePath(path, from, to, { k: 170, c: 26 }, 0));
  expect(callbacks).toHaveLength(1);
  runs[0]!.cancel();
  await expect(runs[0]!.finished).resolves.toBe(false);
  for (let time = 0; callbacks.length && time < 5000; time += 1000 / 60) {
    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(time);
  }
  expect(callbacks).toHaveLength(0);
  await expect(Promise.all(runs.slice(1).map((run) => run.finished))).resolves.toEqual(
    runs.slice(1).map(() => true),
  );
});

it('keeps the shared loop alive when one morph throws and never runs two frame chains', async () => {
  const callbacks: FrameRequestCallback[] = [];
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    callbacks.push(callback),
  );
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
  const reported: unknown[] = [];
  vi.stubGlobal('queueMicrotask', (task: () => void) => {
    try {
      task();
    } catch (error) {
      reported.push(error);
    }
  });
  const from = sampleLineSymbol(LINE_TOOL_SYMBOLS.search, 1);
  const to = sampleLineSymbol(LINE_TOOL_SYMBOLS.edit, 1);
  const path = () => document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const spring = { k: 170, c: 26 };
  let follow: ReturnType<typeof morphLinePath> | undefined;
  const failing = morphLinePath(path(), from, to, spring, 0, () => {
    throw new Error('near failed');
  });
  const handing = morphLinePath(path(), from, to, spring, 0, () => {
    handing.cancel();
    follow = morphLinePath(path(), to, from, spring, 0);
  });
  void failing;
  for (let time = 0; callbacks.length && time < 5000; time += 1000 / 60) {
    expect(callbacks).toHaveLength(1);
    callbacks.shift()!(time);
  }
  expect(reported).toHaveLength(1);
  expect(follow).toBeDefined();
  await expect(follow!.finished).resolves.toBe(true);
  const later = morphLinePath(path(), from, to, spring, 0);
  expect(callbacks).toHaveLength(1);
  later.cancel();
});
