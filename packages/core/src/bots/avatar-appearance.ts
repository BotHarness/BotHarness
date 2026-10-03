export interface IllustratedAvatarRecipe {
  schemaVersion: 1;
  family: 'illustrated';
  assetVersion: 1;
  rigVersion: 1;
  head: 'soft' | 'long';
  hair: 'sweep' | 'crop' | 'bob';
  accessory: 'none' | 'glasses';
  skinColor: string;
  hairColor: string;
  shirtColor: string;
}

export interface AvatarAppearance {
  revision: string;
  recipe: IllustratedAvatarRecipe;
}

export const DEFAULT_ILLUSTRATED_RECIPE: IllustratedAvatarRecipe = {
  schemaVersion: 1,
  family: 'illustrated',
  assetVersion: 1,
  rigVersion: 1,
  head: 'soft',
  hair: 'sweep',
  accessory: 'none',
  skinColor: '#ebbd9f',
  hairColor: '#44332c',
  shirtColor: '#6c8cbd',
};

export function isIllustratedAvatarRecipe(value: unknown): value is IllustratedAvatarRecipe {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== Object.keys(DEFAULT_ILLUSTRATED_RECIPE).length) return false;
  return (
    r['schemaVersion'] === 1 &&
    r['family'] === 'illustrated' &&
    r['assetVersion'] === 1 &&
    r['rigVersion'] === 1 &&
    typeof r['head'] === 'string' &&
    ['soft', 'long'].includes(r['head']) &&
    typeof r['hair'] === 'string' &&
    ['sweep', 'crop', 'bob'].includes(r['hair']) &&
    typeof r['accessory'] === 'string' &&
    ['none', 'glasses'].includes(r['accessory']) &&
    ['skinColor', 'hairColor', 'shirtColor'].every(
      (key) => typeof r[key] === 'string' && /^#[\da-f]{6}$/iu.test(r[key]),
    )
  );
}

export function isAvatarAppearance(value: unknown): value is AvatarAppearance {
  if (typeof value !== 'object' || value === null) return false;
  const appearance = value as Record<string, unknown>;
  return (
    Object.keys(appearance).length === 2 &&
    typeof appearance['revision'] === 'string' &&
    /^[a-f\d]{64}$/u.test(appearance['revision']) &&
    isIllustratedAvatarRecipe(appearance['recipe'])
  );
}

export function canonicalAvatarRecipe(recipe: IllustratedAvatarRecipe): IllustratedAvatarRecipe {
  return {
    schemaVersion: 1,
    family: 'illustrated',
    assetVersion: 1,
    rigVersion: 1,
    head: recipe.head,
    hair: recipe.hair,
    accessory: recipe.accessory,
    skinColor: recipe.skinColor.toLowerCase(),
    hairColor: recipe.hairColor.toLowerCase(),
    shirtColor: recipe.shirtColor.toLowerCase(),
  };
}

export function illustratedAvatarSvg(recipe: IllustratedAvatarRecipe): string {
  if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const { head, hair, accessory, skinColor, hairColor, shirtColor } = recipe;
  const headPath =
    head === 'soft'
      ? 'M34 54 C34 34 94 34 94 54 L91 76 Q87 99 64 101 Q41 99 37 76Z'
      : 'M37 51 C37 32 91 32 91 51 L89 78 Q85 106 64 108 Q43 106 39 78Z';
  const hairPath =
    hair === 'sweep'
      ? 'M31 64 Q22 35 45 26 Q71 15 95 36 L98 63 L89 53 L86 38 Q68 56 38 49 L37 64Z'
      : hair === 'crop'
        ? 'M34 59 L30 39 Q44 20 66 24 Q88 19 98 44 L93 61 L86 44 L73 47 L66 39 L43 47Z'
        : 'M27 84 L27 49 Q27 23 63 23 Q100 23 101 51 L101 85 L91 86 L88 46 Q68 52 40 44 L37 85Z';
  const frontHairPath =
    hair === 'bob'
      ? 'M27 52 Q27 23 63 23 Q100 23 101 51 L90 56 L88 46 Q68 52 40 44 L36 58Z'
      : hairPath;
  const glasses =
    accessory === 'glasses'
      ? '<g fill="none" stroke="#292732" stroke-width="2.4"><rect x="40" y="57" width="19" height="15" rx="6"/><rect x="69" y="57" width="19" height="15" rx="6"/><path d="M59 63Q64 59 69 63M35 61L40 62M88 62L93 61"/></g>'
      : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512" aria-hidden="true"><g class="bh-illustrated-body"><path d="M19 128Q22 108 46 104L82 104Q106 108 109 128" fill="${shirtColor}"/><path d="M53 91L53 107Q64 117 75 107L75 91" fill="${skinColor}"/><path d="M48 108L57 120L64 112L71 120L80 108" fill="none" stroke="#292732" stroke-opacity=".24" stroke-width="2"/></g><g class="bh-illustrated-head" stroke="#292732" stroke-width="2.1" stroke-linejoin="round"><path d="${hairPath}" fill="${hairColor}"/><ellipse cx="35" cy="69" rx="6" ry="9" fill="${skinColor}"/><ellipse cx="93" cy="69" rx="6" ry="9" fill="${skinColor}"/><path d="${headPath}" fill="${skinColor}"/><path d="${frontHairPath}" fill="${hairColor}"/><g class="bh-illustrated-face"><g class="bh-illustrated-gaze"><path d="M45 56Q50 53 55 56M73 56Q78 53 83 56" fill="none" stroke-width="2.4"/><ellipse cx="50" cy="65" rx="2.1" ry="3.4" fill="#292732" stroke="none"/><ellipse cx="78" cy="65" rx="2.1" ry="3.4" fill="#292732" stroke="none"/></g><path d="M64 67L61 78L66 79" fill="none" stroke-opacity=".55"/><path d="M55 87Q64 94 73 86" fill="none" stroke-width="2.5" stroke-linecap="round"/>${glasses}</g></g></svg>`;
}
