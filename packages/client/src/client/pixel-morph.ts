import type { PixelCell } from '../../../core/src/bots/avatar-appearance.js';

interface Pair {
  from: PixelCell;
  to: PixelCell;
  delay: number;
  arc: number;
}

export interface PixelMorphRun {
  current(): PixelCell[];
  cancel(): void;
  finished: Promise<boolean>;
}

const STAGGER = 0.67;

export function planPixels(from: readonly PixelCell[], to: readonly PixelCell[]): Pair[] {
  const sweep = (set: readonly PixelCell[]) => {
    const cx = set.reduce((sum, p) => sum + p.x, 0) / set.length;
    const cy = set.reduce((sum, p) => sum + p.y, 0) / set.length;
    return set
      .map((p) => ({ p, a: Math.atan2(p.y - cy, p.x - cx), r: Math.hypot(p.x - cx, p.y - cy) }))
      .sort((m, n) => m.a - n.a || m.r - n.r)
      .map((item) => item.p);
  };
  if (from.length === 0 || to.length === 0) return [];
  const source = sweep(from);
  const target = sweep(to);
  const count = Math.max(source.length, target.length);
  return Array.from({ length: count }, (_, index) => {
    const a = source[Math.floor((index * source.length) / count)]!;
    const b = target[Math.floor((index * target.length) / count)]!;
    const by = Math.floor(a.y / 4);
    const bx = Math.floor(a.x / 4);
    return {
      from: a,
      to: b,
      delay: (by / 8) * 0.28 + ((bx + by) % 2) * 0.04,
      arc: 2 + ((bx * 3 + by) % 3),
    };
  });
}

const ease = (t: number) =>
  t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;

export function pixelFrame(pairs: readonly Pair[], t: number): PixelCell[] {
  const grid = new Map<number, PixelCell>();
  for (const pair of pairs) {
    const k = ease((t - pair.delay) / STAGGER);
    const x = Math.round(pair.from.x + (pair.to.x - pair.from.x) * k);
    const y = Math.round(
      pair.from.y + (pair.to.y - pair.from.y) * k - Math.sin(k * Math.PI) * pair.arc,
    );
    if (x < 0 || y < 0 || x > 31 || y > 31) continue;
    grid.set(y * 32 + x, { x, y, c: k < 0.5 ? pair.from.c : pair.to.c });
  }
  return [...grid.values()];
}

export function pixelMarkup(cells: readonly PixelCell[]): string {
  const rows = new Map<number, Map<number, string>>();
  for (const cell of cells) {
    let row = rows.get(cell.y);
    if (!row) rows.set(cell.y, (row = new Map()));
    row.set(cell.x, cell.c);
  }
  let markup = '';
  for (const [y, row] of rows) {
    const xs = [...row.keys()].sort((a, b) => a - b);
    for (let i = 0; i < xs.length;) {
      const x = xs[i]!;
      const color = row.get(x)!;
      let width = 1;
      while (xs[i + width] === x + width && row.get(x + width) === color) width++;
      markup += `<rect x="${x}" y="${y}" width="${width}" height="1" fill="${color}"/>`;
      i += width;
    }
  }
  return markup;
}

export function morphPixels(
  group: SVGGElement,
  from: readonly PixelCell[],
  to: readonly PixelCell[],
  duration: number,
): PixelMorphRun {
  const pairs = planPixels(from, to);
  let frame = 0;
  let start = -1;
  let shown: PixelCell[] = [...from];
  let drawn = '';
  let settle: (done: boolean) => void = () => undefined;
  const finished = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  const tick = (time: number) => {
    if (start < 0) start = time;
    const t = Math.min(1, (time - start) / duration);
    shown = t >= 1 ? [...to] : pixelFrame(pairs, t);
    const markup = pixelMarkup(shown);
    if (markup !== drawn) group.innerHTML = drawn = markup;
    if (t >= 1) {
      frame = 0;
      settle(true);
      return;
    }
    frame = requestAnimationFrame(tick);
  };
  frame = requestAnimationFrame(tick);
  return {
    current: () => shown,
    cancel() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      settle(false);
    },
    finished,
  };
}
