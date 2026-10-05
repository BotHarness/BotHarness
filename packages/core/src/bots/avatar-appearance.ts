import {
  canonicalLineRecipe,
  isLineAvatarRecipe,
  lineAvatarSvg,
  type LineAvatarRecipe,
} from './avatar-line.js';
import {
  canonicalRecipe as canonicalAvatarRecipe,
  isPixelAvatarRecipe as isIllustratedAvatarRecipe,
  pixelAvatarSvg,
  type PixelAvatarRecipe,
} from '@botharness/pixel-avatar';
export { LINE_TOOL_SYMBOLS, lineMorphFace, type LineMorphNode } from './avatar-line.js';
export { pixelSymbolFor } from './avatar-pixel-symbols.js';
export {
  AVATAR_COLORS,
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  AVATAR_SWATCHES,
  AVATAR_TURNS,
  canonicalRecipe as canonicalAvatarRecipe,
  DEFAULT_RECIPE as DEFAULT_ILLUSTRATED_RECIPE,
  detailedRecipe as detailedAvatarRecipe,
  faceCells as pixelFaceCells,
  isPixelAvatarRecipe as isIllustratedAvatarRecipe,
  PIXEL_SYMBOLS,
  pixelAvatarSvg as illustratedAvatarSvg,
  pixelSymbolCells,
  seededRecipe as seededAvatarRecipe,
  type AvatarColor,
  type AvatarHairPart,
  type AvatarPart,
  type AvatarRange,
  type PixelAvatarRecipe as IllustratedAvatarRecipe,
  type PixelCell,
  type PixelSymbol,
} from '@botharness/pixel-avatar';

export type AvatarRecipe = PixelAvatarRecipe | LineAvatarRecipe;
export type AvatarFamily = AvatarRecipe['family'];
export const AVATAR_FAMILIES = ['illustrated', 'line'] as const satisfies readonly AvatarFamily[];

export interface AvatarAppearance {
  revision: string;
  recipe: AvatarRecipe;
}

export function isAvatarRecipe(value: unknown): value is AvatarRecipe {
  return isIllustratedAvatarRecipe(value) || isLineAvatarRecipe(value);
}

export function canonicalRecipe(recipe: AvatarRecipe): AvatarRecipe {
  return recipe.family === 'line' ? canonicalLineRecipe(recipe) : canonicalAvatarRecipe(recipe);
}

export function avatarSvg(
  recipe: AvatarRecipe,
  options: { turns?: readonly number[] } = {},
): string {
  return recipe.family === 'line'
    ? lineAvatarSvg(recipe, options)
    : pixelAvatarSvg(recipe, options);
}

export interface RetainedAvatarAppearance {
  revision: string;
  recipe: Readonly<Record<string, string | number>>;
}

const RETAINED_KEY = /^[A-Za-z][A-Za-z0-9]{0,31}$/u;
const RETAINED_TEXT = /^[#A-Za-z0-9_-]{1,32}$/u;

export function isRetainedAvatarAppearance(value: unknown): value is RetainedAvatarAppearance {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const appearance = value as Record<string, unknown>;
  const recipe = appearance['recipe'];
  if (
    Object.keys(appearance).length !== 2 ||
    typeof appearance['revision'] !== 'string' ||
    !/^[a-f\d]{64}$/u.test(appearance['revision']) ||
    typeof recipe !== 'object' ||
    recipe === null ||
    Array.isArray(recipe) ||
    Object.getPrototypeOf(recipe) !== Object.prototype
  )
    return false;
  const entries = Object.entries(recipe);
  const version = (key: string) => {
    const v = (recipe as Record<string, unknown>)[key];
    return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 1_000;
  };
  return (
    entries.length >= 1 &&
    entries.length <= 64 &&
    entries.every(
      ([key, v]) =>
        RETAINED_KEY.test(key) &&
        ((typeof v === 'string' && RETAINED_TEXT.test(v)) ||
          (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1_000_000)),
    ) &&
    typeof (recipe as Record<string, unknown>)['family'] === 'string' &&
    ['schemaVersion', 'assetVersion', 'rigVersion'].every(version)
  );
}

export function isAvatarAppearance(value: unknown): value is AvatarAppearance {
  if (typeof value !== 'object' || value === null) return false;
  const appearance = value as Record<string, unknown>;
  return (
    Object.keys(appearance).length === 2 &&
    typeof appearance['revision'] === 'string' &&
    /^[a-f\d]{64}$/u.test(appearance['revision']) &&
    isAvatarRecipe(appearance['recipe'])
  );
}
