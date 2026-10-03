// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import { DEFAULT_ILLUSTRATED_RECIPE } from '../../core/src/bots/avatar-appearance.js';
import { zhTranslate } from '../src/client/locale.js';

describe('Profile Avatar Appearance editing', () => {
  it('keeps a failed-save draft editable and leaves the committed image untouched', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const save = vi.fn(async () => false);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      workspaces: [],
      createdAt: '',
      avatar: '/saved.png',
      aggregateState: 'idle',
    };
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/saved.png');
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-save]')!.click());
      expect(container.querySelector('[role=alert]')).not.toBeNull();
      expect(container.querySelector('[data-avatar-save]')).not.toBeNull();
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-cancel]')!.click());
      expect(container.querySelector('img')?.getAttribute('src')).toBe('/saved.png');
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('previews an unsaved choice, cancels without writing, and saves the selected recipe explicitly', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'working',
      workspaces: [],
      createdAt: '',
      attention: { approvalCount: 2 },
    };
    const click = async (selector: string) =>
      act(() => container.querySelector<HTMLButtonElement>(selector)!.click());
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      const select = container.querySelector<HTMLSelectElement>('[name="hair"]')!;
      await act(() => {
        select.value = 'bob';
        select.dispatchEvent(new Event('change', { bubbles: true }));
      });
      expect(container.querySelector('[data-avatar-preview] svg')).not.toBeNull();
      expect(container.querySelector('[data-approval-count="2"]')).not.toBeNull();
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-cancel]');
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-edit]');
      expect(container.querySelector<HTMLSelectElement>('[name="hair"]')?.value).toBe('sweep');
      const head = container.querySelector<HTMLSelectElement>('[name="head"]')!;
      await act(() => {
        head.value = 'long';
        head.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', { ...DEFAULT_ILLUSTRATED_RECIPE, head: 'long' });
      expect(container.querySelector('[data-avatar-save]')).toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
