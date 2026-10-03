export const AVATAR_PARTS = {
  head: ['round', 'oval', 'square', 'long', 'heart', 'vchin', 'chubby', 'diamond'],
  pose: ['front', 'left', 'right'],
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
    'twintails',
    'drills',
    'ponytail',
    'sidetail',
    'hime',
    'odango',
    'messy',
    'none',
  ],
  eyes: ['round', 'dot', 'sparkle', 'lashes', 'sleepy', 'happy', 'wink', 'sharp'],
  brows: ['soft', 'thick', 'raised', 'angry', 'worried', 'none'],
  nose: ['button', 'dot', 'line', 'none'],
  mouth: ['smile', 'grin', 'open', 'flat', 'smirk', 'cat', 'tongue', 'o'],
  cheeks: ['blush', 'freckles', 'none'],
  glasses: ['none', 'round', 'square', 'shades', 'monocle'],
  backdrop: ['sparkles', 'hearts', 'stars', 'dots', 'none'],
  accessory: [
    'none',
    'beanie',
    'cap',
    'headphones',
    'flower',
    'bow',
    'earring',
    'crown',
    'halo',
    'catears',
    'hairclip',
    'horns',
  ],
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
  pose: 'front',
  hair: 'crop',
  eyes: 'round',
  brows: 'soft',
  nose: 'button',
  mouth: 'smile',
  cheeks: 'blush',
  glasses: 'none',
  backdrop: 'sparkles',
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

const SIZE = 48;
const CX = 24;
const INK = '#2a2230';
const WHITE = '#ffffff';
const PAPER = '#f1eee9';
const BLUSH = '#f4879a';
const MOUTH = '#7a2a38';
const MOUTH_INSIDE = '#b8415a';
const TONGUE = '#ef6f84';
const GOLD = '#efb93f';
const TILE_RADIUS = 9;
const EYE_TOP = 21;
const EYE_X = [14, 29] as const;

type Cell = string | undefined;
type Grid = Cell[][];
type Point = readonly [number, number];
type Mask = (x: number, y: number) => boolean;

const blank = (): Grid => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(undefined));
const ellipse =
  (cx: number, cy: number, rx: number, ry: number): Mask =>
  (x, y) =>
    ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

function channels(color: string): number[] {
  const n = Number.parseInt(color.slice(1), 16);
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

const taper =
  (top: Mask, from: number, width: number, end: number, chin: number): Mask =>
  (x, y) => {
    const cy = y + 0.5;
    if (cy <= from) return top(x, y);
    if (cy > chin) return false;
    const t = (cy - from) / (chin - from);
    return Math.abs(x + 0.5 - CX) <= width - (width - end) * t ** 1.6;
  };

const HEADS = {
  round: { mask: ellipse(CX, 22, 14.2, 13.6), half: 14.2, chin: 35, mouth: 30 },
  oval: { mask: ellipse(CX, 22.4, 13, 14.6), half: 13, chin: 36, mouth: 30 },
  square: { mask: roundedRect(11, 9, 36, 35, 3), half: 13, chin: 35, mouth: 30 },
  long: { mask: ellipse(CX, 23.2, 11.6, 15.6), half: 11.6, chin: 38, mouth: 32 },
  heart: {
    mask: taper(ellipse(CX, 22.5, 14.6, 14), 22.5, 14.6, 6.6, 36),
    half: 14.6,
    chin: 35,
    mouth: 30,
  },
  vchin: {
    mask: taper(
      (x, y) =>
        ellipse(CX, 22.5, 13.8, 14)(x, y) || (y + 0.5 > 22.5 && Math.abs(x + 0.5 - CX) <= 13.8),
      26.5,
      13.8,
      5.4,
      36,
    ),
    half: 13.8,
    chin: 35,
    mouth: 30,
  },
  chubby: { mask: ellipse(CX, 23, 15.6, 12.8), half: 15.6, chin: 35, mouth: 30 },
  diamond: {
    mask: taper(
      (x, y) => y + 0.5 >= 8.5 && Math.abs(x + 0.5 - CX) <= 9.6 + 4.8 * ((y + 0.5 - 8.5) / 14),
      22.5,
      14.4,
      6.6,
      36,
    ),
    half: 14,
    chin: 35,
    mouth: 30,
  },
} as const;

const EYES: Record<IllustratedAvatarRecipe['eyes'], readonly string[]> = {
  round: ['KKKKK', 'KWWDD', 'DWDDI', 'DDIII', 'DIILW', '.ILL.'],
  dot: ['.....', '.KKK.', '.KWK.', '.KKK.', '.....', '.....'],
  sparkle: ['KKKKK', 'KWWDD', 'DWWDW', 'DDIII', 'DWILL', '.ILL.'],
  lashes: ['KKKKKK', '.KWWDD', '.DWDDI', '.DDIII', '.DIILW', '..ILL.'],
  sleepy: ['.....', '.....', 'KKKKK', 'DWDII', '.IILL', '.....'],
  happy: ['.....', '.....', '.KKK.', 'K...K', '.....', '.....'],
  wink: ['KKKKK', 'KWWDD', 'DWDDI', 'DDIII', 'DIILW', '.ILL.'],
  sharp: ['K....', 'KKKKK', '.KWDD', '.DDII', '..ILL', '.....'],
};
const CLOSED = ['.....', '.....', '.....', 'K...K', '.KKK.', '.....'];

const BROWS: Record<IllustratedAvatarRecipe['brows'], readonly string[]> = {
  soft: ['.BBBB', 'B....'],
  thick: ['BBBBB', '.BBBB'],
  raised: ['.BBB.', 'B...B'],
  angry: ['BBB..', '...BB'],
  worried: ['...BB', 'BBB..'],
  none: [],
};

const MOUTHS: Record<IllustratedAvatarRecipe['mouth'], readonly string[]> = {
  smile: ['K...K', '.KKK.'],
  grin: ['K.....K', '.KWWWK.', '..KKK..'],
  open: ['.KKK.', 'KMMMK', 'KMTMK', '.KKK.'],
  flat: ['KKKK'],
  smirk: ['.....K', 'KKKKK.'],
  cat: ['K..K..K', '.KK.KK.'],
  tongue: ['K...K', '.KKK.', '..TT.'],
  o: ['.KK.', 'KMMK', 'KMMK', '.KK.'],
};

const lock = (x: number) => [0, 1, 2, 3, 1][(x + 50) % 5]!;

type HairMasks = { back: Mask; front: Mask; bands?: Mask; ties?: Point[]; strands?: boolean };

function hairMasks(recipe: IllustratedAvatarRecipe, left: number, right: number): HairMasks {
  const head = HEADS[recipe.head];
  const cap = ellipse(CX, 20.4, head.half + 2.2, 15);
  const side = (x: number) => x <= left + 2 || x >= right - 2;
  const fringe = (x: number, y: number) => y <= 15 + lock(x);
  const none: Mask = () => false;
  switch (recipe.hair) {
    case 'none':
      return { back: none, front: none };
    case 'buzz':
      return { back: none, front: (x, y) => cap(x, y) && y <= 12 };
    case 'crop':
      return {
        back: none,
        front: (x, y) =>
          cap(x, y) && (y <= 14 + [0, 1, 2, 1][(x + 40) % 4]! || (y <= 20 && side(x))),
      };
    case 'sweep':
      return {
        back: none,
        front: (x, y) =>
          cap(x, y) &&
          (y <= 12 ||
            (y <= 17 && x >= 12 + (y - 12) * 3 && x <= 27 + (17 - y) * 3) ||
            (y <= 21 && side(x))),
      };
    case 'spiky':
      return {
        back: none,
        front: (x, y) => {
          const peak = [2, 4, 6, 4][(x - left + 40) % 4]!;
          return x >= left - 2 && x <= right + 2 && y >= peak && (y <= 14 || (y <= 19 && side(x)));
        },
      };
    case 'curly': {
      const bumps: Point[] = Array.from({ length: 10 }, (_, i) => {
        const angle = Math.PI * (1.04 + (i * 0.92) / 9);
        return [CX + (head.half + 1) * Math.cos(angle), 18 + 13 * Math.sin(angle)] as Point;
      });
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (y <= 14 || (y <= 19 && side(x)))) ||
          bumps.some(([bx, by]) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= 10.5),
      };
    }
    case 'mohawk':
      return { back: none, front: (x, y) => x >= 21 && x <= 26 && y >= 1 && y <= 14 };
    case 'bob':
      return {
        back: (x, y) => ellipse(CX, 20, head.half + 4, 15.6)(x, y) && y <= 32,
        front: (x, y) => cap(x, y) && (fringe(x, y) || side(x)),
        strands: true,
      };
    case 'long':
      return {
        back: (x, y) =>
          (ellipse(CX, 20, head.half + 3.6, 15.4)(x, y) && y <= 24) ||
          (y > 23 &&
            y <= 44 &&
            x >= left - 3 &&
            x <= right + 3 &&
            (x <= left + 2 || x >= right - 2)),
        front: (x, y) => cap(x, y) && (fringe(x, y) || (y <= 30 && side(x))),
        strands: true,
      };
    case 'bun':
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (fringe(x, y) || (y <= 20 && side(x)))) || ellipse(CX, 4, 5.2, 3.8)(x, y),
        strands: true,
      };
    case 'pigtails':
      return {
        back: (x, y) =>
          ellipse(left - 2.8, 23.5, 4.4, 6.2)(x, y) || ellipse(right + 3.8, 23.5, 4.4, 6.2)(x, y),
        front: (x, y) => cap(x, y) && (fringe(x, y) || (y <= 20 && side(x))),
        strands: true,
      };
    case 'afro':
      return {
        back: ellipse(CX, 18, head.half + 8.4, 16.6),
        front: (x, y) => cap(x, y) && y <= 12,
      };
    case 'twintails':
    case 'drills': {
      const drills = recipe.hair === 'drills';
      const tails: Mask = drills
        ? (x, y) =>
            (ellipse(left - 3.4, 24, 5, 12.6)(x, y) || ellipse(right + 4.4, 24, 5, 12.6)(x, y)) &&
            y >= 11
        : (x, y) =>
            (ellipse(left - 3.6, 29, 4.4, 18.6)(x, y) ||
              ellipse(right + 4.6, 29, 4.4, 18.6)(x, y)) &&
            y >= 11;
      return {
        back: tails,
        front: (x, y) =>
          cap(x, y) && (fringe(x, y) || (y <= 28 && (x <= left + 2 || x >= right - 2))),
        ...(drills
          ? { bands: (x: number, y: number) => tails(x, y) && (y + Math.floor(x / 2)) % 4 === 0 }
          : {}),
        ties: [
          [left - 4, 12],
          [left - 3, 12],
          [left - 2, 12],
          [left - 1, 12],
          [right + 1, 12],
          [right + 2, 12],
          [right + 3, 12],
          [right + 4, 12],
        ],
        strands: true,
      };
    }
    case 'ponytail':
      return {
        back: (x, y) =>
          ellipse(right + 2.4, 11.6, 3.8, 3.6)(x, y) || ellipse(right + 4.8, 23.5, 3.8, 12.4)(x, y),
        front: (x, y) => cap(x, y) && (fringe(x, y) || (y <= 21 && side(x))),
        ties: [
          [right + 1, 14],
          [right + 2, 14],
          [right + 3, 14],
        ],
        strands: true,
      };
    case 'sidetail':
      return {
        back: (x, y) => ellipse(left - 3.4, 29, 4.4, 12.6)(x, y) && y >= 15,
        front: (x, y) =>
          cap(x, y) && (y <= 12 || (y <= 17 && x <= CX - (y - 12) * 3) || (y <= 21 && side(x))),
        ties: [
          [left - 5, 17],
          [left - 4, 17],
          [left - 3, 17],
          [left - 2, 17],
        ],
      };
    case 'hime':
      return {
        back: (x, y) =>
          (ellipse(CX, 20, head.half + 3.2, 15.4)(x, y) && y <= 24) ||
          (y > 23 && y <= 43 && x >= left - 3 && x <= right + 3 && (x <= left || x >= right)),
        front: (x, y) => cap(x, y) && (y <= 16 || (y <= 31 && (x <= left + 2 || x >= right - 2))),
      };
    case 'odango':
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (fringe(x, y) || (y <= 20 && side(x)))) ||
          ellipse(left + 3, 4.8, 4.4, 4.2)(x, y) ||
          ellipse(right - 2, 4.8, 4.4, 4.2)(x, y),
        strands: true,
      };
    case 'messy': {
      const strand: Point[] = [
        [24, 3],
        [25, 2],
        [26, 1],
        [27, 0],
        [28, 0],
        [25, 3],
        [26, 2],
      ];
      return {
        back: none,
        front: (x, y) =>
          (cap(x, y) && (y <= 14 + [0, 2, 4, 1, 3, 0][(x + 60) % 6]! || (y <= 21 && side(x)))) ||
          strand.some(([sx, sy]) => sx === x && sy === y),
      };
    }
  }
}

function accessory(recipe: IllustratedAvatarRecipe, grid: Grid, left: number, right: number): void {
  const head = HEADS[recipe.head];
  const shirt = recipe.shirtColor;
  switch (recipe.accessory) {
    case 'none':
      return;
    case 'beanie': {
      const hat = (x: number, y: number) => ellipse(CX, 15, head.half + 3, 11.4)(x, y) && y <= 13;
      paint(grid, hat, shirt);
      paint(grid, (x, y) => hat(x, y) && (y === 6 || y === 10), shade(shirt, 0.88));
      paint(
        grid,
        (x, y) => (y === 13 || y === 14) && x >= left - 2 && x <= right + 2,
        shade(shirt, 0.74),
      );
      paint(grid, ellipse(CX, 2.2, 3, 2.4), WHITE);
      return;
    }
    case 'cap':
      paint(grid, (x, y) => ellipse(CX, 15, head.half + 2.6, 10.4)(x, y) && y <= 13, shirt);
      paint(
        grid,
        (x, y) => (y === 13 || y === 14) && x >= left - 2 && x <= right + 7,
        shade(shirt, 0.7),
      );
      dots(grid, [[CX, 5]], mix(shirt, WHITE, 0.5));
      return;
    case 'headphones':
      paint(
        grid,
        (x, y) =>
          ellipse(CX, 19.5, head.half + 4, 16.6)(x, y) &&
          !ellipse(CX, 19.5, head.half + 2.6, 15.2)(x, y) &&
          y <= 20,
        '#5d5b66',
      );
      paint(
        grid,
        (x, y) =>
          y >= 20 &&
          y <= 28 &&
          ((x >= left - 4 && x <= left - 1) || (x >= right + 1 && x <= right + 4)),
        '#e25d6a',
      );
      return;
    case 'flower':
      sprite(grid, ['.P.P.', 'PPYPP', '.YYY.', 'PPYPP', '.P.P.'], 33, 5, { P: '#f59fba', Y: GOLD });
      return;
    case 'bow':
      sprite(grid, ['RR...RR', 'RRR.RRR', 'RRRrRRR', 'RRR.RRR', 'RR...RR'], 31, 5, {
        R: '#e5566a',
        r: '#b83a50',
      });
      return;
    case 'earring':
      dots(
        grid,
        [
          [left - 2, 28],
          [left - 2, 29],
          [right + 2, 28],
          [right + 2, 29],
        ],
        GOLD,
      );
      return;
    case 'crown':
      sprite(grid, ['G...G...G...G', 'GG.GGG.GGG.GG', 'GGGGGGGGGGGGG', 'GGGrGGGbGGGrG'], 18, 2, {
        G: GOLD,
        r: '#e5566a',
        b: '#5a9be0',
      });
      return;
    case 'halo':
      paint(
        grid,
        (x, y) => ellipse(CX, 2.6, 9.4, 2.4)(x, y) && !ellipse(CX, 2.6, 6.6, 1.1)(x, y),
        GOLD,
      );
      return;
    case 'catears': {
      const ear = ['X.....', 'XX....', 'XPX...', 'XPPX..', 'XPPPX.', 'XXXXXX'];
      const palette = { X: recipe.hairColor, P: '#f4a3b5' };
      sprite(grid, ear, left + 1, 1, palette);
      sprite(grid, ear, right - 6, 1, palette, true);
      return;
    }
    case 'hairclip':
      sprite(grid, ['C...C', '.C.C.', '..C..', '.C.C.', 'C...C'], right - 10, 10, { C: '#e5566a' });
      dots(
        grid,
        [
          [right - 4, 12],
          [right - 3, 12],
          [right - 2, 12],
        ],
        GOLD,
      );
      return;
    case 'horns': {
      const horn = ['..H', '.HH', 'HHh', 'HHh'];
      const palette = { H: '#5b3a6e', h: '#7d5694' };
      sprite(grid, horn, left + 3, 1, palette);
      sprite(grid, horn, right - 5, 1, palette, true);
      return;
    }
  }
}

const DECOR: Record<Exclude<IllustratedAvatarRecipe['backdrop'], 'none'>, readonly string[][]> = {
  sparkles: [
    ['..X..', '..X..', 'XXXXX', '..X..', '..X..'],
    ['.X.', 'XXX', '.X.'],
  ],
  hearts: [
    ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    ['X.X', 'XXX', '.X.'],
  ],
  stars: [
    ['..X..', '.XXX.', 'XXXXX', '.XXX.', '.X.X.'],
    ['.X.', 'XXX', '.X.'],
  ],
  dots: [['XX', 'XX'], ['X']],
};

const MARKS: Record<(typeof AVATAR_MARKS)[number], { color: string; rows: string[] }> = {
  'thinking-dots': {
    color: '#e8a93a',
    rows: ['.XXX.', 'X...X', '....X', '...X.', '..X..', '..X..', '.....', '..X..'],
  },
  searching: {
    color: '#5a9be0',
    rows: ['.XXX..', 'X...X.', 'X...X.', 'X...X.', '.XXX..', '....X.', '.....X'],
  },
  coding: { color: '#5a9be0', rows: ['..X..', '..X..', '.X.X.', 'X...X', 'X...X', '.XXX.'] },
  executing: { color: '#e8a93a', rows: ['XX', 'XX', 'XX', 'XX', 'XX', '..', 'XX'] },
  'generic-working': { color: '#8a8792', rows: ['XX.XX.XX', 'XX.XX.XX'] },
};

export function illustratedAvatarSvg(recipe: IllustratedAvatarRecipe): string {
  if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const head = HEADS[recipe.head];
  const skin = recipe.skinColor;
  const hair = recipe.hairColor;
  const turned = recipe.pose !== 'front';
  const shift = turned ? -2 : 0;
  const dx = turned ? -4 : 0;
  const left = Math.round(CX - head.half) + shift;
  const right = Math.round(CX - 1 + head.half) + shift;
  const headMask: Mask = (x, y) => head.mask(x - shift, y);

  const tileColor = mix(PAPER, recipe.shirtColor, 0.2);
  const tile = blank();
  paint(tile, inTile, tileColor);
  if (recipe.backdrop !== 'none') {
    const [big, small] = DECOR[recipe.backdrop];
    const color =
      recipe.backdrop === 'hearts'
        ? '#f39bb0'
        : recipe.backdrop === 'stars'
          ? '#f4c95d'
          : recipe.backdrop === 'dots'
            ? shade(tileColor, 0.88)
            : mix(tileColor, WHITE, 0.75);
    sprite(tile, big!, 4, 6, { X: color });
    sprite(tile, small!, 5, 30, { X: color });
    sprite(tile, big!, 40, 24, { X: color });
    sprite(tile, small!, 12, 2, { X: color });
  }

  const body = blank();
  const torso = (x: number, y: number) =>
    y >= 39 && Math.abs(x + 0.5 - CX - shift / 2) <= 11 + (y - 39) * 2.4;
  paint(body, torso, recipe.shirtColor);
  paint(
    body,
    (x, y) => torso(x, y) && y <= 41 && Math.abs(x + 0.5 - CX - shift / 2) > 8 + (y - 39) * 2.4,
    shade(recipe.shirtColor, 0.84),
  );
  paint(
    body,
    (x, y) => y >= head.chin - 1 && y <= 41 && x >= 21 + shift / 2 && x <= 26 + shift / 2,
    shade(skin, 0.86),
  );
  paint(
    body,
    (x, y) => y >= 39 && y <= 41 && Math.abs(x + 0.5 - CX - shift / 2) <= 3 - (y - 39),
    shade(skin, 0.8),
  );

  const masks = hairMasks(recipe, left, right);
  const base = blank();
  paint(base, masks.back, shade(hair, 0.86));
  if (masks.bands) paint(base, masks.bands, shade(hair, 0.7));
  const ears: Point[] = [];
  for (let y = 23; y <= 26; y++) {
    if (!turned) ears.push([left - 2, y], [left - 1, y]);
    ears.push([right + 1, y], [right + 2, y]);
  }
  dots(base, ears, skin);
  dots(
    base,
    [
      [right + 1, 24],
      [right + 1, 25],
    ],
    shade(skin, 0.84),
  );
  paint(base, headMask, skin);
  if (turned) {
    const noseRow = head.mouth - 3;
    const edge = [...Array(SIZE).keys()].find((x) => base[noseRow]![x] === skin);
    if (edge !== undefined)
      dots(
        base,
        [
          [edge - 1, noseRow],
          [edge - 1, noseRow - 1],
        ],
        skin,
      );
  }
  paint(base, masks.front, hair);
  if (turned)
    paint(base, (x, y) => masks.front(x, 12) && x <= left + 3 && y <= 30 && headMask(x, y), hair);
  const edgeShade = shade(hair, 0.72);
  for (let y = SIZE - 1; y > 0; y--)
    for (let x = 0; x < SIZE; x++)
      if (base[y]![x] === skin && (base[y - 1]![x] === hair || base[y - 1]![x] === edgeShade))
        base[y]![x] = shade(skin, 0.88);
  for (let y = 0; y < SIZE - 1; y++)
    for (let x = 0; x < SIZE; x++)
      if (base[y]![x] === hair && base[y + 1]![x] !== hair) base[y]![x] = edgeShade;
  if (masks.strands)
    for (let x = left; x <= right; x++)
      if (lock(x) === 0)
        for (let y = 12; y <= 17; y++) if (base[y]![x] === hair) base[y]![x] = shade(hair, 0.82);
  const highlight = mix(hair, WHITE, 0.35);
  for (let x = left + 4; x <= left + 13; x++) {
    const y = [...Array(SIZE).keys()].find((row) => base[row]![x] === hair);
    if (y === undefined) continue;
    if (base[y + 2]?.[x] === hair) base[y + 2]![x] = highlight;
    if (x % 2 === 0 && base[y + 3]?.[x] === hair) base[y + 3]![x] = highlight;
  }
  if (masks.ties) dots(base, masks.ties, shade(recipe.shirtColor, 0.8));
  accessory(recipe, base, left, right);

  const face = blank();
  const my = head.mouth;
  const lx = EYE_X[0] + dx;
  const rx = EYE_X[1] + dx;
  const cx = CX + dx;
  const far = (rows: readonly string[]) => (turned ? rows.map((row) => row.slice(1)) : rows);
  const farShift = turned ? 1 : 0;
  const brow = { B: shade(hair, 0.6) };
  const brows = BROWS[recipe.brows];
  if (brows.length) {
    sprite(face, far(brows), lx + farShift, EYE_TOP - 4, brow);
    sprite(face, brows, rx, EYE_TOP - 4, brow, true);
  }
  if (recipe.nose === 'dot') dots(face, [[cx, my - 3]], shade(skin, 0.74));
  if (recipe.nose === 'button')
    dots(
      face,
      [
        [cx - 1, my - 3],
        [cx, my - 3],
      ],
      shade(skin, 0.82),
    );
  if (recipe.nose === 'line')
    dots(
      face,
      [
        [cx, my - 5],
        [cx, my - 4],
        [cx - 1, my - 3],
      ],
      shade(skin, 0.68),
    );
  const mouth = MOUTHS[recipe.mouth];
  sprite(face, mouth, cx - Math.floor(mouth[0]!.length / 2), my, {
    K: MOUTH,
    W: WHITE,
    M: MOUTH_INSIDE,
    T: TONGUE,
  });
  const cheekY = my - 2;
  if (recipe.cheeks === 'blush') {
    const blush = (x0: number, width: number) => {
      paint(face, (x, y) => y === cheekY && x >= x0 && x < x0 + width, BLUSH);
      paint(
        face,
        (x, y) => y === cheekY + 1 && x > x0 && x < x0 + width - 1,
        mix(BLUSH, skin, 0.4),
      );
    };
    blush(lx + farShift, turned ? 2 : 3);
    blush(rx + 2, 3);
  }
  if (recipe.cheeks === 'freckles')
    dots(
      face,
      [
        [lx + 1 + farShift, cheekY],
        [lx + 3, cheekY + 1],
        [rx + 1, cheekY + 1],
        [rx + 3, cheekY],
        [rx + 4, cheekY + 1],
      ],
      shade(skin, 0.68),
    );

  const palette = {
    K: INK,
    W: WHITE,
    D: shade(recipe.eyeColor, 0.6),
    I: recipe.eyeColor,
    L: mix(recipe.eyeColor, WHITE, 0.35),
  };
  const style = EYES[recipe.eyes];
  const eyes = blank();
  sprite(eyes, far(style), lx + 5 - style[0]!.length + farShift, EYE_TOP, palette);
  sprite(eyes, recipe.eyes === 'wink' ? CLOSED : style, rx, EYE_TOP, palette, true);
  const closed = blank();
  sprite(closed, far(CLOSED), lx + farShift, EYE_TOP, palette);
  sprite(closed, CLOSED, rx, EYE_TOP, palette, true);

  const glasses = blank();
  const farX = lx + farShift;
  const farWidth = turned ? 4 : 5;
  const frame = (fx: number, round: boolean, width = 5) =>
    paint(
      glasses,
      (x, y) => {
        const inside = x >= fx && x < fx + width && y >= EYE_TOP && y <= EYE_TOP + 5;
        const box = x >= fx - 1 && x <= fx + width && y >= EYE_TOP - 1 && y <= EYE_TOP + 6;
        const corner =
          (x === fx - 1 || x === fx + width) && (y === EYE_TOP - 1 || y === EYE_TOP + 6);
        return box && !inside && !(round && corner);
      },
      INK,
    );
  const bridge = () =>
    paint(glasses, (x, y) => y === EYE_TOP + 1 && x > farX + farWidth && x < rx - 1, INK);
  if (recipe.glasses === 'round' || recipe.glasses === 'square') {
    frame(farX, recipe.glasses === 'round', farWidth);
    frame(rx, recipe.glasses === 'round');
    bridge();
  }
  if (recipe.glasses === 'shades') {
    for (const [fx, width] of [
      [farX, farWidth],
      [rx, 5],
    ] as const)
      paint(
        glasses,
        (x, y) => x >= fx - 1 && x <= fx + width && y >= EYE_TOP && y <= EYE_TOP + 4,
        INK,
      );
    bridge();
    dots(
      glasses,
      [
        [farX, EYE_TOP + 1],
        [farX + 1, EYE_TOP + 1],
        [rx, EYE_TOP + 1],
        [rx + 1, EYE_TOP + 1],
      ],
      '#7d7b88',
    );
  }
  if (recipe.glasses === 'monocle') {
    frame(rx, true);
    dots(
      glasses,
      [
        [rx + 5, EYE_TOP + 7],
        [rx + 5, EYE_TOP + 8],
        [rx + 5, EYE_TOP + 9],
        [rx + 5, EYE_TOP + 10],
      ],
      GOLD,
    );
  }

  const facing = (grid: Grid): Grid =>
    recipe.pose === 'right' ? grid.map((row) => [...row].reverse()) : grid;
  const marks = AVATAR_MARKS.map((mark) => {
    const grid = blank();
    sprite(grid, MARKS[mark].rows, 38, 4, { X: MARKS[mark].color });
    return `<g data-avatar-mark="${mark}" opacity="0">${rects(grid)}</g>`;
  }).join('');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="512" height="512" shape-rendering="crispEdges" aria-hidden="true">`,
    rects(tile),
    `<g class="bh-illustrated-body">${rects(facing(clip(outline(body))))}</g>`,
    `<g class="bh-illustrated-head">${rects(facing(clip(outline(base))))}`,
    `<g class="bh-illustrated-face">${rects(facing(face))}`,
    `<g class="bh-illustrated-gaze">${rects(facing(eyes))}</g>`,
    `<g class="bh-illustrated-blink" opacity="0">${rects(facing(closed))}</g>`,
    `${rects(facing(glasses))}</g></g>`,
    `<g class="bh-illustrated-marks">${marks}</g>`,
    '</svg>',
  ].join('');
}
