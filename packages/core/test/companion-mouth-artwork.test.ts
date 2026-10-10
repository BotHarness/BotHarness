import { expect, it } from 'vitest';
import {
  avatarSvg,
  AVATAR_TURNS,
  DEFAULT_ILLUSTRATED_RECIPE,
  illustratedAvatarSvg,
} from '../src/bots/avatar-appearance.js';

it('uses the flatter opening only for Companion speech and preserves portraits and accepted mouth layers', () => {
  const recipe = DEFAULT_ILLUSTRATED_RECIPE;
  const saved = JSON.stringify(recipe);
  const options = { mouthLayers: true, turns: AVATAR_TURNS };
  const portrait = avatarSvg(recipe, options);
  const companion = avatarSvg(recipe, { ...options, surface: 'companion' });
  expect(portrait).toBe(illustratedAvatarSvg(recipe, options));
  expect(avatarSvg(recipe)).toBe(illustratedAvatarSvg(recipe));
  const layers = (svg: string, state: string) =>
    [
      ...svg.matchAll(new RegExp(`<g data-avatar-mouth="${state}" opacity="[01]">(.*?)</g>`, 'gu')),
    ].map((match) => match[1]);
  for (const state of ['saved', 'closed', 'half-open']) {
    expect(layers(companion, state)).toHaveLength(5);
    expect(layers(companion, state)).toEqual(layers(portrait, state));
  }
  expect(layers(companion, 'open')).toHaveLength(5);
  expect(
    layers(companion, 'open').every((layer, index) => layer !== layers(portrait, 'open')[index]),
  ).toBe(true);
  expect(layers(companion, 'open')[0]).toContain(
    '<rect x="15" y="20" width="3" height="1" fill="#b8415a"/>',
  );
  expect(avatarSvg(recipe, { surface: 'companion' })).not.toContain('data-avatar-mouth=');
  expect(JSON.stringify(recipe)).toBe(saved);
});
