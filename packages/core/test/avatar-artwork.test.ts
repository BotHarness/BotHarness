import { describe, expect, it } from 'vitest';

import {
  DEFAULT_ILLUSTRATED_RECIPE,
  illustratedAvatarSvg,
  type IllustratedAvatarRecipe,
} from '../src/bots/avatar-appearance.js';
import { deriveAvatarAppearance } from '../src/bots/avatar-snapshot.js';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';

const combos: IllustratedAvatarRecipe[] = (['soft', 'long'] as const).flatMap((head) =>
  (['sweep', 'crop', 'bob'] as const).flatMap((hair) =>
    (['none', 'glasses'] as const).map((accessory) => ({
      ...DEFAULT_ILLUSTRATED_RECIPE,
      head,
      hair,
      accessory,
    })),
  ),
);

describe('illustrated Avatar artwork', () => {
  it('renders every catalog combination as inert, id-free markup with stable rig nodes', () => {
    const rendered = new Set<string>();
    for (const recipe of combos) {
      const svg = illustratedAvatarSvg(recipe);
      rendered.add(svg);
      expect(svg).not.toMatch(/\sid=|<defs|<script|<image|href=|url\(/u);
      for (const node of ['body', 'head', 'face', 'gaze'])
        expect(svg).toContain(`class="bh-illustrated-${node}"`);
      expect(svg.includes('<rect')).toBe(recipe.accessory === 'glasses');
    }
    expect(rendered.size).toBe(combos.length);
  });

  it('applies the recipe colours and derives a bounded snapshot for extreme colours', () => {
    const extreme = {
      ...DEFAULT_ILLUSTRATED_RECIPE,
      skinColor: '#000000',
      hairColor: '#ffffff',
      shirtColor: '#ff00ff',
    };
    const svg = illustratedAvatarSvg(extreme);
    for (const colour of ['#000000', '#ffffff', '#ff00ff'])
      expect(svg).toContain(`fill="${colour}"`);
    for (const recipe of [extreme, ...combos]) {
      const derived = deriveAvatarAppearance(recipe);
      expect(derived).toBeDefined();
      const bytes = Buffer.from(derived!.avatar.split(',')[1]!, 'base64');
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
    }
  });
});
