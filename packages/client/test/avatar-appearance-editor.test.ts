// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import {
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  seededAvatarRecipe,
} from '../../core/src/bots/avatar-appearance.js';
import { LINE_PARTS, LINE_PRESETS, seededLineRecipe } from '../../core/src/bots/avatar-line.js';
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
      await click('[data-avatar-option="hair:bob"]');
      expect(container.querySelector('[data-avatar-preview] svg')).not.toBeNull();
      expect(container.querySelector('[data-avatar-preview] [data-approval-count="2"]')).toBeNull();
      expect(
        container.querySelector('.bh-avatar-editor-title [data-approval-count="2"]'),
      ).not.toBeNull();
      expect(container.querySelectorAll('[data-avatar-option^="hair:"]')).toHaveLength(
        AVATAR_PARTS.hair.length,
      );
      expect(
        container.querySelector('[data-avatar-option="hair:bob"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-cancel]');
      expect(save).not.toHaveBeenCalled();
      await click('[data-avatar-edit]');
      expect(
        container
          .querySelector(`[data-avatar-option="hair:${seededAvatarRecipe('Ada').hair}"]`)
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-category="accessory"]');
      await click('[data-avatar-option="accessory:crown"]');
      await click('[data-avatar-category="colors"]');
      await click('[data-avatar-option="shirtColor:#3d9970"]');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', {
        ...seededAvatarRecipe('Ada'),
        accessory: 'crown',
        shirtColor: '#3d9970',
      });
      expect(container.querySelector('[data-avatar-save]')).toBeNull();
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="presets"]');
      expect(container.querySelectorAll('[data-avatar-option^="preset:"]')).toHaveLength(
        AVATAR_PRESETS.length,
      );
      await click('[data-avatar-option="preset:2"]');
      expect(
        container.querySelector('[data-avatar-option="preset:2"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenLastCalledWith('dm-ada', AVATAR_PRESETS[2]);
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="bangs"]');
      expect(container.querySelectorAll('[data-avatar-option^="bangs:"]')).toHaveLength(
        AVATAR_HAIR_PARTS.bangs.length,
      );
      await click('[data-avatar-option="bangs:sweep"]');
      await click('[data-avatar-category="backHair"]');
      await click('[data-avatar-option="backHair:twintails"]');
      await click('[data-avatar-category="shape"]');
      expect(container.querySelector('input[name="hairLength"]')).not.toBeNull();
      await click('[data-avatar-save]');
      expect(save).toHaveBeenLastCalledWith(
        'dm-ada',
        expect.objectContaining({
          bangs: 'sweep',
          backHair: 'twintails',
          spacing: 0,
          height: 0,
          hairLength: 0,
        }),
      );
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('switches families without substituting parts and saves a bounded line recipe', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
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
      await click('[data-avatar-option="hair:bob"]');
      await click('[data-avatar-family="line"]');
      expect(
        container.querySelector('[data-avatar-family="line"]')?.getAttribute('aria-checked'),
      ).toBe('true');
      expect(container.querySelector('[data-avatar-option^="hair:"]')).toBeNull();
      expect(container.querySelectorAll('[data-avatar-option^="eyes:"]')).toHaveLength(
        LINE_PARTS.eyes.length,
      );
      await click('[data-avatar-option="eyes:cross"]');
      await click('[data-avatar-category="shape"]');
      const spacing = container.querySelector<HTMLInputElement>('input[name="spacing"]')!;
      await act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
          spacing,
          '3',
        );
        spacing.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await click('[data-avatar-family="illustrated"]');
      expect(
        container.querySelector('[data-avatar-option="hair:bob"]')?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-family="line"]');
      await click('[data-avatar-save]');
      expect(save).toHaveBeenCalledWith('dm-ada', {
        ...seededLineRecipe('Ada'),
        eyes: 'cross',
        spacing: 3,
      });
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
