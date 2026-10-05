import type { IllustratedAvatarRecipe } from './avatar-appearance.js';
import type { PixelCell } from './avatar-pixel-symbols.js';

type Cell = string | undefined;
type Grid = Cell[][];
type Mask = (x: number, y: number) => boolean;
type Point = readonly [number, number];

const N = 32;
const C = 16;
const INK = '#2a2230';
const WHITE = '#ffffff';
const BLUSH = '#f4879a';
const MOUTH = '#7a2a38';
const MOUTH_INSIDE = '#b8415a';
const TONGUE = '#ef6f84';
const GOLD = '#efb93f';

export type PixelGrid = Grid;
const blank = (): Grid => Array.from({ length: N }, () => Array<Cell>(N).fill(undefined));
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
function paint(grid: Grid, test: Mask, color: string): void {
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (test(x, y)) grid[y]![x] = color;
}
function sprite(
  grid: Grid,
  rows: readonly string[],
  ox: number,
  oy: number,
  pal: Record<string, string>,
  flip = false,
): void {
  rows.forEach((row, y) =>
    [...row].forEach((code, i) => {
      const c = pal[code];
      const x = ox + (flip ? row.length - 1 - i : i);
      if (c && x >= 0 && x < N && oy + y >= 0 && oy + y < N) grid[oy + y]![x] = c;
    }),
  );
}
function outline(grid: Grid): Grid {
  const out = grid.map((row) => [...row]);
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      if (grid[y]![x]) continue;
      const n = [grid[y]?.[x - 1], grid[y]?.[x + 1], grid[y - 1]?.[x], grid[y + 1]?.[x]].find(
        Boolean,
      );
      if (n) out[y]![x] = mix(shade(n, 0.3), INK, 0.62);
    }
  return out;
}
const R = 6;
const inTile: Mask = (x, y) => {
  const clamp = (v: number) => Math.min(Math.max(v, R), N - R);
  return (x + 0.5 - clamp(x + 0.5)) ** 2 + (y + 0.5 - clamp(y + 0.5)) ** 2 <= R * R;
};
const clip = (g: Grid): Grid =>
  g.map((row, y) => row.map((c, x) => (inTile(x, y) ? c : undefined)));
function rects(grid: Grid): string {
  let m = '';
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const c = grid[y]![x];
      if (!c) {
        x++;
        continue;
      }
      let w = 1;
      while (x + w < N && grid[y]![x + w] === c) w++;
      m += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
      x += w;
    }
  }
  return m;
}

type Recipe = IllustratedAvatarRecipe;

const FACE: Record<Recipe['head'], (s: number) => Mask> = {
  round: (s) => ellipse(C + s, 16.6, 8.6, 7.6),
  oval: (s) => ellipse(C + s, 16.6, 8, 8),
  chubby: (s) => ellipse(C + s, 17, 9.4, 7.2),
  long: (s) => ellipse(C + s, 16.6, 7.8, 8.4),
  square: (s) => (x, y) => {
    if (y < 8 || y > 23) return false;
    const dx = Math.abs(x + 0.5 - C - s);
    const r = 3;
    if (y <= 20) return dx <= 8.5;
    return dx <= 8.5 - (y - 20) ** 1.3 * 1.1 + 0.3 - (y === 23 ? 1 : 0) || dx <= 8.5 - r;
  },
  heart: (s) => taper(ellipse(C + s, 15.8, 9, 7.4), 16.5, 9, 2.6, 24.4, s),
  vchin: (s) => taper(ellipse(C + s, 15.8, 8.6, 7.4), 17.5, 8.6, 2.2, 24.4, s),
  diamond: (s) =>
    taper(
      (x, y) => y >= 9 && Math.abs(x + 0.5 - C - s) <= 6.4 + (y - 9) * 0.45,
      15.8,
      9.2,
      2.6,
      24.4,
      s,
    ),
};
function taper(top: Mask, from: number, width: number, end: number, chin: number, s: number): Mask {
  return (x, y) => {
    const cy = y + 0.5;
    if (cy <= from) return top(x, y);
    if (cy > chin) return false;
    const t = (cy - from) / (chin - from);
    return Math.abs(x + 0.5 - C - s) <= width - (width - end) * t ** 1.5;
  };
}

const EYES: Record<Recipe['eyes'], readonly string[]> = {
  round: ['KKKK', 'DWDD', 'IDDI', 'LIIL'],
  dot: ['....', '.KK.', '.KK.', '....'],
  sparkle: ['KKKK', 'DWDW', 'IDDI', 'LIWL'],
  lashes: ['KKKKK', 'K.DWD', '..IDD', '..LII'],
  sleepy: ['....', 'KKKK', 'IDDI', 'LIIL'],
  happy: ['....', '.KK.', 'K..K', '....'],
  wink: ['KKKK', 'DWDD', 'IDDI', 'LIIL'],
  sharp: ['KK..', '.KKK', '.DWD', '..LI'],
};
const CLOSED = ['....', '....', 'KKKK', '....'];
const BROWS: Record<Recipe['brows'], readonly string[]> = {
  soft: ['.BBB'],
  thick: ['BBBB'],
  raised: ['.BB.'],
  angry: ['BB..', '..BB'],
  worried: ['..BB', 'BB..'],
  none: [],
};
const MOUTHS: Record<Recipe['mouth'], readonly string[]> = {
  smile: ['K..K', '.KK.'],
  grin: ['KWWK', '.KK.'],
  open: ['KKK', 'MTM'],
  flat: ['.KK.'],
  smirk: ['...K', '.KK.'],
  cat: ['K.K.K', '.K.K.'],
  tongue: ['KKKK', '.TT.'],
  o: ['.K.', 'KMK', '.K.'],
};

function hair(
  recipe: Recipe,
  s: number,
  b: number,
): { back: Mask; front: Mask; ties?: Point[]; bands?: boolean } {
  const none: Mask = () => false;
  const cap = ellipse(C + s, 14, 11, 10.6);
  const tip = (x: number, depth = 1) => [0, depth, depth + 1, depth][(x + 40 - s) % 4]!;
  const bangs =
    (line: number, depth = 1, sides = 22): Mask =>
    (x, y) => {
      if (!cap(x, Math.min(y, 13))) return false;
      const dx = x + 0.5 - C - s;
      if (Math.abs(dx) >= 7) return y <= sides - [0, 1, 0, 2][(x + 40 - s) % 4]!;
      return y <= line + tip(x, depth) - (Math.abs(dx) > 6 ? 0 : 0);
    };
  const longBack =
    (bottom: number, width = 11.4): Mask =>
    (x, y) =>
      (ellipse(C + b, 14, width + 0.4, 11)(x, y) && y <= 16) ||
      (y > 15 && y <= bottom && Math.abs(x + 0.5 - C - b) <= width - (y > bottom - 2 ? 1 : 0));
  switch (recipe.hair) {
    case 'none':
      return { back: none, front: none };
    case 'buzz':
      return { back: none, front: (x, y) => cap(x, y) && y <= 7 };
    case 'crop':
      return { back: none, front: bangs(10, 1, 15) };
    case 'sweep':
      return {
        back: none,
        front: (x, y) =>
          cap(x, Math.min(y, 13)) &&
          (y <= 9 + Math.max(0, (x - 6 - s) * 0.45) || (Math.abs(x + 0.5 - C - s) >= 7 && y <= 16)),
      };
    case 'spiky':
      return {
        back: none,
        front: (x, y) =>
          cap(x, Math.max(y, 6)) &&
          y >= [1, 3, 5, 3][(x + 40 - s) % 4]! &&
          bangs(11, 2, 15)(x, Math.max(y, 6)),
      };
    case 'curly': {
      const bumps: Point[] = Array.from({ length: 9 }, (_, i) => {
        const a = Math.PI * (1.02 + (i * 0.96) / 8);
        return [C + s + 11.5 * Math.cos(a), 14 + 11 * Math.sin(a)] as Point;
      });
      return {
        back: none,
        front: (x, y) =>
          bangs(11, 1, 18)(x, y) ||
          (y <= 18 && bumps.some(([bx, by]) => (x + 0.5 - bx) ** 2 + (y + 0.5 - by) ** 2 <= 6.5)),
      };
    }
    case 'mohawk':
      return { back: none, front: (x, y) => Math.abs(x + 0.5 - C - s) <= 2 && y >= 1 && y <= 9 };
    case 'bob':
      return { back: longBack(25), front: bangs(13, 1, 24) };
    case 'long':
      return { back: longBack(31), front: bangs(13, 1, 26) };
    case 'bun':
      return {
        back: none,
        front: (x, y) => bangs(12, 1, 18)(x, y) || ellipse(C + s, 2.6, 4, 2.6)(x, y),
      };
    case 'pigtails':
      return {
        back: (x, y) =>
          ellipse(C + s - 11.5, 21, 3, 4.4)(x, y) || ellipse(C + s + 11.5, 21, 3, 4.4)(x, y),
        front: bangs(13, 1, 21),
        ties: [
          [C + s - 12, 16],
          [C + s + 11, 16],
        ],
      };
    case 'afro':
      return { back: ellipse(C + b, 12, 15, 11.5), front: (x, y) => cap(x, y) && y <= 8 };
    case 'twintails':
    case 'drills':
      return {
        back: (x, y) =>
          y >= 8 &&
          (ellipse(C + s - 13.2, 20, 2.3, 12)(x, y) || ellipse(C + s + 13.2, 20, 2.3, 12)(x, y)),
        front: bangs(13, 1, 24),
        ties: [
          [C + s - 13, 9],
          [C + s - 12, 9],
          [C + s + 11, 9],
          [C + s + 12, 9],
        ],
        bands: recipe.hair === 'drills',
      };
    case 'ponytail':
      return {
        back: (x, y) => ellipse(C + s + 11.5, 19, 3, 9)(x, y) && y >= 8,
        front: bangs(12, 1, 20),
        ties: [
          [C + s + 10, 9],
          [C + s + 11, 9],
        ],
      };
    case 'sidetail':
      return {
        back: (x, y) => ellipse(C + s - 11.5, 21, 3, 8)(x, y) && y >= 12,
        front: (x, y) =>
          cap(x, Math.min(y, 13)) &&
          (y <= 9 + Math.max(0, (C + s - x) * 0.45) || (Math.abs(x + 0.5 - C - s) >= 7 && y <= 18)),
        ties: [
          [C + s - 13, 13],
          [C + s - 12, 13],
        ],
      };
    case 'hime':
      return {
        back: longBack(31),
        front: (x, y) =>
          cap(x, Math.min(y, 13)) && (y <= 12 || (Math.abs(x + 0.5 - C - s) >= 6.5 && y <= 24)),
      };
    case 'odango':
      return {
        back: none,
        front: (x, y) =>
          bangs(12, 1, 18)(x, y) ||
          ellipse(C + s - 8, 3.5, 3.3, 3)(x, y) ||
          ellipse(C + s + 8, 3.5, 3.3, 3)(x, y),
      };
    case 'messy':
      return {
        back: none,
        front: (x, y) =>
          cap(x, Math.max(y, 4)) &&
          y >= [2, 0, 3, 1, 2][(x + 50 - s) % 5]! &&
          bangs(11, 2, 17)(x, Math.max(y, 4)),
      };
    case 'wavy':
      return {
        back: (x, y) =>
          longBack(30)(x, y) ||
          (y >= 16 && y <= 30 && Math.abs(x + 0.5 - C - b) <= 12.4 + Math.sin(y * 0.9) * 0.9),
        front: bangs(12, 2, 25),
      };
    case 'braids':
      return {
        back: none,
        front: (x, y) =>
          bangs(13, 1, 20)(x, y) ||
          [C + s - 9.5, C + s + 9.5].some(
            (bx) =>
              y >= 20 && y <= 30 && Math.abs(x + 0.5 - bx) <= 1.6 - ((y + 1) % 3 === 0 ? 0.6 : 0),
          ),
        ties: [
          [C + s - 10, 30],
          [C + s + 9, 30],
        ],
      };
    case 'wolf':
      return {
        back: (x, y) => longBack(24, 11.8)(x, y) && (y < 20 || (x + y) % 3 !== 0),
        front: (x, y) =>
          cap(x, Math.max(y, 5)) &&
          y >= [1, 2, 0, 2][(x + 40 - s) % 4]! &&
          bangs(12, 2, 21)(x, Math.max(y, 5)),
      };
    case 'ahoge':
      return {
        back: longBack(23),
        front: (x, y) =>
          bangs(13, 1, 22)(x, y) ||
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [2, 1],
            [2, 2],
            [1, 2],
          ].some(([ax, ay]) => x === Math.round(C + s) + ax! && y === ay! + 1),
      };
  }
}

function outfit(recipe: Recipe, g: Grid, s: number): void {
  const shirt = recipe.shirtColor;
  const skin = recipe.skinColor;
  const dark = shade(shirt, 0.75);
  const light = mix(shirt, WHITE, 0.8);
  const half = (y: number) => 6.5 + (y - 24) * 1.15;
  const torso: Mask = (x, y) => y >= 24 && Math.abs(x + 0.5 - C - s * 0.5) <= half(y);
  const dx = (x: number) => x + 0.5 - C - s * 0.5;
  paint(g, (x, y) => y >= 22 && y <= 25 && Math.abs(dx(x)) <= 2.5, shade(skin, 0.85));
  paint(g, torso, shirt);
  const v =
    (depth: number, w: number): Mask =>
    (x, y) =>
      y >= 24 && y <= 24 + depth && Math.abs(dx(x)) <= w - (y - 24) * (w / (depth + 1));
  switch (recipe.outfit) {
    case 'tee':
      paint(g, v(1, 2.5), shade(skin, 0.85));
      break;
    case 'shirttie':
      paint(g, v(3, 4), light);
      paint(g, (x, y) => y >= 24 && Math.abs(dx(x)) <= 0.5 && y <= 28, '#d22a5a');
      break;
    case 'hoodie':
      paint(g, (x, y) => torso(x, y) && y === 24 && Math.abs(dx(x)) >= 3, dark);
      paint(
        g,
        (x, y) =>
          y >= 25 && y <= 27 && (Math.abs(dx(x) + 1.5) <= 0.5 || Math.abs(dx(x) - 1.5) <= 0.5),
        WHITE,
      );
      break;
    case 'turtleneck':
      paint(g, (x, y) => y >= 22 && y <= 25 && Math.abs(dx(x)) <= 3, shade(shirt, 0.88));
      break;
    case 'sailor':
      paint(g, (x, y) => torso(x, y) && y <= 26 && Math.abs(dx(x)) >= 2, '#2f3a5a');
      paint(g, (x, y) => torso(x, y) && y === 26 && Math.abs(dx(x)) >= 3, WHITE);
      sprite(g, ['R.R', '.R.'], Math.round(C + s * 0.5) - 2, 26, { R: '#e2565f' });
      break;
    case 'blazer':
      paint(g, v(4, 4), light);
      paint(
        g,
        (x, y) => torso(x, y) && y >= 24 && Math.abs(Math.abs(dx(x)) - (4 - (y - 24) * 0.8)) <= 0.5,
        dark,
      );
      sprite(g, ['G'], Math.round(C + s * 0.5), 28, { G: GOLD });
      break;
    case 'overalls':
      paint(g, torso, light);
      paint(g, (x, y) => torso(x, y) && (y >= 27 || Math.abs(Math.abs(dx(x)) - 4) <= 0.6), shirt);
      sprite(g, ['G....G'], Math.round(C + s * 0.5) - 3, 27, { G: GOLD });
      break;
    case 'dress':
      paint(g, (x, y) => torso(x, y) && y <= 25 && Math.abs(dx(x)) <= 4.5, WHITE);
      paint(
        g,
        (x, y) => torso(x, y) && y === 25 && Math.abs(dx(x)) <= 4.5 && x % 2 === 0,
        shade(WHITE, 0.86),
      );
      sprite(g, ['RR.RR', '.RRR.', 'R...R'], Math.round(C + s * 0.5) - 2, 25, { R: '#e5566a' });
      paint(g, (x, y) => torso(x, y) && y === 29, mix(shirt, WHITE, 0.5));
      break;
    case 'kimono':
      paint(
        g,
        (x, y) => torso(x, y) && y <= 28 && Math.abs(Math.abs(dx(x)) - (y - 23.5)) <= 0.6,
        WHITE,
      );
      paint(g, (x, y) => torso(x, y) && y >= 28, '#e2565f');
      paint(g, (x, y) => torso(x, y) && y === 28 && x % 3 === 0, GOLD);
      paint(
        g,
        (x, y) => torso(x, y) && y <= 27 && (x * 3 + y * 2) % 7 === 0,
        mix(shirt, WHITE, 0.45),
      );
      break;
    case 'cardigan':
      paint(g, v(5, 3.5), light);
      paint(g, (x, y) => torso(x, y) && Math.abs(Math.abs(dx(x)) - 2) <= 0.5 && y >= 25, dark);
      sprite(g, ['W', '.', 'W', '.', 'W'], Math.round(C + s * 0.5) - 3, 25, { W: WHITE });
      paint(g, (x, y) => torso(x, y) && y === 29, dark);
      break;
    case 'maid':
      paint(g, (x, y) => torso(x, y), '#2f2a3a');
      paint(g, (x, y) => torso(x, y) && y >= 25 && Math.abs(dx(x)) <= 4 - (y - 25) * 0.2, WHITE);
      paint(g, (x, y) => y === 24 && Math.abs(dx(x)) <= 4.5, WHITE);
      sprite(g, ['RR.RR', '.RRR.'], Math.round(C + s * 0.5) - 2, 24, { R: shirt });
      break;
    case 'jacket':
      paint(g, v(6, 4.5), WHITE);
      paint(
        g,
        (x, y) => torso(x, y) && Math.abs(Math.abs(dx(x)) - (4.5 - (y - 24) * 0.6)) <= 0.6,
        dark,
      );
      paint(g, (x, y) => torso(x, y) && y >= 27 && Math.abs(dx(x)) <= 0.5, '#9aa3ad');
      paint(
        g,
        (x, y) => torso(x, y) && y === 28 && Math.abs(dx(x)) >= half(y) - 2.5,
        mix(shirt, WHITE, 0.6),
      );
      break;
  }
  const neck = shade(skin, 0.85);
  for (let y = 24; y < N; y++)
    for (let x = 0; x < N; x++) {
      const cell = g[y]![x];
      if (!cell || cell === neck || !torso(x, y)) continue;
      const d = dx(x);
      const edge = half(y) - Math.abs(d);
      if (y === 24 && Math.abs(d) <= 4.5) g[y]![x] = shade(cell, 0.78);
      else if (y >= 26 && edge >= 1.6 && edge < 2.6) g[y]![x] = shade(cell, 0.82);
      else if (d > 0 && edge < 1.6) g[y]![x] = shade(cell, 0.84);
      else if (d < 0 && edge < 1.6 && y <= 26) g[y]![x] = mix(cell, WHITE, 0.28);
      else if (d < -2 && y <= 25) g[y]![x] = mix(cell, WHITE, 0.14);
    }
}

function accessory(recipe: Recipe, g: Grid, s: number, face: Mask): void {
  const shirt = recipe.shirtColor;
  const cap = ellipse(C + s, 14, 11.6, 11.2);
  switch (recipe.accessory) {
    case 'none':
      return;
    case 'beanie':
      paint(g, (x, y) => cap(x, y) && y <= 8, shirt);
      paint(g, (x, y) => cap(x, y) && (y === 8 || y === 9), shade(shirt, 0.78));
      paint(g, ellipse(C + s, 1.6, 2.2, 1.8), WHITE);
      return;
    case 'cap':
      paint(g, (x, y) => cap(x, y) && y <= 8, shirt);
      paint(
        g,
        (x, y) => y === 9 && x + 0.5 >= C + s - 10 && x + 0.5 <= C + s + 13,
        shade(shirt, 0.72),
      );
      return;
    case 'headphones': {
      const band = (x: number, y: number) =>
        ellipse(C + s, 14, 12, 11.6)(x, y) && !ellipse(C + s, 14, 10.8, 10.4)(x, y) && y <= 13;
      paint(g, band, '#5d5b66');
      paint(
        g,
        (x, y) =>
          y >= 12 &&
          y <= 19 &&
          (Math.abs(x + 0.5 - (C + s - 11)) <= 1.6 || Math.abs(x + 0.5 - (C + s + 11)) <= 1.6),
        '#e25d6a',
      );
      return;
    }
    case 'flower':
      sprite(g, ['.P.P.', 'PPYPP', '.PPP.'], Math.round(C + s) + 6, 3, { P: '#f59fba', Y: GOLD });
      return;
    case 'bow':
      sprite(g, ['RR.RR', 'RRrRR', 'RR.RR'], Math.round(C + s) + 6, 3, {
        R: '#e5566a',
        r: '#b83a50',
      });
      return;
    case 'earring': {
      const xs = [...Array(N).keys()].filter((x) => face(x, 19));
      if (xs.length) {
        sprite(g, ['G', 'G'], xs[0]! - 1, 20, { G: GOLD });
        sprite(g, ['G', 'G'], xs.at(-1)! + 1, 20, { G: GOLD });
      }
      return;
    }
    case 'crown':
      sprite(g, ['G.G.G.G', 'GGGGGGG', 'GrGbGrG'], Math.round(C + s) - 3, 0, {
        G: GOLD,
        r: '#e5566a',
        b: '#5a9be0',
      });
      return;
    case 'halo':
      paint(
        g,
        (x, y) => ellipse(C + s, 1.6, 6.5, 1.8)(x, y) && !ellipse(C + s, 1.6, 4.4, 0.8)(x, y),
        GOLD,
      );
      return;
    case 'catears': {
      const ear = ['X...', 'XX..', 'XPX.', 'XXXX'];
      sprite(g, ear, Math.round(C + s) - 9, 2, { X: recipe.hairColor, P: '#f4a3b5' });
      sprite(g, ear, Math.round(C + s) + 5, 2, { X: recipe.hairColor, P: '#f4a3b5' }, true);
      return;
    }
    case 'hairclip':
      sprite(g, ['CC.CC', '.CCC.'], Math.round(C + s) + 3, 9, { C: '#e5566a' });
      return;
    case 'horns': {
      const horn = ['.H', 'HH', 'Hh'];
      sprite(g, horn, Math.round(C + s) - 8, 1, { H: '#5b3a6e', h: '#7d5694' });
      sprite(g, horn, Math.round(C + s) + 6, 1, { H: '#5b3a6e', h: '#7d5694' }, true);
      return;
    }
    case 'beret':
      paint(g, (x, y) => ellipse(C + s + 1.5, 4.6, 10.5, 3.6)(x, y), shirt);
      paint(g, (x, y) => ellipse(C + s + 1.5, 4.6, 10.5, 3.6)(x, y) && y >= 6, shade(shirt, 0.78));
      paint(
        g,
        (x, y) => ellipse(C + s + 1.5, 4.6, 10.5, 3.6)(x, y) && y <= 2 && x + 0.5 < C + s,
        mix(shirt, WHITE, 0.3),
      );
      sprite(g, ['S'], Math.round(C + s) + 1, 0, { S: shade(shirt, 0.6) });
      return;
    case 'ribbon':
      sprite(g, ['RRR.RRR', 'RrRRRrR', 'RRR.RRR', '.R...R.'], Math.round(C + s) - 3, 0, {
        R: '#e5566a',
        r: '#f49aa8',
      });
      return;
    case 'headband':
      paint(
        g,
        (x, y) =>
          ellipse(C + s, 14, 11.2, 10.8)(x, y) && !ellipse(C + s, 14.2, 10.2, 9.8)(x, y) && y <= 8,
        shirt,
      );
      paint(
        g,
        (x, y) =>
          ellipse(C + s, 14, 11.2, 10.8)(x, y) && !ellipse(C + s, 14.2, 10.2, 9.8)(x, y) && y <= 5,
        mix(shirt, WHITE, 0.35),
      );
      return;
    case 'bunnyears': {
      const ear = ['WW', 'WP', 'WP', 'WP', 'WW'];
      sprite(g, ear, Math.round(C + s) - 6, 0, { W: '#f4f1ec', P: '#f4a3b5' });
      sprite(g, ear, Math.round(C + s) + 4, 0, { W: '#f4f1ec', P: '#f4a3b5' }, true);
      return;
    }
    case 'horseears': {
      const ear = ['.X.', 'XPX', 'XPX', 'XXX'];
      sprite(g, ear, Math.round(C + s) - 9, 1, { X: shade(recipe.hairColor, 0.9), P: '#f4a3b5' });
      sprite(g, ear, Math.round(C + s) + 6, 1, { X: shade(recipe.hairColor, 0.9), P: '#f4a3b5' });
      sprite(g, ['BB', 'BB'], Math.round(C + s) + 3, 7, { B: '#5a9be0' });
      return;
    }
    case 'flowercrown':
      for (const [fx, color] of [
        [-8, '#f59fba'],
        [-4, GOLD],
        [0, '#f4f1ec'],
        [4, '#f59fba'],
        [8, GOLD],
      ] as const)
        sprite(
          g,
          ['.F.', 'FCF', '.F.'],
          Math.round(C + s) + fx - 1,
          4 + Math.round(Math.abs(fx) / 4),
          {
            F: color,
            C: color === GOLD ? '#e2565f' : GOLD,
          },
        );
      paint(
        g,
        (x, y) =>
          y === 6 + Math.round(Math.abs(x + 0.5 - C - s) / 4) &&
          Math.abs(x + 0.5 - C - s) <= 9 &&
          x % 2 === 1,
        '#5aa36b',
      );
      return;
    case 'witch':
      paint(g, (x, y) => y >= 6 && y <= 7 && Math.abs(x + 0.5 - C - s) <= 13, '#3a2f52');
      paint(
        g,
        (x, y) => y <= 6 && Math.abs(x + 0.5 - C - s - (6 - y) * 0.5) <= 1 + y * 0.9,
        '#4b3d6b',
      );
      paint(g, (x, y) => y === 5 && Math.abs(x + 0.5 - C - s - 0.5) <= 5.2, '#efb93f');
      return;
    case 'pins':
      sprite(g, ['Y.Y', '.Y.', 'Y.Y', '...', 'B.B', '.B.', 'B.B'], Math.round(C + s) + 6, 7, {
        Y: GOLD,
        B: '#5a9be0',
      });
      return;
  }
}

export function pixelTileColor(hair: string): string {
  const [r, g, b] = channels(hair).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  const chroma = max - min;
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.18 || lightness > 0.86 || lightness < 0.16) return '#ece8e1';
  const hue =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  const s = Math.min(0.55, Math.max(0.35, saturation * 0.6));
  const l = 0.88;
  const f = (n: number) => {
    const k = (n + hue * 2) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return hex([f(0), f(8), f(4)].map((v) => v * 255));
}

export function pixelFigure(
  recipe: Recipe,
  yawDeg: number,
): { tile: string; body: string; head: string; cells: PixelCell[] } {
  const yaw = (yawDeg * Math.PI) / 180;
  const sinY = Math.sin(yaw);
  const s = Math.round(sinY * 3);
  const fs = Math.round(sinY * 10);
  const b = -Math.round(sinY * 3.5);
  const turned = Math.abs(sinY) >= 0.3;
  const d = Math.sign(sinY);
  const skin = recipe.skinColor;
  const hairColor = recipe.hairColor;
  const front = FACE[recipe.head](s * 0.5);
  const face: Mask = turned
    ? (x, y) => {
        const dx = x + 0.5 - C;
        const tuck = y >= 17 && d * dx > 4 ? Math.min(2, (y - 16) * 0.35) : 0;
        return front(x - Math.round(d * (1 + Math.max(0, y - 20) * 0.4) - d * tuck), y);
      }
    : front;
  const masks = hair(recipe, s, b);

  const body = blank();
  outfit(recipe, body, s);

  const back = blank();
  paint(back, masks.back, shade(hairColor, 0.82));
  if (masks.bands)
    paint(
      back,
      (x, y) => masks.back(x, y) && (y + Math.floor(x / 2)) % 4 === 0,
      shade(hairColor, 0.68),
    );

  const head = blank();
  paint(head, face, skin);
  const earY = 15;
  const edge = (side: number) => {
    const xs = [...Array(N).keys()].filter((x) => face(x, earY));
    return side < 0 ? xs[0]! - 1 : xs.at(-1)! + 1;
  };
  if (!turned)
    for (const ex of [-1, 1])
      sprite(head, ['E', 'E', 'e'], edge(ex), earY, { E: skin, e: shade(skin, 0.86) });
  else
    sprite(head, ['EE', 'Ee', 'Ee', 'E.'], d > 0 ? edge(-d) - 1 : edge(-d), earY, {
      E: skin,
      e: shade(skin, 0.8),
    });
  paint(head, masks.front, hairColor);
  for (const [x, y] of masks.ties ?? [])
    sprite(back, ['T'], Math.round(x), y, { T: shade(recipe.shirtColor, 0.8) });
  accessory(recipe, head, s, face);

  const shadeHair = (g: Grid) => {
    const out = g.map((r) => [...r]);
    const cells = g.flatMap((row, y) => row.flatMap((c, x) => (c === hairColor ? [[x, y]] : [])));
    const xs = cells.map(([x]) => x!);
    const ys = cells.map(([, y]) => y!);
    const left = Math.min(...xs);
    const right = Math.max(...xs);
    const top = Math.min(...ys);
    const mid = (left + right) / 2;
    const span = Math.max(1, (right - left) / 2);
    const light = mix(hairColor, WHITE, 0.2);
    const dark = shade(hairColor, 0.8);
    const middle = shade(hairColor, 0.9);
    for (const [x, y] of cells) {
      const side = (x! + 0.5 - mid) / span + (y! - top) * 0.025;
      if (side > 0.72) out[y!]![x!] = dark;
      else if (side > 0.42) out[y!]![x!] = middle;
      else if (side < -0.2 && y! <= top + 4) out[y!]![x!] = light;
    }
    for (const [x, y] of cells) {
      const nearFace = g[y!]![x! - 1] === skin || g[y!]![x! + 1] === skin;
      if (nearFace && y! >= 14) out[y!]![x!] = shade(hairColor, 0.74);
      else if (Math.abs(x! + 0.5 - C - s) >= 7.5 && y! >= 14 && (x! + 40 - s) % 3 === 0)
        out[y!]![x!] = shade(out[y!]![x!]!, 0.86);
    }
    for (let y = 1; y < N; y++)
      for (let x = 0; x < N; x++) {
        if (g[y]![x] !== skin) continue;
        if (g[y - 1]![x] === hairColor) out[y]![x] = mix(shade(skin, 0.84), BLUSH, 0.12);
        else if (x + 1 < N && g[y]![x + 1] !== skin && g[y]![x + 1] !== undefined && x > C + s)
          out[y]![x] = shade(skin, 0.9);
        else if (x + 1 < N && g[y]![x + 1] === undefined && x > C + s)
          out[y]![x] = shade(skin, 0.9);
      }
    for (let y = 0; y < N - 1; y++)
      for (let x = 0; x < N; x++)
        if (g[y]![x] === hairColor && g[y + 1]![x] === skin) out[y]![x] = shade(hairColor, 0.62);
    for (let x = 0; x < N; x++)
      for (let y = 3; y < N; y++)
        if (g[y]![x] === hairColor && g[y + 1]?.[x] === skin && (x + 40 - s) % 4 === 0)
          for (let k = 1; k <= 3; k++)
            if (g[y - k]?.[x] === hairColor) out[y - k]![x] = shade(hairColor, 0.72);
    const ring = mix(hairColor, WHITE, 0.45);
    for (let x = Math.round(C + s) - 7; x <= Math.round(C + s) + 3; x++) {
      const first = g.findIndex((row) => row[x] === hairColor);
      if (first < 0) continue;
      const y = first + 2 + Math.round(Math.abs(x + 0.5 - (C + s - 2)) / 4);
      if (g[y]?.[x] === hairColor && x % 3 !== 0) out[y]![x] = ring;
    }
    return out;
  };

  const figure = blank();
  for (const layer of [back, body, shadeHair(head)])
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) if (layer[y]![x]) figure[y]![x] = layer[y]![x];

  const features = blank();
  const eyes = blank();
  const closed = blank();
  const glasses = blank();
  const eyeTop = 15;
  const eyeW = (side: -1 | 1) => (turned && Math.sign(fs) === side ? 3 : 4);
  const eyeX = (side: -1 | 1) => {
    const w = eyeW(side);
    return side < 0
      ? Math.round(C + fs * 0.6) - 6 - (w === 3 ? -1 : 0)
      : Math.round(C + fs * 0.6) + 2;
  };
  const left = { x: eyeX(-1), w: eyeW(-1) };
  const right = { x: eyeX(1), w: eyeW(1) };
  const fit = (rows: readonly string[], w: number) =>
    rows.map((r) => r.slice(Math.max(0, r.length - w)));
  const pal = {
    K: INK,
    W: WHITE,
    D: shade(recipe.eyeColor, 0.55),
    I: recipe.eyeColor,
    L: mix(recipe.eyeColor, WHITE, 0.45),
  };
  const style = EYES[recipe.eyes];
  const extra = style[0]!.length - 4;
  sprite(eyes, fit(style, left.w + extra), left.x - extra, eyeTop, pal);
  sprite(
    eyes,
    recipe.eyes === 'wink' ? fit(CLOSED, right.w) : fit(style, right.w + extra),
    right.x,
    eyeTop,
    pal,
    true,
  );
  sprite(closed, fit(CLOSED, left.w), left.x, eyeTop, pal);
  sprite(closed, fit(CLOSED, right.w), right.x, eyeTop, pal, true);
  const browRows = BROWS[recipe.brows];
  if (browRows.length) {
    sprite(features, fit(browRows, left.w), left.x, eyeTop - 2, { B: shade(hairColor, 0.55) });
    sprite(
      features,
      fit(browRows, right.w),
      right.x,
      eyeTop - 2,
      { B: shade(hairColor, 0.55) },
      true,
    );
  }
  const cx = Math.round(C + fs * (turned ? 0.85 : 0.6));
  if (recipe.nose === 'dot') sprite(features, ['N'], cx, 18, { N: shade(skin, 0.78) });
  if (recipe.nose === 'button') sprite(features, ['N'], cx, 18, { N: shade(skin, 0.88) });
  if (recipe.nose === 'line') sprite(features, ['N', 'N'], cx, 17, { N: shade(skin, 0.82) });
  const mouth = MOUTHS[recipe.mouth];
  const mx = C - 0.5 + fs * 0.6;
  sprite(features, mouth, Math.round(mx - (mouth[0]!.length - 1) / 2), 20, {
    K: MOUTH,
    M: MOUTH_INSIDE,
    T: TONGUE,
    W: WHITE,
  });
  if (recipe.cheeks === 'blush') {
    sprite(features, ['PP'], left.x - 1, 19, { P: mix(BLUSH, skin, 0.25) });
    sprite(features, ['PP'], right.x + right.w - 1, 19, { P: mix(BLUSH, skin, 0.25) });
  }
  if (recipe.cheeks === 'freckles') {
    sprite(features, ['F.F'], left.x, 19, { F: shade(skin, 0.7) });
    sprite(features, ['F.F'], right.x + 1, 19, { F: shade(skin, 0.7) });
  }
  const frame = (fx: number, w: number, round: boolean) =>
    paint(
      glasses,
      (x, y) => {
        const inside = x >= fx && x < fx + w && y >= eyeTop && y <= eyeTop + 3;
        const box = x >= fx - 1 && x <= fx + w && y >= eyeTop - 1 && y <= eyeTop + 4;
        const corner = (x === fx - 1 || x === fx + w) && (y === eyeTop - 1 || y === eyeTop + 4);
        return box && !inside && !(round && corner);
      },
      INK,
    );
  if (recipe.glasses === 'round' || recipe.glasses === 'square') {
    frame(left.x, left.w, recipe.glasses === 'round');
    frame(right.x, right.w, recipe.glasses === 'round');
    paint(glasses, (x, y) => y === eyeTop + 1 && x > left.x + left.w && x < right.x - 1, INK);
  }
  if (recipe.glasses === 'shades') {
    for (const e of [left, right])
      paint(
        glasses,
        (x, y) => x >= e.x - 1 && x <= e.x + e.w && y >= eyeTop && y <= eyeTop + 2,
        INK,
      );
    paint(glasses, (x, y) => y === eyeTop && x > left.x + left.w && x < right.x - 1, INK);
    for (const e of [left, right]) sprite(glasses, ['W'], e.x, eyeTop, { W: '#7d7b88' });
  }
  if (recipe.glasses === 'monocle') {
    frame(right.x, right.w, true);
    sprite(glasses, ['G', 'G', 'G'], right.x + right.w, eyeTop + 5, { G: GOLD });
  }

  const full = clip(outline(figure));
  const bodyCells = blank();
  const headCells = blank();
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = full[y]![x];
      if (!c) continue;
      if (y >= 22 && !head[y]![x] && !back[y]![x]) bodyCells[y]![x] = c;
      else headCells[y]![x] = c;
    }
  const cells: PixelCell[] = [];
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const c = glasses[y]![x] ?? eyes[y]![x] ?? features[y]![x] ?? full[y]![x];
      if (c) cells.push({ x, y, c });
    }
  return {
    cells,
    tile: `<rect width="32" height="32" rx="6" fill="${pixelTileColor(recipe.hairColor)}"/>`,
    body: `<g class="bh-illustrated-body">${rects(bodyCells)}</g>`,
    head: [
      `<g class="bh-illustrated-head">${rects(headCells)}`,
      `<g class="bh-illustrated-face">${rects(features)}`,
      `<g class="bh-illustrated-gaze">${rects(eyes)}</g>`,
      `<g class="bh-illustrated-blink" opacity="0">${rects(closed)}</g>`,
      `${rects(glasses)}</g></g>`,
    ].join(''),
  };
}
