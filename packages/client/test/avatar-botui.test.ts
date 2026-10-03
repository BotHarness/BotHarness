// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { PersonaBotAvatar } from '../src/client/avatar.js';

it('keeps CSS-owned BotUI motion stable across rerenders, swaps presets and removes it at idle', async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  const frames = vi.fn();
  vi.stubGlobal('requestAnimationFrame', frames);
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = async (state: 'thinking' | 'working' | 'idle', name = 'Ada') => {
    await act(async () =>
      root.render(
        createElement(PersonaBotAvatar, {
          personaBotId: 'ada',
          name,
          size: 32,
          state,
          attention: { approvalCount: 2 },
        }),
      ),
    );
  };
  try {
    await render('thinking');
    const matrix = container.querySelector('.botui-dot-matrix');
    expect(matrix?.getAttribute('data-preset')).toBe('spiral');
    expect(matrix?.children).toHaveLength(9);
    await render('thinking', 'Renamed Ada');
    expect(container.querySelector('.botui-dot-matrix')).toBe(matrix);
    await render('working');
    expect(container.querySelector('.botui-dot-matrix')?.getAttribute('data-preset')).toBe('morph');
    expect(container.querySelector('.bh-avatar-indicator')).toBeNull();
    await render('idle');
    expect(container.querySelector('.botui-dot-matrix')).toBeNull();
    expect(container.querySelector('.bh-avatar-attention')?.textContent).toBe('2');
    expect(frames).not.toHaveBeenCalled();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  }
  expect(container.children).toHaveLength(0);
});
