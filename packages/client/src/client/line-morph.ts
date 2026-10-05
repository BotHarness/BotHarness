import {
  allocOutputs,
  buildPlan,
  interpPolar,
  resampleIcon,
  serialize,
  Spring,
  type IconNode,
  type Sampled,
} from 'morphicons';
import type { LineMorphNode } from '../../../core/src/bots/avatar-appearance.js';

export type LineMorphSpring = { readonly k: number; readonly c: number };

export interface LineMorphRun {
  readonly finished: Promise<boolean>;
  current(): Sampled[];
  velocity(): number;
  cancel(): void;
}

const SAMPLES = 48;

function transform(
  nodes: readonly LineMorphNode[],
  map: (x: number, y: number) => readonly [number, number],
): Sampled[] {
  return resampleIcon(nodes as unknown as IconNode, SAMPLES).map(({ pts, closed }) => {
    const next = new Float64Array(pts.length);
    for (let i = 0; i < pts.length; i += 2) {
      const [x, y] = map(pts[i]!, pts[i + 1]!);
      next[i] = x;
      next[i + 1] = y;
    }
    return { pts: next, closed };
  });
}

export function sampleLineFace(face: {
  nodes: readonly LineMorphNode[];
  pivot: readonly [number, number];
  tilt: number;
}): Sampled[] {
  const a = (face.tilt * Math.PI) / 180;
  const [px, py] = face.pivot;
  return transform(face.nodes, (x, y) => [
    px + (x - px) * Math.cos(a) - (y - py) * Math.sin(a),
    py + (x - px) * Math.sin(a) + (y - py) * Math.cos(a),
  ]);
}

export function sampleLineSymbol(nodes: readonly LineMorphNode[], scale: number): Sampled[] {
  return transform(nodes, (x, y) => [24 + (x - 24) * scale, 24 + (y - 24) * scale]);
}

export function lineMorphD(shape: readonly Sampled[]): string {
  return serialize(
    shape.map((sub) => sub.pts),
    shape.map((sub) => sub.closed),
  );
}

const tickers = new Set<(time: number) => void>();
let loopId = 0;

function loop(time: number): void {
  for (const tick of [...tickers]) tick(time);
  loopId = tickers.size > 0 ? requestAnimationFrame(loop) : 0;
}

function addTicker(tick: (time: number) => void): void {
  tickers.add(tick);
  if (loopId === 0) loopId = requestAnimationFrame(loop);
}

function removeTicker(tick: (time: number) => void): void {
  tickers.delete(tick);
  if (tickers.size === 0 && loopId !== 0) {
    cancelAnimationFrame(loopId);
    loopId = 0;
  }
}

export function morphLinePath(
  path: SVGPathElement,
  from: readonly Sampled[],
  to: readonly Sampled[],
  spring: LineMorphSpring,
  velocity: number,
  onNear?: () => void,
): LineMorphRun {
  const plan = buildPlan(from, to);
  const out = allocOutputs(plan);
  const closed = plan.items.map((item) => item.closed);
  const motion = new Spring();
  motion.config(spring.k, spring.c);
  motion.v = velocity;
  motion.start();
  let last = -1;
  let settle: (done: boolean) => void = () => undefined;
  const finished = new Promise<boolean>((resolve) => {
    settle = resolve;
  });
  let near = !onNear;
  const render = () => {
    if (!near && motion.x >= 0.9) {
      near = true;
      onNear?.();
    }
    interpPolar(plan, motion.x, out);
    path.setAttribute('d', serialize(out, closed));
  };
  const tick = (time: number) => {
    const dt = last < 0 ? 0 : Math.min(Math.max((time - last) / 1000, 0), 0.1);
    last = time;
    const done = motion.step(dt);
    if (done) {
      motion.x = 1;
      motion.v = 0;
      render();
      removeTicker(tick);
      settle(true);
      return;
    }
    render();
  };
  render();
  addTicker(tick);
  return {
    finished,
    current: () =>
      out.map((pts, index) => ({ pts: Float64Array.from(pts), closed: closed[index]! })),
    velocity: () => motion.v,
    cancel: () => {
      removeTicker(tick);
      settle(false);
    },
  };
}
