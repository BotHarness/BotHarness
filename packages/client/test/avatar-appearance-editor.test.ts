// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
}));
import { AvatarAppearanceEditor } from '../src/client/avatar-appearance-editor.js';
import { PersonaBotAvatar } from '../src/client/avatar.js';
import { parseBotSummaries } from '../src/client/bridge.js';
import {
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  isIllustratedAvatarRecipe,
  seededAvatarRecipe,
  seededAvatarRecipeV2,
} from '../../core/src/bots/avatar-appearance.js';
import { LINE_PARTS, LINE_PRESETS, seededLineRecipe } from '../../core/src/bots/avatar-line.js';
import { zhTranslate } from '../src/client/locale.js';

describe('Profile Avatar Appearance editing', () => {
  it('offers pixel design and image upload as two choices and marks the one in use', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const upload = vi.fn();
    const remove = vi.fn();
    const render = (bot: Parameters<typeof AvatarAppearanceEditor>[0]['bot']) =>
      act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            onUpload: upload,
            onRemoveImage: remove,
            t: zhTranslate,
          }),
        ),
      );
    const base = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      workspaces: [],
      createdAt: '',
      aggregateState: 'idle',
    };
    try {
      await render(base);
      const rows = () => [...container.querySelectorAll('.bh-avatar-methods > .bh-card-row')];
      expect(container.querySelector('.bh-profile-section-title')?.textContent).toBe('头像');
      expect(rows().map((row) => row.querySelector('.bh-card-title')?.textContent)).toEqual([
        '设计像素头像',
        '上传图片',
      ]);
      expect(rows().map((row) => row.getAttribute('data-state'))).toEqual(['current', null]);
      expect(container.querySelector('[data-avatar-remove]')).toBeNull();
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-upload]')!.click());
      expect(upload).toHaveBeenCalledTimes(1);

      await render({ ...base, avatar: '/saved.png' });
      expect(rows().map((row) => row.getAttribute('data-state'))).toEqual([null, 'current']);
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-remove]')!.click());
      expect(remove).toHaveBeenCalledTimes(1);

      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      expect(container.querySelector('.bh-avatar-methods')).toBeNull();
      expect(container.querySelector('[data-avatar-save]')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

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

  it('saves a goblin with separately styled and colored side hair', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'grub',
      displayName: 'Grub',
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
            channelId: 'dm-grub',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="species"]');
      expect(container.querySelectorAll('[data-avatar-option^="species:"]')).toHaveLength(
        AVATAR_SPECIES.length,
      );
      await click('[data-avatar-option="species:goblin"]');
      expect(
        container
          .querySelector('[data-avatar-option="species:goblin"]')
          ?.getAttribute('aria-pressed'),
      ).toBe('true');
      await click('[data-avatar-category="sideHair"]');
      await click('[data-avatar-option="sideHair:long"]');
      await click('[data-avatar-category="rightSideHair"]');
      await click('[data-avatar-option="rightSideHair:none"]');
      await click('[data-avatar-category="colors"]');
      const skin = AVATAR_SPECIES_SWATCHES.goblin;
      expect(container.querySelectorAll('[data-avatar-option^="skinColor:"]')).toHaveLength(
        skin.length,
      );
      await click('[data-avatar-option="leftSideHairColor:#e2b04a"]');
      await click('[data-avatar-option="rightSideHairColor:#3fc1b8"]');
      await click('[data-avatar-color-reset="rightSideHairColor"]');
      expect(container.querySelector('[data-avatar-color-reset="rightSideHairColor"]')).toBeNull();
      await click('[data-avatar-save]');
      const saved = (save.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(saved).toMatchObject({
        assetVersion: 2,
        species: 'goblin',
        sideHair: 'long',
        rightSideHair: 'none',
        leftSideHairColor: '#e2b04a',
        skinColor: skin[0],
      });
      expect(saved).not.toHaveProperty('rightSideHairColor');
      expect(isIllustratedAvatarRecipe(saved)).toBe(true);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('dresses a dwarf, keeps hidden hair, and grows a talking flower', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'gimli',
      displayName: 'Gimli',
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
            channelId: 'dm-gimli',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await click('[data-avatar-edit]');
      await click('[data-avatar-category="species"]');
      await click('[data-avatar-option="species:dwarf"]');
      expect(container.querySelector('[data-avatar-category="petals"]')).toBeNull();
      await click('[data-avatar-category="beard"]');
      await click('[data-avatar-option="beard:braided"]');
      await click('[data-avatar-category="outfit"]');
      await click('[data-avatar-option="outfit:armor"]');
      await click('[data-avatar-category="backHair"]');
      await click('[data-avatar-option="backHair:long"]');
      await click('[data-avatar-category="accessory"]');
      await click('[data-avatar-option="accessory:helmet"]');
      await click('[data-avatar-category="backHair"]');
      expect(container.querySelector('[data-avatar-hidden-note="backHair"]')).not.toBeNull();
      await click('[data-avatar-save]');
      const dwarf = (save.mock.calls[0] as unknown[])[1] as Record<string, unknown>;
      expect(dwarf).toMatchObject({
        species: 'dwarf',
        beard: 'braided',
        outfit: 'armor',
        accessory: 'helmet',
        backHair: 'long',
      });
      expect(isIllustratedAvatarRecipe(dwarf)).toBe(true);

      await click('[data-avatar-edit]');
      await click('[data-avatar-category="beard"]');
      await click('[data-avatar-option="beard:none"]');
      await click('[data-avatar-category="species"]');
      await click('[data-avatar-option="species:flower"]');
      expect(container.querySelector('[data-avatar-category="beard"]')).toBeNull();
      await click('[data-avatar-category="petals"]');
      await click('[data-avatar-option="petals:sunflower"]');
      await click('[data-avatar-category="flowerBase"]');
      await click('[data-avatar-option="flowerBase:pot"]');
      await click('[data-avatar-category="outfit"]');
      expect(container.querySelector('[data-avatar-hidden-note="outfit"]')).not.toBeNull();
      await click('[data-avatar-save]');
      const flower = (save.mock.calls[1] as unknown[])[1] as Record<string, unknown>;
      expect(flower).toMatchObject({
        species: 'flower',
        petals: 'sunflower',
        flowerBase: 'pot',
      });
      expect(flower).not.toHaveProperty('beard');
      expect(isIllustratedAvatarRecipe(flower)).toBe(true);
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });

  it('starts a new Bot from its full-domain seed and keeps older Bots on their original face', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const save = vi.fn(async () => true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const bot = {
      slug: 'gimli',
      displayName: 'Gimli',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '',
      avatarSeed: 2 as const,
    };
    const face = async (avatarSeed: 2 | undefined) => {
      const frame = document.createElement('div');
      const avatar = createRoot(frame);
      await act(() =>
        avatar.render(
          createElement(PersonaBotAvatar, {
            personaBotId: 'gimli',
            name: 'Gimli',
            avatarSeed,
            size: 32,
            still: true,
          }),
        ),
      );
      const markup = frame.innerHTML;
      await act(() => avatar.unmount());
      return markup;
    };
    try {
      expect(seededAvatarRecipeV2('Gimli')).not.toEqual(seededAvatarRecipe('Gimli'));
      expect(await face(2)).not.toBe(await face(undefined));
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot,
            channelId: 'dm-gimli',
            onSave: save,
            t: zhTranslate,
          }),
        ),
      );
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-edit]')!.click());
      await act(() => container.querySelector<HTMLButtonElement>('[data-avatar-save]')!.click());
      expect(save).toHaveBeenCalledWith('dm-gimli', seededAvatarRecipeV2('Gimli'));
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

describe('unsupported saved appearance', () => {
  it('shows the saved snapshot, explains the pause and keeps editing closed', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const [bot] = parseBotSummaries({
      bots: [
        {
          slug: 'ada',
          displayName: 'Ada',
          workspaces: [],
          createdAt: '',
          avatar: 'data:image/png;base64,iVBORw0KGgo=',
          appearance: {
            revision: 'a'.repeat(64),
            recipe: {
              family: 'illustrated',
              schemaVersion: 1,
              assetVersion: 999,
              rigVersion: 1,
              tail: 'swirl',
            },
          },
        },
      ],
    });
    expect(bot?.appearance).toBeUndefined();
    expect(bot?.appearanceUnsupported).toBe(true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(() =>
        root.render(
          createElement(AvatarAppearanceEditor, {
            bot: bot!,
            channelId: 'dm-ada',
            onSave: vi.fn(async () => true),
            t: zhTranslate,
          }),
        ),
      );
      expect(container.querySelector('[data-avatar-unsupported]')).not.toBeNull();
      expect(container.querySelector<HTMLButtonElement>('[data-avatar-edit]')?.disabled).toBe(true);
      expect(container.querySelector('[data-avatar-preview] img')).not.toBeNull();
    } finally {
      await act(() => root.unmount());
      container.remove();
    }
  });
});
