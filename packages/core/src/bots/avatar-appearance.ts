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

const INK = '#2a2430';
const FACES = {
  soft: {
    head: 'M64 27C84 27 96 41 96 61C96 83 82 98 64 98C46 98 32 83 32 61C32 41 44 27 64 27Z',
    hair: '',
    eyes: [50, 78, 63],
    ears: [31, 97, 66],
    browY: 54,
    noseY: 71,
    mouthY: 82,
    cheekY: 76,
  },
  long: {
    head: 'M64 25C82 25 93 39 93 60C93 86 80 103 64 103C48 103 35 86 35 60C35 39 46 25 64 25Z',
    hair: ' transform="translate(64 0) scale(.92 1) translate(-64 -1.5)"',
    eyes: [51, 77, 63],
    ears: [34, 94, 66],
    browY: 54,
    noseY: 73,
    mouthY: 86,
    cheekY: 78,
  },
} as const;
const HAIR = {
  sweep: {
    back: '',
    front:
      'M31 66C26 40 38 20 62 17C86 14 104 30 100 58C99 63 98 66 97 68C96 59 93 52 88 47C79 52 66 52 56 47C50 44 46 40 44 36C40 44 36 54 34 66Z',
    shine: 'M66 21C76 21 85 25 91 32C88 32 84 28 78 26C74 25 70 24 66 24Z',
  },
  crop: {
    back: '',
    front:
      'M32 60C29 44 32 30 42 24C45 18 52 16 57 18C61 13 68 13 72 17C78 14 86 17 88 23C97 28 100 44 96 60L93 51C91 46 88 43 84 42Q80 46 75 42Q70 46 65 42Q60 46 55 42Q50 45 46 42C41 44 38 47 36 51Z',
    shine: 'M64 18C70 18 76 20 80 23C76 23 71 22 66 22Z',
  },
  bob: {
    back: 'M23 94C18 70 20 40 36 27C50 16 78 16 92 27C108 40 110 70 105 94C99 100 90 100 86 94L86 62L42 62L42 94C38 100 29 100 23 94Z',
    front:
      'M30 70C24 40 40 18 64 18C88 18 104 40 98 70L95 70C94 60 91 53 87 48C77 52 60 50 47 43C41 48 37 57 35 70Z',
    shine: 'M68 22C78 23 86 28 91 36C88 36 84 31 79 28C75 26 71 25 68 25Z',
  },
} as const;
const SHIRT = 'M17.5 108C26 101 41 97 53 96L75 96C87 97 102 101 110.5 108A64 64 0 0 1 17.5 108Z';

export function illustratedAvatarSvg(recipe: IllustratedAvatarRecipe): string {
  if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const { skinColor, hairColor, shirtColor } = recipe;
  const face = FACES[recipe.head];
  const hair = HAIR[recipe.hair];
  const [lx, rx, ey] = face.eyes;
  const [lEar, rEar, earY] = face.ears;
  const { browY, noseY, mouthY, cheekY } = face;
  const glasses =
    recipe.accessory === 'glasses'
      ? `<g fill="#fff" fill-opacity=".18" stroke="${INK}" stroke-width="2.4"><rect x="${lx - 9.5}" y="${ey - 7.5}" width="19" height="15" rx="5.5"/><rect x="${rx - 9.5}" y="${ey - 7.5}" width="19" height="15" rx="5.5"/><path d="M${lx + 9.5} ${ey - 2}Q64 ${ey - 5} ${rx - 9.5} ${ey - 2}" fill="none"/></g>`
      : '';
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="512" height="512" aria-hidden="true">',
    `<circle cx="64" cy="64" r="64" fill="#faf6f0"/><circle cx="64" cy="64" r="64" fill="${shirtColor}" fill-opacity=".2"/>`,
    `<g class="bh-illustrated-body"><path d="M54 84L74 84L74 100Q64 106 54 100Z" fill="${skinColor}"/><path d="M54 84L74 84L74 100Q64 106 54 100Z" fill="#000" fill-opacity=".12"/><path d="${SHIRT}" fill="${shirtColor}"/><path d="M52 96.2Q64 108 76 96.2L73 96.2Q64 103 55 96.2Z" fill="#000" fill-opacity=".14"/></g>`,
    '<g class="bh-illustrated-head">',
    hair.back ? `<path d="${hair.back}" fill="${hairColor}"${face.hair}/>` : '',
    `<g fill="${skinColor}"><circle cx="${lEar}" cy="${earY}" r="6.5"/><circle cx="${rEar}" cy="${earY}" r="6.5"/></g>`,
    `<g fill="#000" fill-opacity=".1"><circle cx="${lEar}" cy="${earY}" r="2.6"/><circle cx="${rEar}" cy="${earY}" r="2.6"/></g>`,
    `<path d="${face.head}" fill="${skinColor}"/>`,
    `<g${face.hair}><path d="${hair.front}" fill="#000" fill-opacity=".09" transform="translate(0 3)"/><path d="${hair.front}" fill="${hairColor}"/><path d="${hair.shine}" fill="#fff" fill-opacity=".22"/></g>`,
    '<g class="bh-illustrated-face">',
    `<g fill="#f26b6b" fill-opacity=".26"><ellipse cx="${lx - 6}" cy="${cheekY}" rx="5.5" ry="3.5"/><ellipse cx="${rx + 6}" cy="${cheekY}" rx="5.5" ry="3.5"/></g>`,
    `<path d="M${lx - 6.5} ${browY + 0.5}Q${lx} ${browY - 2.5} ${lx + 6} ${browY}M${rx - 6} ${browY}Q${rx} ${browY - 2.5} ${rx + 6.5} ${browY + 0.5}" fill="none" stroke="${INK}" stroke-opacity=".85" stroke-width="2.8" stroke-linecap="round"/>`,
    `<g class="bh-illustrated-gaze"><g fill="${INK}"><ellipse cx="${lx}" cy="${ey}" rx="3.5" ry="4.1"/><ellipse cx="${rx}" cy="${ey}" rx="3.5" ry="4.1"/></g><g fill="#fff"><circle cx="${lx + 1.3}" cy="${ey - 1.5}" r="1.2"/><circle cx="${rx + 1.3}" cy="${ey - 1.5}" r="1.2"/></g></g>`,
    `<path d="M64.5 ${noseY - 4}Q61 ${noseY + 2} 63 ${noseY + 3.5}Q65 ${noseY + 4.5} 67 ${noseY + 3}" fill="none" stroke="#000" stroke-opacity=".22" stroke-width="2.2" stroke-linecap="round"/>`,
    `<path d="M57 ${mouthY}Q64 ${mouthY + 1.6} 71 ${mouthY}Q69.5 ${mouthY + 7.5} 64 ${mouthY + 7.5}Q58.5 ${mouthY + 7.5} 57 ${mouthY}Z" fill="${INK}"/>`,
    `<path d="M59.8 ${mouthY + 5.3}Q64 ${mouthY + 3.3} 68.2 ${mouthY + 5.3}Q66.4 ${mouthY + 7.5} 64 ${mouthY + 7.5}Q61.6 ${mouthY + 7.5} 59.8 ${mouthY + 5.3}Z" fill="#e96f6f"/>`,
    glasses,
    '</g></g></svg>',
  ].join('');
}
