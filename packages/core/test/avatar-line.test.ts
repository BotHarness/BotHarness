import { describe, expect, it } from 'vitest';

import { avatarSvg, isAvatarAppearance, isAvatarRecipe } from '../src/bots/avatar-appearance.js';
import {
  DEFAULT_LINE_RECIPE,
  LINE_PARTS,
  LINE_RANGES,
  LINE_MORPH_SYMBOLS,
  isLineAvatarRecipe,
  lineAvatarSvg,
  lineMorphFace,
  seededLineRecipe,
  type LinePart,
  type LineAvatarRecipe,
} from '../src/bots/avatar-line.js';
import { deriveAvatarAppearance } from '../src/bots/avatar-snapshot.js';
import { MAX_PERSONA_BOT_AVATAR_BYTES } from '../src/bots/persona-bot.js';

const parts = Object.keys(LINE_PARTS) as LinePart[];
const extremes: LineAvatarRecipe[] = (
  Object.keys(LINE_RANGES) as (keyof typeof LINE_RANGES)[]
).flatMap((key) => LINE_RANGES[key].map((value) => ({ ...DEFAULT_LINE_RECIPE, [key]: value })));

describe('line Avatar family', () => {
  it('renders every part and legal extreme as distinct, inert, id-free markup with the shared rig nodes', () => {
    for (const part of parts) {
      const rendered = new Set(
        LINE_PARTS[part].map((value) => lineAvatarSvg({ ...DEFAULT_LINE_RECIPE, [part]: value })),
      );
      expect(rendered.size, part).toBe(LINE_PARTS[part].length);
    }
    for (const recipe of [
      ...parts.flatMap((part) =>
        LINE_PARTS[part].map((value) => ({ ...DEFAULT_LINE_RECIPE, [part]: value })),
      ),
      ...extremes,
    ]) {
      const svg = avatarSvg(recipe, { turns: [-14, 14] });
      expect(svg).not.toMatch(/\sid=|<defs|<script|<image|href=|url\(/u);
      for (const node of ['body', 'head', 'face', 'gaze', 'blink'])
        expect(svg).toContain(`class="bh-illustrated-${node}"`);
      expect(svg.match(/data-avatar-turn=/gu)).toHaveLength(2);
      expect(svg.match(/data-avatar-mark=/gu)).toHaveLength(5);
      expect(svg).toContain('<g data-avatar-attention-mark="" opacity="0"');
    }
  });

  it('accepts only bounded integer geometry and closed parts', () => {
    expect(isAvatarRecipe(DEFAULT_LINE_RECIPE)).toBe(true);
    for (const invalid of [
      { ...DEFAULT_LINE_RECIPE, spacing: 4 },
      { ...DEFAULT_LINE_RECIPE, tilt: -11 },
      { ...DEFAULT_LINE_RECIPE, height: 0.5 },
      { ...DEFAULT_LINE_RECIPE, eyes: 'laser' },
      { ...DEFAULT_LINE_RECIPE, hair: 'bob' },
      { ...DEFAULT_LINE_RECIPE, inkColor: 'url(x)' },
      { ...DEFAULT_LINE_RECIPE, family: 'illustrated' },
    ])
      expect(isAvatarRecipe(invalid)).toBe(false);
  });

  it('seeds stable recipes per name and derives bounded snapshots for every extreme', () => {
    expect(seededLineRecipe(' Ada ')).toEqual(seededLineRecipe('ada'));
    expect(isLineAvatarRecipe(seededLineRecipe('Grace Hopper'))).toBe(true);
    for (const recipe of [DEFAULT_LINE_RECIPE, ...extremes, seededLineRecipe('Linus')]) {
      const derived = deriveAvatarAppearance(recipe);
      expect(derived).toBeDefined();
      expect(isAvatarAppearance(derived!.appearance)).toBe(true);
      expect(derived!.appearance.recipe.family).toBe('line');
      const bytes = Buffer.from(derived!.avatar.split(',')[1]!, 'base64');
      expect(bytes.byteLength).toBeLessThanOrEqual(MAX_PERSONA_BOT_AVATAR_BYTES);
    }
  });

  it('carries one stroke morph path and bounded face and symbol strokes for every presentation', () => {
    const geometry = /^(d|cx|cy|r|rx|ry|x|y|width|height)$/u;
    for (const recipe of [DEFAULT_LINE_RECIPE, ...extremes]) {
      const svg = lineAvatarSvg(recipe);
      expect(svg.match(/data-avatar-transition=""/gu)).toHaveLength(1);
      expect(svg).toContain(`<path data-avatar-transition="" d="M24 24" opacity="0"`);
    }
    for (const part of ['eyes', 'brows', 'nose', 'mouth'] as const)
      for (const value of LINE_PARTS[part]) {
        const face = lineMorphFace({ ...DEFAULT_LINE_RECIPE, [part]: value });
        expect(face.nodes.length, `${part}:${value}`).toBeGreaterThanOrEqual(2);
        expect(face.nodes.length, `${part}:${value}`).toBeLessThanOrEqual(12);
        for (const [tag, attrs] of face.nodes) {
          expect(['path', 'ellipse', 'circle', 'rect']).toContain(tag);
          for (const key of Object.keys(attrs)) expect(key).toMatch(geometry);
        }
      }
    const tilted = lineMorphFace({ ...DEFAULT_LINE_RECIPE, tilt: -10, height: 3 });
    expect(tilted.tilt).toBe(-10);
    expect(tilted.pivot).toEqual([24, 29]);
    for (const key of [
      'idle',
      'thinking-dots',
      'searching',
      'coding',
      'executing',
      'generic-working',
    ]) {
      const symbol = LINE_MORPH_SYMBOLS[key];
      expect(symbol, key).toBeDefined();
      expect(symbol!.length, key).toBeGreaterThanOrEqual(2);
      expect(symbol!.length, key).toBeLessThanOrEqual(4);
    }
  });
});
