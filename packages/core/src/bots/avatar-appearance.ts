export const AVATAR_PARTS = {
  head: ['round', 'oval', 'square', 'long'],
  hair: [
    'crop',
    'sweep',
    'spiky',
    'buzz',
    'curly',
    'mohawk',
    'bob',
    'long',
    'bun',
    'pigtails',
    'afro',
    'none',
  ],
  eyes: ['round', 'dot', 'sparkle', 'lashes', 'sleepy', 'happy', 'wink', 'sharp'],
  brows: ['soft', 'thick', 'raised', 'angry', 'worried', 'none'],
  nose: ['button', 'dot', 'line', 'none'],
  mouth: ['smile', 'grin', 'open', 'flat', 'smirk', 'cat', 'tongue', 'o'],
  cheeks: ['blush', 'freckles', 'none'],
  glasses: ['none', 'round', 'square', 'shades', 'monocle'],
  accessory: ['none', 'beanie', 'cap', 'headphones', 'flower', 'bow', 'earring', 'crown', 'halo'],
} as const;

export type AvatarPart = keyof typeof AVATAR_PARTS;
export const AVATAR_COLORS = ['skinColor', 'hairColor', 'eyeColor', 'shirtColor'] as const;
export type AvatarColor = (typeof AVATAR_COLORS)[number];

export type IllustratedAvatarRecipe = {
  schemaVersion: 1;
  family: 'illustrated';
  assetVersion: 1;
  rigVersion: 1;
} & { [P in AvatarPart]: (typeof AVATAR_PARTS)[P][number] } & Record<AvatarColor, string>;

export interface AvatarAppearance {
  revision: string;
  recipe: IllustratedAvatarRecipe;
}

export const DEFAULT_ILLUSTRATED_RECIPE: IllustratedAvatarRecipe = {
  schemaVersion: 1,
  family: 'illustrated',
  assetVersion: 1,
  rigVersion: 1,
  head: 'round',
  hair: 'crop',
  eyes: 'round',
  brows: 'soft',
  nose: 'button',
  mouth: 'smile',
  cheeks: 'blush',
  glasses: 'none',
  accessory: 'none',
  skinColor: '#f2c9a8',
  hairColor: '#5a3a2a',
  eyeColor: '#3f7fbf',
  shirtColor: '#5b8bd6',
};

const PART_KEYS = Object.keys(AVATAR_PARTS) as AvatarPart[];

export function isIllustratedAvatarRecipe(value: unknown): value is IllustratedAvatarRecipe {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== Object.keys(DEFAULT_ILLUSTRATED_RECIPE).length) return false;
  return (
    r['schemaVersion'] === 1 &&
    r['family'] === 'illustrated' &&
    r['assetVersion'] === 1 &&
    r['rigVersion'] === 1 &&
    PART_KEYS.every(
      (key) =>
        typeof r[key] === 'string' && (AVATAR_PARTS[key] as readonly string[]).includes(r[key]),
    ) &&
    AVATAR_COLORS.every((key) => typeof r[key] === 'string' && /^#[\da-f]{6}$/iu.test(r[key]))
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
  const canonical: Record<string, unknown> = {
    schemaVersion: 1,
    family: 'illustrated',
    assetVersion: 1,
    rigVersion: 1,
  };
  for (const key of PART_KEYS) canonical[key] = recipe[key];
  for (const key of AVATAR_COLORS) canonical[key] = recipe[key].toLowerCase();
  return canonical as IllustratedAvatarRecipe;
}

export const AVATAR_MARKS = [
  'thinking-dots',
  'searching',
  'coding',
  'executing',
  'generic-working',
] as const;

const SIZE = 32;
const INK = '#2a2230';
const WHITE = '#ffffff';
const PAPER = '#efece7';
const BLUSH = '#f4879a';
const MOUTH = '#8a2f3c';
const TONGUE = '#ef6f84';
const GOLD = '#efb93f';
const TILE_RADIUS = 6;

type Cell = string | undefined;
type Grid = Cell[][];
type Point = readonly [number, number];
type Mask = (x: number, y: number) => boolean;

const blank = (): Grid => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(undefined));
const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

function channels(hex: string): number[] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [16, 8, 0].map((bit) => (n >> bit) & 255);
}

function hex(values: number[]): string {
  return `#${values
    .map((v) =>
      Math.min(255, Math.max(0, Math.round(v)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const shade = (color: string, k: number) => hex(channels(color).map((v) => v * k));
const mix = (base: string, tint: string, k: number) => {
  const t = channels(tint);
  return hex(channels(base).map((v, i) => v * (1 - k) + t[i]! * k));
};

const inTile: Mask = (x, y) => {
  const clamp = (v: number) => Math.min(Math.max(v, TILE_RADIUS), SIZE - TILE_RADIUS);
  const cx = x + 0.5;
  const cy = y + 0.5;
  return (cx - clamp(cx)) ** 2 + (cy - clamp(cy)) ** 2 <= TILE_RADIUS ** 2;
};

function paint(grid: Grid, test: Mask, color: string): void {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (test(x, y)) grid[y]![x] = color;
}

function dots(grid: Grid, points: readonly Point[], color: string): void {
  for (const [x, y] of points) if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y]![x] = color;
}

function sprite(
  grid: Grid,
  rows: readonly string[],
  ox: number,
  oy: number,
  palette: Record<string, string>,
  flip = false,
): void {
  rows.forEach((row, y) =>
    [...row].forEach((code, i) => {
      const color = palette[code];
      const x = flip ? row.length - 1 - i : i;
      if (color) dots(grid, [[ox + x, oy + y]], color);
    }),
  );
}

function outline(grid: Grid): Grid {
  const out = grid.map((row) => [...row]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (grid[y]![x]) continue;
      const neighbour = [
        grid[y]?.[x - 1],
        grid[y]?.[x + 1],
        grid[y - 1]?.[x],
        grid[y + 1]?.[x],
      ].find(Boolean);
      if (neighbour) out[y]![x] = mix(shade(neighbour, 0.42), INK, 0.35);
    }
  return out;
}

const clip = (grid: Grid): Grid =>
  grid.map((row, y) => row.map((cell, x) => (inTile(x, y) ? cell : undefined)));

function rects(grid: Grid): string {
  let markup = '';
  for (let y = 0; y < SIZE; y++) {
    let x = 0;
    while (x < SIZE) {
      const color = grid[y]![x];
      if (!color) {
        x++;
        continue;
      }
      let width = 1;
      while (x + width < SIZE && grid[y]![x + width] === color) width++;
      markup += `<rect x="${x}" y="${y}" width="${width}" height="1" fill="${color}"/>`;
      x += width;
    }
  }
  return markup;
}

const roundedRect =
  (x0: number, y0: number, x1: number, y1: number, r: number): Mask =>
  (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false;
    const cx = Math.min(Math.max(x + 0.5, x0 + r), x1 + 1 - r);
    const cy = Math.min(Math.max(y + 0.5, y0 + r), y1 + 1 - r);
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
  };

const HEADS = {
  round: { mask: ellipse(16, 14.6, 9.6, 9.2), half: 9.6, chin: 23, mouth: 20 },
  oval: { mask: ellipse(16, 14.8, 9, 9.8), half: 9, chin: 24, mouth: 20 },
  square: { mask: roundedRect(7, 6, 24, 23, 3.2), half: 9, chin: 23, mouth: 20 },
  long: { mask: ellipse(16, 15.2, 8.4, 10.4), half: 8.4, chin: 25, mouth: 21 },
} as const;

const EYE_TOP = 13;
const EYE_X = [9, 20] as const;

const EYES: Record<IllustratedAvatarRecipe['eyes'], readonly string[]> = {
  round: ['KKK', 'KWI', 'IIL', 'ILL'],
  dot: ['...', '.KK', '.KK', '...'],
  sparkle: ['KKK', 'KWI', 'IWL', 'ILL'],
  lashes: ['KKKK', '.KWI', '.IIL', '.ILL'],
  sleepy: ['...', 'KKK', 'IIL', '...'],
  happy: ['...', '.K.', 'K.K', '...'],
  wink: ['KKK', 'KWI', 'IIL', 'ILL'],
  sharp: ['K...', 'KKKK', '.IIL', '..L.'],
};
const CLOSED = ['...', '...', 'KKK', '...'];

const BROWS: Record<IllustratedAvatarRecipe['brows'], readonly string[]> = {
  soft: ['.BB.'],
  thick: ['BBBB', '.BB.'],
  raised: ['.BB.', 'B..B'],
  angry: ['BB..', '..BB'],
  worried: ['..BB', 'BB..'],
  none: [],
};

function hairMasks(recipe: IllustratedAvatarRecipe): { back: Mask; front: Mask } {
  const head = HEADS[recipe.head];
  const left = Math.round(16 - head.half);
  const right = Math.round(15 + head.half);
  const cap = ellipse(16, 13.4, head.half + 1.4, 10);
  const side = (x: number) => x <= left + 1 || x >= right - 1;
  const none: Mask = () => false;
  switch (recipe.hair) {
    case 'none':
      return { back: none, front: none };
    case 'buzz':
      return { back: none, front: (x, y) => cap(x, y) && y <= 8 };
    case 'crop':
      return {
        back: none,
        front: (x, y) => cap(x, y) && (y <= 9 || (y === 10 && x % 2 === 1) || (y <= 13 && side(x))),
      };
    case 'sweep':
      return {
        back: none,
        front: (x, y) =>
          cap(x, y) &&
          (y <= 8 ||
            (y <= 11 && x >= 8 + (y - 8) * 3 && x <= 18 + (11 - y) * 3) ||
            (y <= 14 && side(x))),
      };
    case 'spiky':
      return {
        back: none,
        front: (x, y) => {
          const phase = (x - left + 3) % 3;
          const peak = phase === 1 ? 1 : phase === 0 ? 2 : 3;
          return x >= left - 1 && x <= right + 1 && y >= peak && (y <= 9 || (y <= 12 && side(x)));
        },
      };
    case 'curly': {
      const bumps: Point[] = Array.from({ length: 8 }, (_, i) => {
        const angle = Math.PI * (1.05 + (i * 0.9) / 7);
        return [16 + (head.half + 0.6) * Math.cos(angle), 12 + 8.6 * Math.sin(angle)] as Point;
      });
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (y <= 9 || (y <= 12 && side(x)))) ||
          bumps.some(([bx, by]) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= 5.2),
      };
    }
    case 'mohawk':
      return { back: none, front: (x, y) => x >= 14 && x <= 17 && y >= 0 && y <= 9 };
    case 'bob':
      return {
        back: (x, y) => ellipse(16, 13, head.half + 2.6, 10.4)(x, y) && y <= 21,
        front: (x, y) => cap(x, y) && (y <= 10 || side(x)),
      };
    case 'long':
      return {
        back: (x, y) =>
          (ellipse(16, 13, head.half + 2.4, 10.2)(x, y) && y <= 16) ||
          (y > 15 &&
            y <= 29 &&
            x >= left - 2 &&
            x <= right + 2 &&
            (x <= left + 1 || x >= right - 1)),
        front: (x, y) => cap(x, y) && (y <= 8 || (y <= 11 && x <= 16 - (y - 8) * 2) || side(x)),
      };
    case 'bun':
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (y <= 9 || (y <= 12 && side(x)))) || ellipse(16, 2.4, 3.6, 2.6)(x, y),
      };
    case 'pigtails':
      return {
        back: (x, y) =>
          ellipse(left - 1.8, 15.5, 3, 4.2)(x, y) || ellipse(right + 2.8, 15.5, 3, 4.2)(x, y),
        front: (x, y) => cap(x, y) && (y <= 9 || (y <= 13 && side(x))),
      };
    case 'afro':
      return {
        back: ellipse(16, 11.6, head.half + 5.6, 11.2),
        front: (x, y) => cap(x, y) && y <= 8,
      };
  }
}

function accessory(recipe: IllustratedAvatarRecipe, grid: Grid): void {
  const head = HEADS[recipe.head];
  const left = Math.round(16 - head.half);
  const right = Math.round(15 + head.half);
  const shirt = recipe.shirtColor;
  switch (recipe.accessory) {
    case 'none':
      return;
    case 'beanie':
      paint(grid, (x, y) => ellipse(16, 9.6, head.half + 2, 7.6)(x, y) && y <= 8, shirt);
      paint(
        grid,
        (x, y) => (y === 3 || y === 6) && ellipse(16, 9.6, head.half + 2, 7.6)(x, y),
        shade(shirt, 0.88),
      );
      paint(grid, (x, y) => y === 9 && x >= left - 1 && x <= right + 1, shade(shirt, 0.74));
      paint(grid, ellipse(16, 1.4, 2, 1.6), WHITE);
      return;
    case 'cap':
      paint(grid, (x, y) => ellipse(16, 9.6, head.half + 1.8, 7)(x, y) && y <= 8, shirt);
      paint(grid, (x, y) => y === 9 && x >= left - 1 && x <= right + 5, shade(shirt, 0.7));
      dots(grid, [[16, 3]], mix(shirt, WHITE, 0.5));
      return;
    case 'headphones':
      paint(
        grid,
        (x, y) =>
          ellipse(16, 12.6, head.half + 2.6, 11)(x, y) &&
          !ellipse(16, 12.6, head.half + 1.6, 10)(x, y) &&
          y <= 13,
        '#5d5b66',
      );
      paint(
        grid,
        (x, y) =>
          y >= 13 &&
          y <= 18 &&
          (x === left - 2 || x === left - 1 || x === right + 1 || x === right + 2),
        '#e25d6a',
      );
      return;
    case 'flower':
      dots(
        grid,
        [
          [23, 4],
          [25, 4],
          [24, 3],
          [24, 5],
        ],
        '#f59fba',
      );
      dots(grid, [[24, 4]], GOLD);
      return;
    case 'bow':
      sprite(grid, ['RR.RR', 'RRrRR', 'RR.RR'], 21, 3, { R: '#e5566a', r: '#b83a50' });
      return;
    case 'earring':
      dots(
        grid,
        [
          [left - 1, 18],
          [right + 1, 18],
        ],
        GOLD,
      );
      return;
    case 'crown':
      sprite(grid, ['G..G..G..G', 'GG.GGGG.GG', 'GGGGrGGGGG'], 11, 1, { G: GOLD, r: '#e5566a' });
      return;
    case 'halo':
      paint(
        grid,
        (x, y) => ellipse(16, 1.6, 6.4, 1.6)(x, y) && !ellipse(16, 1.6, 4.2, 0.7)(x, y),
        GOLD,
      );
      return;
  }
}

const MARKS: Record<(typeof AVATAR_MARKS)[number], { color: string; rows: string[] }> = {
  'thinking-dots': {
    color: '#e8a93a',
    rows: ['.XX.', 'X..X', '...X', '..X.', '..X.', '....', '..X.'],
  },
  searching: { color: '#5a9be0', rows: ['.XX..', 'X..X.', 'X..X.', '.XX..', '...X.', '....X'] },
  coding: { color: '#5a9be0', rows: ['.X.', '.X.', 'X.X', 'X.X', '.X.'] },
  executing: { color: '#e8a93a', rows: ['X', 'X', 'X', 'X', '.', 'X'] },
  'generic-working': { color: '#8a8792', rows: ['X.X.X'] },
};

export function illustratedAvatarSvg(recipe: IllustratedAvatarRecipe): string {
  if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const head = HEADS[recipe.head];
  const skin = recipe.skinColor;
  const hair = recipe.hairColor;
  const left = Math.round(16 - head.half);
  const right = Math.round(15 + head.half);

  const tile = blank();
  paint(tile, inTile, mix(PAPER, recipe.shirtColor, 0.18));

  const body = blank();
  paint(body, (x, y) => y >= 26 && Math.abs(x + 0.5 - 16) <= 7 + (y - 26) * 1.8, recipe.shirtColor);
  paint(
    body,
    (x, y) =>
      y >= 26 &&
      y <= 27 &&
      Math.abs(x + 0.5 - 16) <= 7 + (y - 26) * 1.8 &&
      Math.abs(x + 0.5 - 16) > 5 + (y - 26) * 1.8,
    shade(recipe.shirtColor, 0.84),
  );
  paint(body, (x, y) => y >= head.chin - 1 && y <= 27 && x >= 14 && x <= 17, shade(skin, 0.86));

  const masks = hairMasks(recipe);
  const base = blank();
  paint(base, masks.back, shade(hair, 0.86));
  dots(
    base,
    [
      [left - 1, 15],
      [left - 1, 16],
      [right + 1, 15],
      [right + 1, 16],
    ],
    skin,
  );
  paint(base, head.mask, skin);
  paint(base, masks.front, hair);
  for (let y = SIZE - 1; y > 0; y--)
    for (let x = 0; x < SIZE; x++)
      if (
        base[y]![x] === skin &&
        (base[y - 1]![x] === hair || base[y - 1]![x] === shade(hair, 0.72))
      )
        base[y]![x] = shade(skin, 0.88);
  for (let y = 0; y < SIZE - 1; y++)
    for (let x = 0; x < SIZE; x++)
      if (base[y]![x] === hair && base[y + 1]![x] !== hair) base[y]![x] = shade(hair, 0.72);
  const highlight = mix(hair, WHITE, 0.32);
  for (let x = left + 2; x <= left + 8; x++) {
    const y = [...Array(SIZE).keys()].find((row) => base[row]![x] === hair);
    if (y !== undefined && base[y + 1]?.[x] === hair && base[y + 2]?.[x] === hair)
      base[y + 1]![x] = highlight;
  }
  accessory(recipe, base);

  const face = blank();
  const my = head.mouth;
  const [lx, rx] = EYE_X;
  const brow = { B: shade(hair, 0.6) };
  if (BROWS[recipe.brows].length) {
    const browTop = EYE_TOP - 1 - BROWS[recipe.brows].length;
    sprite(face, BROWS[recipe.brows], lx - 1, browTop, brow);
    sprite(face, BROWS[recipe.brows], rx, browTop, brow, true);
  }
  const noseShade = shade(skin, 0.74);
  if (recipe.nose === 'dot') dots(face, [[16, my - 2]], noseShade);
  if (recipe.nose === 'button')
    dots(
      face,
      [
        [15, my - 2],
        [16, my - 2],
      ],
      shade(skin, 0.82),
    );
  if (recipe.nose === 'line')
    dots(
      face,
      [
        [16, my - 3],
        [16, my - 2],
        [15, my - 2],
      ],
      shade(skin, 0.68),
    );
  const mouths: Record<IllustratedAvatarRecipe['mouth'], readonly string[]> = {
    smile: ['K..K', '.KK.'],
    grin: ['KKKK', 'KWWK', '.KK.'],
    open: ['.KK.', 'KMMK', '.KK.'],
    flat: ['.KK.'],
    smirk: ['...K', 'KKK.'],
    cat: ['K.K.K', '.K.K.'],
    tongue: ['K..K', '.KTT', '..T.'],
    o: ['.K.', 'K.K', '.K.'],
  };
  const shape = mouths[recipe.mouth];
  sprite(face, shape, 16 - Math.floor(shape[0]!.length / 2), my, {
    K: MOUTH,
    W: WHITE,
    M: TONGUE,
    T: TONGUE,
  });
  if (recipe.cheeks === 'blush')
    paint(
      face,
      (x, y) =>
        y === my - 1 && (x === left + 2 || x === left + 3 || x === right - 3 || x === right - 2),
      BLUSH,
    );
  if (recipe.cheeks === 'freckles')
    dots(
      face,
      [
        [left + 2, my - 1],
        [left + 4, my],
        [right - 4, my],
        [right - 2, my - 1],
      ],
      shade(skin, 0.68),
    );

  const eyePalette = { K: INK, W: WHITE, I: shade(recipe.eyeColor, 0.72), L: recipe.eyeColor };
  const eyes = blank();
  const style = EYES[recipe.eyes];
  sprite(eyes, style, lx + 3 - style[0]!.length, EYE_TOP, eyePalette);
  sprite(eyes, recipe.eyes === 'wink' ? CLOSED : style, rx, EYE_TOP, eyePalette, true);
  const closed = blank();
  sprite(closed, CLOSED, lx, EYE_TOP, eyePalette);
  sprite(closed, CLOSED, rx, EYE_TOP, eyePalette, true);

  const glasses = blank();
  const frame = (cx: number, round: boolean) =>
    paint(
      glasses,
      (x, y) => {
        const inside = x >= cx && x <= cx + 2 && y >= EYE_TOP && y <= EYE_TOP + 3;
        const box = x >= cx - 1 && x <= cx + 3 && y >= EYE_TOP - 1 && y <= EYE_TOP + 4;
        const corner = (x === cx - 1 || x === cx + 3) && (y === EYE_TOP - 1 || y === EYE_TOP + 4);
        return box && !inside && !(round && corner);
      },
      INK,
    );
  if (recipe.glasses === 'round' || recipe.glasses === 'square') {
    frame(lx, recipe.glasses === 'round');
    frame(rx, recipe.glasses === 'round');
    paint(glasses, (x, y) => y === EYE_TOP && x >= lx + 4 && x <= rx - 2, INK);
  }
  if (recipe.glasses === 'shades') {
    for (const cx of EYE_X)
      paint(glasses, (x, y) => x >= cx - 1 && x <= cx + 3 && y >= EYE_TOP && y <= EYE_TOP + 3, INK);
    paint(glasses, (x, y) => y === EYE_TOP && x >= lx + 4 && x <= rx - 2, INK);
    dots(
      glasses,
      [
        [lx, EYE_TOP + 1],
        [rx, EYE_TOP + 1],
      ],
      '#7d7b88',
    );
  }
  if (recipe.glasses === 'monocle') {
    frame(rx, true);
    dots(
      glasses,
      [
        [rx + 3, EYE_TOP + 5],
        [rx + 3, EYE_TOP + 6],
        [rx + 3, EYE_TOP + 7],
      ],
      GOLD,
    );
  }

  const marks = AVATAR_MARKS.map((mark) => {
    const grid = blank();
    sprite(grid, MARKS[mark].rows, 24, 2, { X: MARKS[mark].color });
    return `<g data-avatar-mark="${mark}" opacity="0">${rects(grid)}</g>`;
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="512" height="512" shape-rendering="crispEdges" aria-hidden="true">`,
    rects(tile),
    `<g class="bh-illustrated-body">${rects(clip(outline(body)))}</g>`,
    `<g class="bh-illustrated-head">${rects(clip(outline(base)))}`,
    `<g class="bh-illustrated-face">${rects(face)}`,
    `<g class="bh-illustrated-gaze">${rects(eyes)}</g>`,
    `<g class="bh-illustrated-blink" opacity="0">${rects(closed)}</g>`,
    `${rects(glasses)}</g></g>`,
    `<g class="bh-illustrated-marks">${marks}</g>`,
    '</svg>',
  ].join('');
}
