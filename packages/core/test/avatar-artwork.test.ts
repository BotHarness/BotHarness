import { describe, expect, it } from 'vitest';

import {
  AVATAR_MARKS,
  AVATAR_PARTS,
  DEFAULT_ILLUSTRATED_RECIPE,
  illustratedAvatarSvg,
  isIllustratedAvatarRecipe,
  type AvatarPart,
  type IllustratedAvatarRecipe,
} from '../src/bots/avatar-appearance.js';
import { deriveAvatarAppearance } from '../src/bots/avatar-snapshot.js';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';

const parts = Object.keys(AVATAR_PARTS) as AvatarPart[];
const variants: IllustratedAvatarRecipe[] = parts.flatMap((part) =>
  AVATAR_PARTS[part].map((value) => ({ ...DEFAULT_ILLUSTRATED_RECIPE, [part]: value })),
);
const crowded: IllustratedAvatarRecipe[] = AVATAR_PARTS.head.flatMap((head) =>
  AVATAR_PARTS.hair.map((hair, index) => ({
    ...DEFAULT_ILLUSTRATED_RECIPE,
    head,
    hair,
    glasses: AVATAR_PARTS.glasses[index % AVATAR_PARTS.glasses.length]!,
    accessory: AVATAR_PARTS.accessory[index % AVATAR_PARTS.accessory.length]!,
  })),
);

describe('illustrated Avatar artwork', () => {
  it('renders every catalog option as distinct, inert, id-free pixel markup with stable rig nodes', () => {
    for (const part of parts) {
      const rendered = new Set(
        AVATAR_PARTS[part].map((value) =>
          illustratedAvatarSvg({ ...DEFAULT_ILLUSTRATED_RECIPE, [part]: value }),
        ),
      );
      expect(rendered.size, part).toBe(AVATAR_PARTS[part].length);
    }
    for (const recipe of [...variants, ...crowded]) {
      const svg = illustratedAvatarSvg(recipe);
      expect(svg).not.toMatch(/\sid=|<defs|<script|<image|href=|url\(|<path/u);
      expect(svg).toContain('shape-rendering="crispEdges"');
      for (const node of ['body', 'head', 'face', 'gaze', 'blink'])
        expect(svg).toContain(`class="bh-illustrated-${node}"`);
      for (const mark of AVATAR_MARKS)
        expect(svg).toContain(`data-avatar-mark="${mark}" opacity="0"`);
      expect(svg.match(/<rect/gu)!.length).toBeLessThan(1200);
    }
  });

  it('rejects unknown parts and keeps the recipe closed', () => {
    expect(isIllustratedAvatarRecipe(DEFAULT_ILLUSTRATED_RECIPE)).toBe(true);
    for (const invalid of [
      { ...DEFAULT_ILLUSTRATED_RECIPE, eyes: 'laser' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, accessory: 'glasses' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, extra: 'x' },
      { ...DEFAULT_ILLUSTRATED_RECIPE, skinColor: 'red' },
    ])
      expect(isIllustratedAvatarRecipe(invalid)).toBe(false);
  });

  it('applies recipe colours and derives a bounded snapshot for every option and extreme colours', () => {
    const extreme = {
      ...DEFAULT_ILLUSTRATED_RECIPE,
      skinColor: '#000000',
      hairColor: '#ffffff',
      shirtColor: '#ff00ff',
    };
    const svg = illustratedAvatarSvg(extreme);
    for (const colour of ['#000000', '#ff00ff']) expect(svg).toContain(`fill="${colour}"`);
    for (const recipe of [extreme, ...variants]) {
      const derived = deriveAvatarAppearance(recipe);
      expect(derived).toBeDefined();
      const bytes = Buffer.from(derived!.avatar.split(',')[1]!, 'base64');
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
    }
  });
});
