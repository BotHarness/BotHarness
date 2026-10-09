// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes, type PropsWithChildren } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { seededBannerRecipe } from '@botharness/pixel-banner';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: ({
      variant: _variant,
      size: _size,
      ...props
    }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string; size?: string }) =>
      createElement('button', { type: 'button', ...props }),
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconShareOutlineRegular: stub,
    Menu: stub,
    Tag: ({ children }: PropsWithChildren) => createElement('span', null, children),
    Tooltip: ({ children }: PropsWithChildren) => children,
    Modal: ({
      open,
      title,
      children,
      footer,
    }: PropsWithChildren<{ open: boolean; title: string; footer?: unknown }>) =>
      open
        ? createElement('div', { role: 'dialog', 'aria-label': title }, children, footer as never)
        : null,
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { parseBotSummary } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { ProfileHeader } from '../src/client/profile-header.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';

const AT = '2026-10-08T00:00:00Z';
const CHANNEL: ChannelSummary = {
  id: 'dm-ada',
  type: 'dm',
  name: 'Ada',
  members: ['ada'],
  createdAt: AT,
  updatedAt: AT,
};

const painted = vi.fn();
let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'ImageData',
    class {
      constructor(
        readonly data: Uint8ClampedArray,
        readonly width: number,
        readonly height: number,
      ) {}
    },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    putImageData: painted,
  } as never);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function bot(banner?: BotSummary['banner']): BotSummary {
  return {
    slug: 'ada',
    displayName: 'Ada',
    roles: [],
    aggregateState: 'idle',
    workspaces: [],
    createdAt: AT,
    ...(banner === undefined ? {} : { banner }),
  };
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((item) => item.textContent === label);
  expect(found, label).toBeDefined();
  return found!;
}

async function render(summary: BotSummary, actions: Partial<BridgeActions>) {
  await act(async () =>
    root.render(
      createElement(ProfileHeader, {
        bot: summary,
        channel: CHANNEL,
        actions: actions as BridgeActions,
        t: zhTranslate,
        onDelete: () => undefined,
      }),
    ),
  );
}

it('shows the name-seeded banner and saves a picked scene, a reroll or a reset', async () => {
  const setBotBanner = vi.fn(async () => true);
  await render(bot(), { setBotBanner });
  const seeded = seededBannerRecipe('Ada');
  expect(host.querySelector('.bh-profile-banner canvas')?.getAttribute('data-scene')).toBe(
    seeded.scene,
  );
  expect(painted).toHaveBeenCalled();

  await act(async () => button('更换横幅').click());
  const scenes = [...host.querySelectorAll<HTMLButtonElement>('.bh-banner-scene')];
  expect(scenes.map((scene) => scene.textContent)).toEqual([
    '春',
    '夏',
    '秋',
    '冬',
    '海',
    '山',
    '沙漠',
    '森林',
    '星空',
    '太空',
  ]);
  expect(scenes.filter((scene) => scene.getAttribute('aria-checked') === 'true')).toHaveLength(1);
  await act(async () => scenes[9]!.click());
  expect(host.querySelector('.bh-banner-preview canvas')?.getAttribute('data-scene')).toBe('space');
  await act(async () => button('保存').click());
  expect(setBotBanner).toHaveBeenLastCalledWith('dm-ada', {
    recipe: { scene: 'space', seed: seeded.seed },
  });
  expect(host.querySelector('[role="dialog"]')).toBeNull();

  await act(async () => button('更换横幅').click());
  await act(async () => button('换一张').click());
  await act(async () => button('保存').click());
  const rerolled = setBotBanner.mock.lastCall as unknown as [string, { recipe: typeof seeded }];
  expect(rerolled[1].recipe.scene).toBe(seeded.scene);
  expect(rerolled[1].recipe.seed).not.toBe(seeded.seed);
});

it('shows an uploaded banner as an image and resets it to the generated one', async () => {
  const setBotBanner = vi.fn(async () => true);
  await render(bot({ image: '/api/botharness/bot-banner?slug=ada&v=1' }), { setBotBanner });
  expect(host.querySelector('.bh-profile-banner img')?.getAttribute('src')).toBe(
    '/api/botharness/bot-banner?slug=ada&v=1',
  );
  await act(async () => button('更换横幅').click());
  expect(host.textContent).toContain('当前使用上传的图片。');
  expect(button('换一张').disabled).toBe(true);
  await act(async () => button('保存').click());
  expect(setBotBanner).not.toHaveBeenCalled();

  await act(async () => button('更换横幅').click());
  await act(async () => button('恢复生成').click());
  await act(async () => button('保存').click());
  expect(setBotBanner).toHaveBeenCalledWith('dm-ada', { recipe: seededBannerRecipe('Ada') });
});

it('reads recipe and image banners from a Bot summary', () => {
  const base = { slug: 'ada', displayName: 'Ada', aggregateState: 'idle', createdAt: AT };
  expect(
    parseBotSummary({ ...base, banner: { recipe: { scene: 'sea', seed: 3 } } })?.banner,
  ).toEqual({ recipe: { scene: 'sea', seed: 3 } });
  expect(parseBotSummary({ ...base, banner: { image: '/x.png' } })?.banner).toEqual({
    image: '/x.png',
  });
  expect(parseBotSummary({ ...base, banner: { recipe: { scene: 'mars', seed: 3 } } })?.banner).toBe(
    undefined,
  );
});
