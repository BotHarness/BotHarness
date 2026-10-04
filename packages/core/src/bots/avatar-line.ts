import { seededRandom } from './avatar-random.js';

export const LINE_PARTS = {
  eyes: ['dots', 'smile', 'arcs', 'lines', 'wide', 'sleepy', 'wink', 'cross'],
  brows: ['flat', 'arched', 'raised', 'angry', 'worried', 'none'],
  nose: ['line', 'hook', 'curve', 'long', 'dot', 'none'],
  mouth: ['flat', 'smile', 'grin', 'open', 'smirk', 'wave', 'frown', 'tongue'],
  cheeks: ['none', 'lines', 'dots'],
  glasses: ['none', 'round', 'square'],
} as const;
export const LINE_RANGES = {
  spacing: [-3, 3],
  height: [-3, 3],
  tilt: [-10, 10],
} as const;
export const LINE_COLORS = ['backgroundColor', 'inkColor'] as const;

export type LinePart = keyof typeof LINE_PARTS;
export type LineRange = keyof typeof LINE_RANGES;
export type LineColor = (typeof LINE_COLORS)[number];
export type LineAvatarRecipe = {
  schemaVersion: 1;
  family: 'line';
  assetVersion: 1;
  rigVersion: 1;
} & { [P in LinePart]: (typeof LINE_PARTS)[P][number] } & Record<LineRange, number> &
  Record<LineColor, string>;

export const LINE_SWATCHES: Record<LineColor, readonly string[]> = {
  backgroundColor: [
    '#f3d9d2',
    '#f6e3b4',
    '#d6ead2',
    '#cfe3f3',
    '#e2d8f3',
    '#f2f0ea',
    '#f7c9b0',
    '#c9ece4',
  ],
  inkColor: ['#1d2433', '#2a2230', '#3b2a20', '#1f3a5f', '#4a2a4a', '#2f4a3a'],
};

export const DEFAULT_LINE_RECIPE: LineAvatarRecipe = {
  schemaVersion: 1,
  family: 'line',
  assetVersion: 1,
  rigVersion: 1,
  eyes: 'dots',
  brows: 'flat',
  nose: 'line',
  mouth: 'smile',
  cheeks: 'none',
  glasses: 'none',
  spacing: 0,
  height: 0,
  tilt: 0,
  backgroundColor: '#f3d9d2',
  inkColor: '#1d2433',
};

const LINE_PART_KEYS = Object.keys(LINE_PARTS) as LinePart[];
const LINE_RANGE_KEYS = Object.keys(LINE_RANGES) as LineRange[];

export function isLineAvatarRecipe(value: unknown): value is LineAvatarRecipe {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== Object.keys(DEFAULT_LINE_RECIPE).length) return false;
  return (
    r['schemaVersion'] === 1 &&
    r['family'] === 'line' &&
    r['assetVersion'] === 1 &&
    r['rigVersion'] === 1 &&
    LINE_PART_KEYS.every(
      (key) =>
        typeof r[key] === 'string' && (LINE_PARTS[key] as readonly string[]).includes(r[key]),
    ) &&
    LINE_RANGE_KEYS.every((key) => {
      const v = r[key];
      const [min, max] = LINE_RANGES[key];
      return typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
    }) &&
    LINE_COLORS.every((key) => typeof r[key] === 'string' && /^#[\da-f]{6}$/iu.test(r[key]))
  );
}

export function canonicalLineRecipe(recipe: LineAvatarRecipe): LineAvatarRecipe {
  const canonical: Record<string, unknown> = {
    schemaVersion: 1,
    family: 'line',
    assetVersion: 1,
    rigVersion: 1,
  };
  for (const key of LINE_PART_KEYS) canonical[key] = recipe[key];
  for (const key of LINE_RANGE_KEYS) canonical[key] = recipe[key];
  for (const key of LINE_COLORS) canonical[key] = recipe[key].toLowerCase();
  return canonical as LineAvatarRecipe;
}

export function seededLineRecipe(seed: string): LineAvatarRecipe {
  const random = seededRandom(`botharness-line:${seed.trim().toLowerCase()}`);
  const pick = <T>(values: readonly T[]) => values[Math.floor(random() * values.length)]!;
  const recipe: Record<string, unknown> = { ...DEFAULT_LINE_RECIPE };
  for (const part of LINE_PART_KEYS) recipe[part] = pick(LINE_PARTS[part]);
  recipe['glasses'] = pick(['none', 'none', 'none', 'round', 'square']);
  for (const key of LINE_RANGE_KEYS) {
    const [min, max] = LINE_RANGES[key];
    recipe[key] = Math.round(min / 2 + (random() * (max - min)) / 2);
  }
  for (const color of LINE_COLORS) recipe[color] = pick(LINE_SWATCHES[color]);
  return recipe as LineAvatarRecipe;
}

const CX = 24;
const EYE_Y = 20;
const STROKE = 3;
const MARK_COLORS = {
  'thinking-dots': '#e8a93a',
  searching: '#5a9be0',
  coding: '#5a9be0',
  executing: '#e8a93a',
  'generic-working': '#8a8792',
} as const;
const MARKS: Record<keyof typeof MARK_COLORS, string> = {
  'thinking-dots':
    '<path d="M40 5.5Q40 3 42.5 3Q45 3 45 5.5Q45 7.5 42.5 8.5L42.5 10"/><circle cx="42.5" cy="13" r=".6"/>',
  searching: '<circle cx="41.5" cy="6.5" r="3"/><path d="M43.7 8.7L46 11"/>',
  coding: '<path d="M42.5 3Q45.5 7.5 45.5 9.5A3 3 0 0 1 39.5 9.5Q39.5 7.5 42.5 3Z"/>',
  executing: '<path d="M42.5 3L42.5 9"/><circle cx="42.5" cy="12.5" r=".6"/>',
  'generic-working':
    '<circle cx="39" cy="8" r=".6"/><circle cx="42.5" cy="8" r=".6"/><circle cx="46" cy="8" r=".6"/>',
};

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function eye(
  style: LineAvatarRecipe['eyes'],
  x: number,
  y: number,
  k: number,
  ink: string,
): string {
  const w = 3 * k;
  switch (style) {
    case 'dots':
      return `<ellipse cx="${fmt(x)}" cy="${y}" rx="${fmt(1.9 * k)}" ry="1.9" fill="${ink}" stroke="none"/>`;
    case 'smile':
      return `<path d="M${fmt(x - w)} ${y - 1}Q${fmt(x)} ${y + 2.5} ${fmt(x + w)} ${y - 1}"/>`;
    case 'arcs':
      return `<path d="M${fmt(x - w)} ${y + 1}Q${fmt(x)} ${y - 2.5} ${fmt(x + w)} ${y + 1}"/>`;
    case 'lines':
      return `<path d="M${fmt(x - w)} ${y}L${fmt(x + w)} ${y}"/>`;
    case 'wide':
      return `<ellipse cx="${fmt(x)}" cy="${y}" rx="${fmt(2.8 * k)}" ry="2.8"/><circle cx="${fmt(x)}" cy="${y + 0.4}" r="1" fill="${ink}" stroke="none"/>`;
    case 'sleepy':
      return `<path d="M${fmt(x - w)} ${y - 0.5}L${fmt(x + w)} ${y - 0.5}M${fmt(x - w * 0.7)} ${y - 0.5}Q${fmt(x)} ${y + 2.5} ${fmt(x + w * 0.7)} ${y - 0.5}"/>`;
    case 'wink':
      return `<ellipse cx="${fmt(x)}" cy="${y}" rx="${fmt(1.9 * k)}" ry="1.9" fill="${ink}" stroke="none"/>`;
    case 'cross':
      return `<path d="M${fmt(x - 2 * k)} ${y - 2}L${fmt(x + 2 * k)} ${y + 2}M${fmt(x + 2 * k)} ${y - 2}L${fmt(x - 2 * k)} ${y + 2}"/>`;
  }
}

function closedEye(x: number, y: number, k: number): string {
  return `<path d="M${fmt(x - 3 * k)} ${y}L${fmt(x + 3 * k)} ${y}"/>`;
}

function brow(
  style: LineAvatarRecipe['brows'],
  x: number,
  y: number,
  k: number,
  inner: number,
): string {
  const w = 3.4 * k;
  const o = -inner;
  const at = (dx: number, dy: number) => `${fmt(x + dx * o * w)} ${fmt(y + dy)}`;
  switch (style) {
    case 'none':
      return '';
    case 'flat':
      return `<path d="M${at(1, 0)}L${at(-1, 0)}"/>`;
    case 'arched':
      return `<path d="M${at(1, 1)}Q${at(0, -2)} ${at(-1, 0.5)}"/>`;
    case 'raised':
      return `<path d="M${at(1, -0.5)}Q${at(0, -3.5)} ${at(-1, -1)}"/>`;
    case 'angry':
      return `<path d="M${at(1, -1.2)}L${at(-1, 1.2)}"/>`;
    case 'worried':
      return `<path d="M${at(1, 1.2)}L${at(-1, -1.2)}"/>`;
  }
}

function nose(
  style: LineAvatarRecipe['nose'],
  x: number,
  y: number,
  side: number,
  ink: string,
): string {
  const s = side || 1;
  switch (style) {
    case 'none':
      return '';
    case 'line':
      return `<path d="M${fmt(x + 1.5 * s)} ${y}L${fmt(x - 1.5 * s)} ${y + 7}"/>`;
    case 'hook':
      return `<path d="M${fmt(x + 1 * s)} ${y}L${fmt(x - 1.5 * s)} ${y + 7}L${fmt(x + 1.5 * s)} ${y + 7}"/>`;
    case 'curve':
      return `<path d="M${fmt(x)} ${y}Q${fmt(x - 3 * s)} ${y + 6} ${fmt(x + 1 * s)} ${y + 7}"/>`;
    case 'long':
      return `<path d="M${fmt(x)} ${y - 1}L${fmt(x)} ${y + 7}"/>`;
    case 'dot':
      return `<circle cx="${fmt(x)}" cy="${y + 6}" r="1.1" fill="${ink}" stroke="none"/>`;
  }
}

function mouth(
  style: LineAvatarRecipe['mouth'],
  x: number,
  y: number,
  k: number,
  ink: string,
): string {
  const w = 4.5 * k;
  const p = (dx: number, dy: number) => `${fmt(x + dx * w)} ${fmt(y + dy)}`;
  switch (style) {
    case 'flat':
      return `<path d="M${p(-1, 0.3)}L${p(1, -0.3)}"/>`;
    case 'smile':
      return `<path d="M${p(-1, -0.5)}Q${p(0, 3)} ${p(1, -0.5)}"/>`;
    case 'grin':
      return `<path d="M${p(-1, -0.5)}L${p(1, -0.5)}Q${p(0.9, 4)} ${p(0, 4)}Q${p(-0.9, 4)} ${p(-1, -0.5)}Z" fill="${ink}"/>`;
    case 'open':
      return `<ellipse cx="${fmt(x)}" cy="${y + 0.8}" rx="${fmt(2.2 * k)}" ry="2.6"/>`;
    case 'smirk':
      return `<path d="M${p(-1, 0.5)}L${p(0.5, 0.5)}Q${p(1, 0.4)} ${p(1.1, -1.5)}"/>`;
    case 'wave':
      return `<path d="M${p(-1, 0)}Q${p(-0.5, -1.6)} ${p(0, 0)}Q${p(0.5, 1.6)} ${p(1, 0)}"/>`;
    case 'frown':
      return `<path d="M${p(-1, 1.5)}Q${p(0, -2)} ${p(1, 1.5)}"/>`;
    case 'tongue':
      return `<path d="M${p(-1, -0.5)}Q${p(0, 3)} ${p(1, -0.5)}M${p(0.05, 1.8)}Q${p(0.15, 4.5)} ${p(0.6, 1.2)}"/>`;
  }
}

function cheeks(
  style: LineAvatarRecipe['cheeks'],
  xs: readonly number[],
  y: number,
  ink: string,
): string {
  if (style === 'none') return '';
  return xs
    .map((x) =>
      style === 'lines'
        ? `<path d="M${fmt(x - 2)} ${y + 1}L${fmt(x - 1)} ${y - 1}M${fmt(x + 0.5)} ${y + 1}L${fmt(x + 1.5)} ${y - 1}" stroke-width="1.6"/>`
        : `<circle cx="${fmt(x)}" cy="${y}" r="1.6" fill="${ink}" fill-opacity=".22" stroke="none"/>`,
    )
    .join('');
}

function features(
  recipe: LineAvatarRecipe,
  yawDegrees: number,
): { eyes: string; closed: string; rest: string } {
  const ink = recipe.inkColor;
  const yaw = (yawDegrees * Math.PI) / 180;
  const R = 19;
  const half = 8.5 + recipe.spacing;
  const theta = Math.asin(half / R);
  const y = EYE_Y + recipe.height;
  const at = (side: -1 | 1) => {
    const angle = yaw + side * theta;
    return { x: CX + R * Math.sin(angle), k: Math.max(0.35, Math.cos(angle) / Math.cos(theta)) };
  };
  const left = at(-1);
  const right = at(1);
  const center = CX + R * Math.sin(yaw) * 0.9;
  const browGap = recipe.glasses === 'none' ? 6.5 : 8;
  const eyes =
    eye(recipe.eyes, left.x, y, left.k, ink) +
    (recipe.eyes === 'wink'
      ? closedEye(right.x, y, right.k)
      : eye(recipe.eyes, right.x, y, right.k, ink));
  const closed = closedEye(left.x, y, left.k) + closedEye(right.x, y, right.k);
  const glasses =
    recipe.glasses === 'none'
      ? ''
      : [left, right]
          .map((e) =>
            recipe.glasses === 'round'
              ? `<ellipse cx="${fmt(e.x)}" cy="${y}" rx="${fmt(4.6 * e.k)}" ry="4.6" stroke-width="1.8"/>`
              : `<rect x="${fmt(e.x - 4.8 * e.k)}" y="${y - 4}" width="${fmt(9.6 * e.k)}" height="8" rx="1.6" stroke-width="1.8"/>`,
          )
          .join('') +
        `<path d="M${fmt(left.x + 4.6 * left.k)} ${y - 0.5}Q${fmt((left.x + right.x) / 2)} ${y - 2} ${fmt(right.x - 4.6 * right.k)} ${y - 0.5}" stroke-width="1.8"/>`;
  const rest =
    brow(recipe.brows, left.x, y - browGap, left.k, 1) +
    brow(recipe.brows, right.x, y - browGap, right.k, -1) +
    nose(recipe.nose, center, y + 3, Math.sign(yaw), ink) +
    mouth(recipe.mouth, CX + R * Math.sin(yaw) * 0.8, y + 16, Math.max(0.6, Math.cos(yaw)), ink) +
    cheeks(recipe.cheeks, [left.x - 1.5, right.x + 1.5], y + 10, ink) +
    glasses;
  return { eyes, closed, rest };
}

export function lineAvatarSvg(
  recipe: LineAvatarRecipe,
  options: { turns?: readonly number[] } = {},
): string {
  if (!isLineAvatarRecipe(recipe)) throw new Error('invalid Avatar recipe');
  const ink = recipe.inkColor;
  const tilt = `rotate(${recipe.tilt} ${CX} ${EYE_Y + recipe.height + 6})`;
  const stroke = `fill="none" stroke="${ink}" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"`;
  const face = (yaw: number) => features(recipe, yaw);
  const base = face(0);
  const head = (
    parts: { eyes: string; closed: string; rest: string },
    cls = 'class="bh-illustrated-',
  ) =>
    `<g ${cls}head" ${stroke}><g ${cls}face" transform="${tilt}">${parts.rest}<g ${cls}gaze">${parts.eyes}</g><g ${cls}blink" opacity="0">${parts.closed}</g></g></g>`;
  const turns = (options.turns ?? [])
    .map(
      (delta) =>
        `<g data-avatar-turn="${delta}" opacity="0">${head(face(delta), 'data-turn-part="')}</g>`,
    )
    .join('');
  const marks = (Object.keys(MARKS) as (keyof typeof MARKS)[])
    .map(
      (mark) =>
        `<g data-avatar-mark="${mark}" opacity="0" fill="none" stroke="${MARK_COLORS[mark]}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${MARKS[mark]}</g>`,
    )
    .join('');
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="512" height="512" aria-hidden="true">',
    `<rect width="48" height="48" rx="11" fill="${recipe.backgroundColor}"/>`,
    '<g class="bh-illustrated-body"></g>',
    head(base),
    turns,
    `<g class="bh-illustrated-marks">${marks}</g>`,
    '</svg>',
  ].join('');
}
