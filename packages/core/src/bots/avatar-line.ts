import { seededRandom } from './avatar-random.js';

export const LINE_PARTS = {
  eyes: [
    'dots',
    'smile',
    'arcs',
    'lines',
    'wide',
    'sleepy',
    'wink',
    'cross',
    'tight',
    'tears',
    'excited',
    'stare',
    'swirl',
    'star',
    'gentle',
    'cute',
  ],
  brows: ['flat', 'arched', 'raised', 'angry', 'worried', 'none'],
  nose: ['line', 'hook', 'curve', 'long', 'dot', 'none'],
  mouth: [
    'flat',
    'smile',
    'grin',
    'open',
    'smirk',
    'wave',
    'frown',
    'tongue',
    'omega',
    'laugh',
    'angry',
    'kiss',
    'shocked',
  ],
  cheeks: ['none', 'lines', 'dots'],
  glasses: ['none', 'round', 'square'],
  symbol: ['none', 'sweat', 'anger', 'gloom', 'sparkle', 'heart', 'zzz', 'note', 'steam'],
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
  symbol: 'none',
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
  recipe['symbol'] = pick(['none', 'none', 'none', 'none', ...LINE_PARTS.symbol.slice(1)]);
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
export type LineMorphNode = readonly [string, Readonly<Record<string, string>>];

const shape = (markup: string): LineMorphNode[] =>
  [...markup.matchAll(/<(path|ellipse|circle|rect)\s([^>]*?)\/>/gu)].map(([, tag, attrs]) => [
    tag!,
    Object.fromEntries(
      [...attrs!.matchAll(/([\w-]+)="([^"]*)"/gu)]
        .filter(([, key]) => /^(d|cx|cy|r|rx|ry|x|y|width|height)$/u.test(key!))
        .map(([, key, value]) => [key!, value!]),
    ),
  ]);

export const LINE_MORPH_SYMBOLS: Readonly<Record<string, readonly LineMorphNode[]>> = {
  'thinking-dots': shape(
    '<path d="M17.5 17Q17.5 10.5 24 10.5Q30.5 10.5 30.5 17Q30.5 21.5 24 23.5L24 27.5"/><circle cx="24" cy="34" r="1.3"/>',
  ),
  searching: shape('<circle cx="22" cy="22" r="7.5"/><path d="M27.5 27.5L34 34"/>'),
  coding: shape(
    '<path d="M18.5 16L12.5 24L18.5 32"/><path d="M29.5 16L35.5 24L29.5 32"/><path d="M26.5 13L21.5 35"/>',
  ),
  executing: shape(
    '<path d="M24 10L24 27"/><circle cx="24" cy="34" r="1.3"/><path d="M14.5 12L17.5 15.5"/><path d="M33.5 12L30.5 15.5"/>',
  ),
  'generic-working': shape(
    '<path d="M28 33L28 11Q32.5 12.5 34 17.5"/><ellipse cx="24.5" cy="33" rx="3.6" ry="2.6"/>',
  ),
  idle: shape('<path d="M14 21Q24 33 34 21"/><path d="M18 14L18 16"/><path d="M30 14L30 16"/>'),
};

export function lineMorphFace(recipe: LineAvatarRecipe): {
  nodes: LineMorphNode[];
  pivot: readonly [number, number];
  tilt: number;
} {
  return {
    nodes: shape(features(recipe, 0).morph),
    pivot: [CX, EYE_Y + recipe.height + 6],
    tilt: recipe.tilt,
  };
}

const ATTENTION_MARK =
  '<g data-avatar-attention-mark="" opacity="0" fill="none" stroke="#e2565f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5.5 3.5L5.5 9.5"/><circle cx="5.5" cy="12.5" r=".7" fill="#e2565f"/><path d="M8.5 5.2Q8.5 3.2 10.6 3.2Q12.7 3.2 12.7 5.2Q12.7 6.9 10.6 7.8L10.6 9.6"/><circle cx="10.6" cy="12.5" r=".7" fill="#e2565f"/></g>';

function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function eye(
  style: LineAvatarRecipe['eyes'],
  x: number,
  y: number,
  k: number,
  ink: string,
  side: -1 | 1,
): string {
  const w = 3 * k;
  const dir = -side;
  const X = (dx: number) => fmt(x + dx);
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
    case 'tight':
      return `<path d="M${X(-dir * w * 0.8)} ${y - 2.3}L${X(dir * w * 0.8)} ${y}L${X(-dir * w * 0.8)} ${y + 2.3}"/>`;
    case 'tears':
      return `<path d="M${X(-w)} ${y - 0.5}L${X(w)} ${y - 0.5}M${X(-w * 0.35)} ${y}L${X(-w * 0.35)} ${y + 3}M${X(w * 0.35)} ${y}L${X(w * 0.35)} ${y + 3}"/><path d="M${X(-w * 0.35)} ${y + 4.5}L${X(-w * 0.35)} ${y + 7.5}M${X(w * 0.35)} ${y + 4.5}L${X(w * 0.35)} ${y + 6.5}" stroke="#6fa8dc" stroke-width="1.8"/>`;
    case 'excited':
      return `<path d="M${X(-dir * w * 0.8)} ${y - 2.5}L${X(dir * w * 0.8)} ${y - 0.5}L${X(-dir * w * 0.8)} ${y + 1.5}M${X(-w)} ${y + 3.5}L${X(w)} ${y + 3.5}"/>`;
    case 'stare':
      return `<path d="M${X(-w)} ${y + 1.8}Q${X(0)} ${y - 3.2} ${X(w)} ${y + 1.8}"/><circle cx="${X(0)}" cy="${y + 0.6}" r="1.1" fill="${ink}" stroke="none"/>`;
    case 'swirl':
      return `<circle cx="${X(0)}" cy="${y}" r="${fmt(2.8 * k)}" stroke-width="1.8"/><path d="M${X(1.2 * k)} ${y}A${fmt(1.2 * k)} 1.2 0 1 1 ${X(0)} ${y - 1.2}" stroke-width="1.6"/>`;
    case 'star': {
      const points = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 3.3 : 1.4;
        return `${X(r * Math.cos(a) * k)} ${fmt(y + r * Math.sin(a))}`;
      });
      return `<path d="M${points.join('L')}Z" fill="${ink}" stroke-width="1"/>`;
    }
    case 'gentle':
      return `<path d="M${X(-dir * w * 0.6)} ${y + 1.2}L${X(dir * w * 0.7)} ${y - 1.4}"/>`;
    case 'cute':
      return `<ellipse cx="${X(0)}" cy="${y}" rx="${fmt(2.7 * k)}" ry="2.9" fill="${ink}" stroke="none"/><circle cx="${X(0.9 * k)}" cy="${y - 1}" r=".9" fill="#ffffff" stroke="none"/>`;
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
    case 'omega':
      return `<path d="M${p(-1, -0.6)}Q${p(-0.55, 3)} ${p(0, 0.2)}Q${p(0.55, 3)} ${p(1, -0.6)}"/>`;
    case 'laugh':
      return `<path d="M${p(-0.9, -0.6)}L${p(0.9, -0.6)}L${p(0, 4.2)}Z" fill="${ink}"/>`;
    case 'angry':
      return `<rect x="${fmt(x - w * 0.9)}" y="${y - 1.6}" width="${fmt(w * 1.8)}" height="4.2" rx=".8" stroke-width="2"/><path d="M${p(-0.3, -1.6)}L${p(-0.3, 2.6)}M${p(0.3, -1.6)}L${p(0.3, 2.6)}M${p(-0.9, 0.5)}L${p(0.9, 0.5)}" stroke-width="1.4"/>`;
    case 'kiss':
      return `<path d="M${p(-0.15, -2)}Q${p(0.45, -1.9)} ${p(0.2, 0)}Q${p(0.45, 1.9)} ${p(-0.15, 2)}"/>`;
    case 'shocked':
      return `<rect x="${fmt(x - 2.4 * k)}" y="${y - 1.6}" width="${fmt(4.8 * k)}" height="4.6" rx="1"/>`;
  }
}

const SYMBOLS: Record<Exclude<LineAvatarRecipe['symbol'], 'none'>, string> = {
  sweat:
    '<path d="M9 9.5Q12 14 12 15.6A3 3 0 0 1 6 15.6Q6 14 9 9.5Z" fill="#cfe6f8" stroke="#5a9be0" stroke-width="1.6"/>',
  anger:
    '<g stroke="#e2565f" stroke-width="1.8"><path d="M6.5 6Q9 8 7.5 9.5M11.5 6Q9 8 10.5 9.5M6.5 13Q9 11 7.5 9.5M11.5 13Q9 11 10.5 9.5"/></g>',
  gloom:
    '<g stroke="#6b6a90" stroke-width="1.2" stroke-opacity=".75"><path d="M15 3L15 9M18.5 3L18.5 11M22 3L22 12M25.5 3L25.5 12M29 3L29 11M32.5 3L32.5 9"/></g>',
  sparkle:
    '<path d="M9 3.5Q9.6 8 13.5 8.5Q9.6 9 9 13.5Q8.4 9 4.5 8.5Q8.4 8 9 3.5Z" fill="#f4c95d" stroke="#e0a72e" stroke-width="1"/>',
  heart:
    '<path d="M9 13.5Q4.5 10.3 4.5 7.6A2.4 2.4 0 0 1 9 6.6A2.4 2.4 0 0 1 13.5 7.6Q13.5 10.3 9 13.5Z" fill="#f39bb0" stroke="#e2566c" stroke-width="1.2"/>',
  zzz: '<g stroke="#8a8792" stroke-width="1.6"><path d="M5 5L9 5L5 9L9 9M10.5 9.5L13 9.5L10.5 12L13 12"/></g>',
  note: '<g stroke="#7a5cc7" stroke-width="1.6"><path d="M10.5 4L10.5 11.5M10.5 4Q12.5 5 13.5 7"/><ellipse cx="9" cy="11.8" rx="1.8" ry="1.3" fill="#7a5cc7"/></g>',
  steam:
    '<g stroke="#a7a4b8" stroke-width="1.6"><path d="M7 11Q5 9 7 7Q9 5 7 3M11.5 11Q9.5 9 11.5 7Q13.5 5 11.5 3"/></g>',
};

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
): { eyes: string; closed: string; rest: string; morph: string } {
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
    eye(recipe.eyes, left.x, y, left.k, ink, -1) +
    (recipe.eyes === 'wink'
      ? closedEye(right.x, y, right.k)
      : eye(recipe.eyes, right.x, y, right.k, ink, 1));
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
  const expression =
    brow(recipe.brows, left.x, y - browGap, left.k, 1) +
    brow(recipe.brows, right.x, y - browGap, right.k, -1) +
    nose(recipe.nose, center, y + 3, Math.sign(yaw), ink) +
    mouth(recipe.mouth, CX + R * Math.sin(yaw) * 0.8, y + 16, Math.max(0.6, Math.cos(yaw)), ink);
  const rest =
    expression +
    cheeks(recipe.cheeks, [left.x - 1.5, right.x + 1.5], y + 10, ink) +
    glasses +
    (recipe.symbol === 'none' ? '' : `<g data-avatar-symbol="">${SYMBOLS[recipe.symbol]}</g>`);
  return {
    eyes,
    closed,
    rest,
    morph:
      eyes +
      expression +
      glasses +
      (recipe.cheeks === 'lines'
        ? cheeks('lines', [left.x - 1.5, right.x + 1.5], y + 10, ink)
        : ''),
  };
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
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="512" height="512" aria-hidden="true">',
    `<rect width="48" height="48" rx="11" fill="${recipe.backgroundColor}"/>`,
    '<g class="bh-illustrated-body"></g>',
    head(base),
    turns,
    `<path data-avatar-transition="" d="M24 24" opacity="0" ${stroke}/>`,
    `<g class="bh-illustrated-marks">${ATTENTION_MARK}</g>`,
    '</svg>',
  ].join('');
}
