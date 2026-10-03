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
export const AVATAR_COLORS = ['skinColor', 'hairColor', 'shirtColor'] as const;
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
  hairColor: '#4a3428',
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
const INK = '#1d1b22';
const WHITE = '#ffffff';
const PAPER = '#eceae6';
const BLUSH = '#f2899b';
const TONGUE = '#e2566c';
const GOLD = '#e8b23a';

type Cell = string | undefined;
type Grid = Cell[][];
type Point = readonly [number, number];

const blank = (): Grid => Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(undefined));
const ellipse = (cx: number, cy: number, rx: number, ry: number) => (x: number, y: number) =>
  ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1;

function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `#${[16, 8, 0]
    .map((bit) =>
      Math.min(255, Math.round(((n >> bit) & 255) * k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

function mix(base: string, tint: string, k: number): string {
  const channel = (hex: string, bit: number) => (Number.parseInt(hex.slice(1), 16) >> bit) & 255;
  return `#${[16, 8, 0]
    .map((bit) =>
      Math.round(channel(base, bit) * (1 - k) + channel(tint, bit) * k)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const TILE_RADIUS = 6;
const inTile = (x: number, y: number) => {
  const clamp = (v: number) => Math.min(Math.max(v, TILE_RADIUS), SIZE - TILE_RADIUS);
  const cx = x + 0.5;
  const cy = y + 0.5;
  return (cx - clamp(cx)) ** 2 + (cy - clamp(cy)) ** 2 <= TILE_RADIUS ** 2;
};

function clip(grid: Grid): Grid {
  return grid.map((row, y) => row.map((cell, x) => (inTile(x, y) ? cell : undefined)));
}

function paint(grid: Grid, test: (x: number, y: number) => boolean, color: string): void {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (test(x, y)) grid[y]![x] = color;
}

function dots(grid: Grid, points: readonly Point[], color: string): void {
  for (const [x, y] of points) if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) grid[y]![x] = color;
}

function outline(grid: Grid): Grid {
  const out = grid.map((row) => [...row]);
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++)
      if (
        !grid[y]![x] &&
        [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ].some(([dx, dy]) => grid[y + dy!]?.[x + dx!])
      )
        out[y]![x] = INK;
  return out;
}

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

const mirror = (points: readonly Point[]): Point[] => points.map(([x, y]) => [1 - x, y]);
const at = (points: readonly Point[], ox: number, oy: number): Point[] =>
  points.map(([x, y]) => [x + ox, y + oy]);

const HEADS = {
  round: { test: ellipse(16, 15, 7.6, 7.8), half: 7.6, top: 7, chin: 22, mouth: 19 },
  oval: { test: ellipse(16, 15.5, 7, 8.5), half: 7, top: 7, chin: 23, mouth: 20 },
  square: {
    test: (x: number, y: number) =>
      x >= 9 &&
      x <= 22 &&
      y >= 8 &&
      y <= 22 &&
      !((x === 9 || x === 22) && (y === 8 || y === 22)) &&
      !((x <= 10 || x >= 21) && y === 22),
    half: 7,
    top: 8,
    chin: 22,
    mouth: 19,
  },
  long: { test: ellipse(16, 15.5, 6.6, 9), half: 6.6, top: 7, chin: 24, mouth: 20 },
} as const;

const EYE_Y = 15;
const EYE_X = [11, 19] as const;

const EYES: Record<IllustratedAvatarRecipe['eyes'], { ink: Point[]; light?: Point[] }> = {
  round: {
    ink: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
    light: [[0, 0]],
  },
  dot: {
    ink: [
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
  },
  sparkle: {
    ink: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
      [-1, 1],
      [-1, 2],
    ],
    light: [
      [0, 0],
      [1, 2],
    ],
  },
  lashes: {
    ink: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
      [-1, -1],
      [-1, 0],
    ],
    light: [[1, 0]],
  },
  sleepy: {
    ink: [
      [-1, 1],
      [0, 1],
      [1, 1],
      [2, 1],
      [0, 2],
      [1, 2],
    ],
  },
  happy: {
    ink: [
      [-1, 2],
      [0, 1],
      [1, 1],
      [2, 2],
    ],
  },
  wink: {
    ink: [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
    ],
    light: [[0, 0]],
  },
  sharp: {
    ink: [
      [-1, 0],
      [0, 1],
      [1, 1],
      [0, 2],
      [1, 2],
      [2, 1],
    ],
  },
};

const CLOSED: Point[] = [
  [-1, 2],
  [0, 2],
  [1, 2],
  [2, 2],
];

const BROWS: Record<IllustratedAvatarRecipe['brows'], Point[]> = {
  soft: [
    [0, 0],
    [1, 0],
  ],
  thick: [
    [-1, 0],
    [0, 0],
    [1, 0],
    [2, 0],
    [0, -1],
    [1, -1],
  ],
  raised: [
    [-1, 0],
    [0, -1],
    [1, -1],
    [2, 0],
  ],
  angry: [
    [-1, -1],
    [0, -1],
    [1, 0],
    [2, 0],
  ],
  worried: [
    [-1, 0],
    [0, 0],
    [1, -1],
    [2, -1],
  ],
  none: [],
};

function hairMask(recipe: IllustratedAvatarRecipe): {
  back: (x: number, y: number) => boolean;
  front: (x: number, y: number) => boolean;
} {
  const head = HEADS[recipe.head];
  const left = Math.round(16 - head.half);
  const right = Math.round(15 + head.half);
  const cap = ellipse(16, 14, head.half + 1.2, 8.6);
  const crown = (y: number, x: number) => cap(x, y);
  const none = () => false;
  switch (recipe.hair) {
    case 'none':
      return { back: none, front: none };
    case 'buzz':
      return { back: none, front: (x, y) => crown(y, x) && y <= 9 };
    case 'crop':
      return {
        back: none,
        front: (x, y) =>
          crown(y, x) &&
          (y <= 9 || (y === 10 && x % 2 === 0) || (y <= 12 && (x <= left + 1 || x >= right - 1))),
      };
    case 'sweep':
      return {
        back: none,
        front: (x, y) =>
          crown(y, x) &&
          (y <= 9 ||
            (y <= 12 && x >= 10 + (y - 9) * 3 && x < 17 + (12 - y) * 2) ||
            (y <= 13 && (x <= left + 1 || x >= right - 1))),
      };
    case 'spiky':
      return {
        back: none,
        front: (x, y) => {
          const peak = (x - left) % 3 === 1 ? 3 : (x - left) % 3 === 0 ? 4 : 5;
          return (
            x >= left - 1 &&
            x <= right + 1 &&
            y >= peak &&
            (y <= 9 || (y <= 11 && (x <= left + 1 || x >= right - 1)))
          );
        },
      };
    case 'curly': {
      const bumps: Point[] = [
        [9, 9],
        [11, 6],
        [14, 5],
        [18, 5],
        [21, 6],
        [23, 9],
        [8, 12],
        [24, 12],
      ];
      return {
        back: none,
        front: (x, y) =>
          (crown(y, x) && y <= 9) || bumps.some(([bx, by]) => (x - bx) ** 2 + (y - by) ** 2 <= 4.4),
      };
    }
    case 'mohawk':
      return { back: none, front: (x, y) => x >= 14 && x <= 17 && y >= 2 && y <= 9 };
    case 'bob':
      return {
        back: (x, y) => ellipse(16, 14, head.half + 2.4, 9)(x, y) && y <= 21,
        front: (x, y) =>
          crown(y, x) && (y <= 10 || (y === 11 && x >= 18) || x <= left + 1 || x >= right - 1),
      };
    case 'long':
      return {
        back: (x, y) =>
          (ellipse(16, 14, head.half + 2.2, 9)(x, y) && y <= 16) ||
          (y > 15 &&
            y <= 27 &&
            x >= left - 2 &&
            x <= right + 2 &&
            (x <= left + 1 || x >= right - 1)),
        front: (x, y) =>
          crown(y, x) &&
          (y <= 9 || (y <= 12 && x < 15 - (y - 9)) || x <= left + 1 || x >= right - 1),
      };
    case 'bun':
      return {
        back: none,
        front: (x, y) => (crown(y, x) && y <= 9) || ellipse(16, 4, 3.2, 2.8)(x, y),
      };
    case 'pigtails':
      return {
        back: (x, y) =>
          ellipse(left - 2.5, 15, 2.8, 3.6)(x, y) || ellipse(right + 3.5, 15, 2.8, 3.6)(x, y),
        front: (x, y) => crown(y, x) && (y <= 9 || (y <= 11 && (x <= left + 1 || x >= right - 1))),
      };
    case 'afro':
      return {
        back: ellipse(16, 12.5, head.half + 5, 10.5),
        front: (x, y) => crown(y, x) && y <= 9,
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
      paint(grid, (x, y) => ellipse(16, 10, head.half + 1.6, 7)(x, y) && y <= 8, shirt);
      paint(grid, (x, y) => y === 9 && x >= left - 1 && x <= right + 1, shade(shirt, 0.78));
      dots(
        grid,
        [
          [15, 2],
          [16, 2],
          [15, 1],
          [16, 1],
        ],
        WHITE,
      );
      return;
    case 'cap':
      paint(grid, (x, y) => ellipse(16, 10, head.half + 1.4, 6.4)(x, y) && y <= 8, shirt);
      paint(grid, (x, y) => y === 9 && x >= left - 1 && x <= right + 4, shade(shirt, 0.7));
      return;
    case 'headphones':
      paint(
        grid,
        (x, y) =>
          ellipse(16, 13, head.half + 2.4, 9.4)(x, y) &&
          !ellipse(16, 13, head.half + 1.4, 8.4)(x, y) &&
          y <= 13,
        '#55545c',
      );
      paint(
        grid,
        (x, y) =>
          y >= 13 &&
          y <= 17 &&
          (x === left - 2 || x === left - 1 || x === right + 1 || x === right + 2),
        '#e2565f',
      );
      return;
    case 'flower':
      dots(
        grid,
        [
          [22, 5],
          [24, 5],
          [23, 4],
          [23, 6],
        ],
        '#f48fb1',
      );
      dots(grid, [[23, 5]], GOLD);
      return;
    case 'bow':
      dots(
        grid,
        [
          [20, 5],
          [20, 6],
          [20, 7],
          [21, 6],
          [22, 6],
          [23, 6],
          [24, 5],
          [24, 6],
          [24, 7],
          [21, 5],
          [21, 7],
          [23, 5],
          [23, 7],
        ],
        '#e2565f',
      );
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
      dots(
        grid,
        [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((x) => [x, 6] as Point),
        GOLD,
      );
      dots(
        grid,
        [
          [11, 5],
          [11, 4],
          [14, 5],
          [14, 4],
          [17, 5],
          [17, 4],
          [20, 5],
          [20, 4],
          [15, 5],
          [16, 5],
        ],
        GOLD,
      );
      return;
    case 'halo':
      paint(
        grid,
        (x, y) => ellipse(16, 2.5, 6, 1.6)(x, y) && !ellipse(16, 2.5, 4, 0.8)(x, y),
        GOLD,
      );
      return;
  }
}

const MARKS: Record<(typeof AVATAR_MARKS)[number], { color: string; points: Point[] }> = {
  'thinking-dots': {
    color: '#e8a93a',
    points: [
      [26, 3],
      [27, 2],
      [28, 2],
      [29, 3],
      [29, 4],
      [28, 5],
      [28, 6],
      [28, 8],
    ],
  },
  searching: {
    color: '#5a9be0',
    points: [
      [26, 3],
      [27, 2],
      [28, 2],
      [29, 3],
      [29, 4],
      [28, 5],
      [27, 5],
      [26, 4],
      [29, 6],
      [30, 7],
    ],
  },
  coding: {
    color: '#5a9be0',
    points: [
      [27, 3],
      [27, 4],
      [26, 5],
      [28, 5],
      [27, 6],
    ],
  },
  executing: {
    color: '#e8a93a',
    points: [
      [27, 1],
      [27, 2],
      [27, 3],
      [27, 4],
      [27, 6],
      [26, 3],
      [28, 3],
    ],
  },
  'generic-working': {
    color: '#8a8792',
    points: [
      [24, 4],
      [26, 4],
      [28, 4],
    ],
  },
};

export function illustratedAvatarSvg(recipe: IllustratedAvatarRecipe): string {
  if (!isIllustratedAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const head = HEADS[recipe.head];
  const skin = recipe.skinColor;
  const hair = recipe.hairColor;
  const left = Math.round(16 - head.half);
  const right = Math.round(15 + head.half);

  const body = blank();
  paint(body, (x, y) => y >= 25 && Math.abs(x + 0.5 - 16) <= 8 + (y - 25) * 1.6, recipe.shirtColor);
  paint(body, (x, y) => y >= head.chin - 1 && y <= 25 && x >= 14 && x <= 17, shade(skin, 0.86));
  dots(
    body,
    [
      [15, 25],
      [16, 25],
      [15, 26],
      [16, 26],
    ],
    shade(skin, 0.86),
  );

  const masks = hairMask(recipe);
  const base = blank();
  paint(base, masks.back, hair);
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
  paint(base, head.test, skin);
  paint(base, masks.front, hair);
  for (let y = SIZE - 1; y > 0; y--)
    for (let x = 0; x < SIZE; x++)
      if (base[y]![x] === skin && base[y - 1]![x] === hair) base[y]![x] = shade(skin, 0.88);
  for (let y = 0; y < SIZE - 1; y++)
    for (let x = 0; x < SIZE; x++)
      if (base[y]![x] === hair && base[y + 1]![x] !== hair) base[y]![x] = shade(hair, 0.72);
  accessory(recipe, base);

  const face = blank();
  const my = head.mouth;
  const [lx, rx] = EYE_X;
  if (recipe.brows !== 'none') {
    dots(face, at(BROWS[recipe.brows], lx, EYE_Y - 3), INK);
    dots(face, at(mirror(BROWS[recipe.brows]), rx, EYE_Y - 3), INK);
  }
  if (recipe.nose === 'dot') dots(face, [[16, EYE_Y + 3]], shade(skin, 0.72));
  if (recipe.nose === 'button')
    dots(
      face,
      [
        [15, EYE_Y + 3],
        [16, EYE_Y + 3],
      ],
      shade(skin, 0.8),
    );
  if (recipe.nose === 'line')
    dots(
      face,
      [
        [16, EYE_Y + 2],
        [16, EYE_Y + 3],
        [15, EYE_Y + 3],
      ],
      shade(skin, 0.62),
    );
  const mouth: Record<IllustratedAvatarRecipe['mouth'], [Point[], Point[]?]> = {
    smile: [
      [
        [14, my],
        [15, my + 1],
        [16, my + 1],
        [17, my],
      ],
    ],
    grin: [
      [
        [13, my - 1],
        [18, my - 1],
        [14, my + 1],
        [15, my + 1],
        [16, my + 1],
        [17, my + 1],
      ],
      [
        [14, my],
        [15, my],
        [16, my],
        [17, my],
      ],
    ],
    open: [
      [
        [14, my],
        [15, my],
        [16, my],
        [17, my],
        [14, my + 1],
        [17, my + 1],
        [15, my + 2],
        [16, my + 2],
      ],
      [
        [15, my + 1],
        [16, my + 1],
      ],
    ],
    flat: [
      [
        [14, my],
        [15, my],
        [16, my],
        [17, my],
      ],
    ],
    smirk: [
      [
        [14, my],
        [15, my],
        [16, my],
        [17, my - 1],
      ],
    ],
    cat: [
      [
        [13, my],
        [14, my + 1],
        [15, my],
        [16, my],
        [17, my + 1],
        [18, my],
      ],
    ],
    tongue: [
      [
        [14, my],
        [15, my + 1],
        [16, my + 1],
        [17, my],
      ],
      [
        [16, my + 2],
        [17, my + 2],
      ],
    ],
    o: [
      [
        [15, my],
        [16, my],
        [14, my + 1],
        [17, my + 1],
        [15, my + 2],
        [16, my + 2],
      ],
    ],
  };
  const [lips, inner] = mouth[recipe.mouth];
  dots(face, lips, INK);
  if (inner) dots(face, inner, recipe.mouth === 'grin' ? WHITE : TONGUE);
  if (recipe.cheeks === 'blush')
    dots(
      face,
      [
        [left + 1, my - 2],
        [left + 2, my - 2],
        [right - 2, my - 2],
        [right - 1, my - 2],
      ],
      BLUSH,
    );
  if (recipe.cheeks === 'freckles')
    dots(
      face,
      [
        [left + 1, my - 2],
        [left + 3, my - 1],
        [right - 3, my - 1],
        [right - 1, my - 2],
      ],
      shade(skin, 0.66),
    );

  const eyes = blank();
  const style = EYES[recipe.eyes];
  dots(eyes, at(style.ink, lx, EYE_Y - 1), INK);
  dots(eyes, at(recipe.eyes === 'wink' ? mirror(CLOSED) : mirror(style.ink), rx, EYE_Y - 1), INK);
  if (style.light) {
    dots(eyes, at(style.light, lx, EYE_Y - 1), WHITE);
    if (recipe.eyes !== 'wink') dots(eyes, at(mirror(style.light), rx, EYE_Y - 1), WHITE);
  }
  const closed = blank();
  dots(closed, at(CLOSED, lx, EYE_Y - 1), INK);
  dots(closed, at(mirror(CLOSED), rx, EYE_Y - 1), INK);

  const glasses = blank();
  const frame = (cx: number, round: boolean) => {
    for (let x = cx - 1; x <= cx + 2; x++)
      if (!round || (x !== cx - 1 && x !== cx + 2))
        dots(
          glasses,
          [
            [x, EYE_Y - 2],
            [x, EYE_Y + 2],
          ],
          INK,
        );
    for (let y = EYE_Y - 1; y <= EYE_Y + 1; y++)
      dots(
        glasses,
        [
          [cx - (round ? 2 : 1), y],
          [cx + (round ? 3 : 2), y],
        ],
        INK,
      );
  };
  if (recipe.glasses === 'round' || recipe.glasses === 'square') {
    const round = recipe.glasses === 'round';
    frame(lx, round);
    frame(rx, round);
    for (let x = lx + (round ? 4 : 3); x <= rx - (round ? 3 : 2); x++)
      dots(glasses, [[x, EYE_Y - 1]], INK);
  }
  if (recipe.glasses === 'shades') {
    for (const cx of EYE_X)
      paint(glasses, (x, y) => x >= cx - 1 && x <= cx + 2 && y >= EYE_Y - 1 && y <= EYE_Y + 1, INK);
    dots(
      glasses,
      [
        [lx, EYE_Y - 1],
        [rx, EYE_Y - 1],
      ],
      '#6b6a74',
    );
    dots(
      glasses,
      [
        [14, EYE_Y - 1],
        [15, EYE_Y - 1],
        [16, EYE_Y - 1],
        [17, EYE_Y - 1],
      ],
      INK,
    );
  }
  if (recipe.glasses === 'monocle') {
    frame(rx, true);
    dots(
      glasses,
      [
        [rx + 3, EYE_Y + 2],
        [rx + 3, EYE_Y + 3],
        [rx + 3, EYE_Y + 4],
      ],
      GOLD,
    );
  }

  const tile = blank();
  paint(tile, inTile, mix(PAPER, recipe.shirtColor, 0.16));

  const marks = AVATAR_MARKS.map((mark) => {
    const grid = blank();
    dots(grid, MARKS[mark].points, MARKS[mark].color);
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
