import { useMemo, useRef, type ReactElement } from 'react';
import {
  AVATAR_TURNS,
  avatarSvg,
  LINE_MORPH_SYMBOLS,
  lineMorphFace,
  pixelFaceCells,
  pixelSymbolCells,
  type AvatarRecipe,
  type PixelCell,
  type PixelSymbol,
} from '../../../core/src/bots/avatar-appearance.js';
import { morphPixels, pixelMarkup, type PixelMorphRun } from './pixel-morph.js';
import type { Sampled } from 'morphicons';
import {
  lineMorphD,
  morphLinePath,
  sampleLineFace,
  sampleLineSymbol,
  type LineMorphRun,
} from './line-morph.js';
import { useMountedResource } from './mounted-resource.js';
import type { PersonaBotActivityEffect, PersonaBotActivityState } from './avatar.js';

type Step = readonly [number, number];

const HEAD_STEPS: Record<PersonaBotActivityEffect, readonly Step[]> = {
  'thinking-dots': [
    [0, 0],
    [0, -1],
    [0, -1],
    [0, 0],
  ],
  searching: [
    [0, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  coding: [
    [0, 0],
    [0, 1],
    [0, 1],
    [0, 0],
  ],
  executing: [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, -1],
  ],
  'generic-working': [
    [0, 0],
    [0, -1],
    [0, 0],
    [0, 0],
  ],
};

const GAZE_STEPS: Record<PersonaBotActivityEffect, readonly Step[]> = {
  'thinking-dots': [
    [0, 0],
    [-1, -1],
    [-1, -1],
    [0, 0],
  ],
  searching: [
    [0, 0],
    [-1, 0],
    [0, 0],
    [1, 0],
  ],
  coding: [
    [0, 0],
    [0, 1],
    [0, 1],
    [0, 0],
  ],
  executing: [
    [0, 0],
    [1, 0],
    [1, 0],
    [0, 0],
  ],
  'generic-working': [
    [0, 0],
    [0, 0],
    [1, 0],
    [0, 0],
  ],
};

const LARGE_SPRING = { k: 420, c: 30 };
const SMALL_SPRING = { k: 760, c: 54 };

interface Flight {
  shape?: Sampled[];
  velocity: number;
  phase?: 'out' | 'back';
}

/** Pixel-family whole-Avatar morph: the transition length and the shortest time a symbol stays. */
export const PIXEL_MORPH_MS = 800;
export const PIXEL_SYMBOL_HOLD_MS = 500;

interface PixelShown {
  key?: PixelSymbol | 'face';
  cells?: PixelCell[];
  since: number;
}

const TURN_STEPS = 40;
const TURN_STEP_MS = 220;

function turnSchedule(phase: number): number[] {
  const steps = [0, ...AVATAR_TURNS].sort((a, b) => a - b);
  return Array.from({ length: TURN_STEPS }, (_, index) => {
    const t = (index / TURN_STEPS) * Math.PI * 2;
    const noise =
      0.62 * Math.sin(t + phase) +
      0.3 * Math.sin(3 * t + phase * 1.7 + 1.3) +
      0.22 * Math.sin(5 * t + phase * 0.6 + 0.4);
    const scaled = Math.max(-1, Math.min(1, noise / 0.85));
    return steps[Math.round(((scaled + 1) / 2) * (steps.length - 1))]!;
  });
}

const shift = ([x, y]: Step) => `translate(${x}px, ${y}px)`;
const stepped = (steps: readonly Step[], blinkAt?: number): Keyframe[] =>
  steps.map((step, index) => ({
    offset: index / steps.length,
    transform: shift(step),
    opacity: index === blinkAt ? 0 : 1,
    easing: 'steps(1, end)',
  }));
const blinkFrames = (blinkAt: number, count: number): Keyframe[] =>
  Array.from({ length: count }, (_, index) => ({
    offset: index / count,
    opacity: index === blinkAt ? 1 : 0,
    easing: 'steps(1, end)',
  }));

export function IllustratedAvatar({
  recipe,
  state,
  effect,
  size,
  symbol,
}: {
  recipe: AvatarRecipe;
  state: PersonaBotActivityState;
  effect: PersonaBotActivityEffect;
  size: number;
  /** Pixel family: the symbol the whole Avatar morphs into; undefined shows the face. */
  symbol?: PixelSymbol | undefined;
}): ReactElement {
  const turning = state === 'thinking' && size > 64;
  const markup = useMemo(
    () => avatarSvg(recipe, turning ? { turns: AVATAR_TURNS } : {}),
    [recipe, turning],
  );
  const presentation =
    state === 'working' ? effect : state === 'thinking' ? 'thinking-dots' : 'idle';
  const shown = useRef<string | undefined>(undefined);
  const flight = useRef<Flight>({ velocity: 0 });
  const pixel = useRef<PixelShown>({ since: 0 });
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const previous = shown.current;
      shown.current = presentation;
      let pendingTransition = previous !== undefined && previous !== presentation;
      const morphPath = node.querySelector<SVGPathElement>('path[data-avatar-transition]');
      const head = node.querySelector<SVGGElement>('.bh-illustrated-head');
      const gaze = node.querySelector<SVGGElement>('.bh-illustrated-gaze');
      const blink = node.querySelector<SVGGElement>('.bh-illustrated-blink');
      const pixelGroup = node.querySelector<SVGGElement>('[data-avatar-pixel-morph]');
      if (!head || !gaze || !blink || typeof head.animate !== 'function') return;
      const animations = new Set<Animation>();
      let visible = true;
      let disposed = false;
      let run: LineMorphRun | undefined;
      let pixelRun: { run: PixelMorphRun; key: PixelSymbol | 'face' } | undefined;
      let pixelTimer: ReturnType<typeof setTimeout> | undefined;
      let pause: { timer: ReturnType<typeof setTimeout>; done(value: boolean): void } | undefined;
      const halt = () => {
        if (pixelTimer) clearTimeout(pixelTimer);
        pixelTimer = undefined;
        if (pixelRun) {
          pixel.current = { key: pixelRun.key, cells: pixelRun.run.current(), since: 0 };
          pixelRun.run.cancel();
          pixelRun = undefined;
        }
        if (run) {
          flight.current.shape = run.current();
          flight.current.velocity = run.velocity();
          run.cancel();
          run = undefined;
        }
        if (pause) {
          clearTimeout(pause.timer);
          pause.done(false);
          pause = undefined;
        }
      };
      const stop = () => {
        halt();
        for (const animation of animations) animation.cancel();
        animations.clear();
      };
      const fade = (target: SVGElement, to: number, duration: number) => {
        const from = Number(getComputedStyle(target).opacity || '1');
        target.style.opacity = String(to);
        if (from !== to)
          target.animate([{ opacity: from }, { opacity: to }], {
            duration,
            easing: 'ease-in-out',
          });
      };
      const leg = async (
        path: SVGPathElement,
        from: Sampled[],
        to: Sampled[],
        phase: 'out' | 'back',
        onNear?: () => void,
      ) => {
        flight.current.phase = phase;
        const current = morphLinePath(path, from, to, spring(), flight.current.velocity, onNear);
        run = current;
        const done = await current.finished;
        if (!done) return false;
        run = undefined;
        flight.current.shape = current.current();
        flight.current.velocity = 0;
        return true;
      };
      const spring = () => (size <= 64 ? SMALL_SPRING : LARGE_SPRING);
      const wait = (ms: number) =>
        new Promise<boolean>((resolve) => {
          pause = {
            timer: setTimeout(() => {
              pause = undefined;
              resolve(true);
            }, ms),
            done: resolve,
          };
        });
      const morph = async (path: SVGPathElement, phase: 'out' | 'back') => {
        if (recipe.family !== 'line') return;
        const compact = size <= 64;
        const face = sampleLineFace(lineMorphFace(recipe));
        const symbol = sampleLineSymbol(
          LINE_MORPH_SYMBOLS[presentation] ?? LINE_MORPH_SYMBOLS['idle']!,
          compact ? 0.8 : 1,
        );
        const start = flight.current.shape ?? face;
        path.setAttribute('d', lineMorphD(start));
        const fresh = !flight.current.shape;
        const blend = compact ? 120 : 200;
        fade(head, 0, blend);
        fade(path, 1, blend);
        if (fresh && !(await wait(blend * 0.6))) return;
        if (phase === 'out') {
          if (!(await leg(path, start, symbol, 'out'))) return;
          if (!(await wait(compact ? 140 : 380))) return;
        }
        const reveal = () => {
          fade(path, 0, blend * 1.4);
          fade(head, 1, blend * 1.4);
        };
        if (!(await leg(path, flight.current.shape ?? symbol, face, 'back', reveal))) return;
        flight.current = { velocity: 0 };
      };
      const settle = (path: SVGPathElement, phase: 'out' | 'back') =>
        morph(path, phase).catch(() => {
          flight.current = { velocity: 0 };
          path.style.opacity = '';
          head.style.opacity = '';
        });
      const showPixels = (still: boolean) => {
        if (!pixelGroup || recipe.family !== 'illustrated') return;
        const svg = pixelGroup.ownerSVGElement;
        const target = symbol ?? 'face';
        const cellsFor = (key: PixelSymbol | 'face') =>
          key === 'face' ? pixelFaceCells(recipe) : pixelSymbolCells(key, recipe.hairColor);
        const draw = (key: PixelSymbol | 'face', cells?: readonly PixelCell[]) => {
          if (key === 'face' && !cells) {
            pixelGroup.innerHTML = '';
            svg?.removeAttribute('data-pixel-cover');
            return;
          }
          pixelGroup.innerHTML = pixelMarkup(cells ?? cellsFor(key));
          svg?.setAttribute('data-pixel-cover', '');
        };
        const previous = pixel.current;
        if (still || previous.key === undefined) {
          draw(target);
          pixel.current = { key: target, since: performance.now() };
          return;
        }
        if (previous.key === target && !previous.cells) {
          draw(target);
          return;
        }
        const from = previous.cells ?? cellsFor(previous.key);
        draw(previous.key, from);
        const start = () => {
          pixelTimer = undefined;
          const run = morphPixels(pixelGroup, from, cellsFor(target), PIXEL_MORPH_MS);
          pixelRun = { run, key: target };
          void run.finished.then((done) => {
            if (!done) return;
            pixelRun = undefined;
            pixel.current = { key: target, since: performance.now() };
            if (target === 'face') draw('face');
          });
        };
        const held = performance.now() - previous.since;
        if (!previous.cells && previous.key !== 'face' && held < PIXEL_SYMBOL_HOLD_MS)
          pixelTimer = setTimeout(start, PIXEL_SYMBOL_HOLD_MS - held);
        else start();
      };
      const loop = (target: Element, frames: Keyframe[], duration: number) =>
        animations.add(target.animate(frames, { duration, iterations: Infinity }));
      const sync = () => {
        const start = getComputedStyle(head).transform;
        const gazeStart = getComputedStyle(gaze).transform;
        stop();
        head.style.transform = 'none';
        gaze.style.transform = 'none';
        head.style.opacity = '';
        if (morphPath) morphPath.style.opacity = '';
        if (
          disposed ||
          !visible ||
          document.hidden ||
          document.documentElement.dataset['botharnessMotion'] === 'reduce'
        ) {
          pendingTransition = false;
          flight.current = { velocity: 0 };
          if (!disposed) showPixels(true);
          return;
        }
        showPixels(false);
        const compact = size <= 64;
        const enter = head.animate([{ transform: start || 'none' }, { transform: 'none' }], {
          duration: 120,
          easing: 'steps(2, end)',
        });
        animations.add(enter);
        const gazeEnter = gaze.animate(
          [{ transform: gazeStart || 'none' }, { transform: 'none' }],
          { duration: 120, easing: 'steps(2, end)' },
        );
        animations.add(gazeEnter);
        let morphing: Promise<void> = Promise.resolve();
        if (morphPath && (pendingTransition || flight.current.phase)) {
          const phase = pendingTransition ? 'out' : flight.current.phase!;
          pendingTransition = false;
          morphing = settle(morphPath, phase);
        }
        Promise.all([enter.finished, gazeEnter.finished, morphing])
          .then(() => {
            animations.delete(enter);
            animations.delete(gazeEnter);
            if (
              flight.current.phase ||
              disposed ||
              !visible ||
              document.hidden ||
              document.documentElement.dataset['botharnessMotion'] === 'reduce'
            )
              return;
            if (state !== 'thinking' && state !== 'working') {
              if (compact || state !== 'idle') return;
              const rest: Step[] = Array.from({ length: 12 }, () => [0, 0]);
              loop(gaze, stepped(rest, 11), 4800);
              loop(blink, blinkFrames(11, 12), 4800);
              return;
            }
            const turns = [...node.querySelectorAll<SVGGElement>('[data-avatar-turn]')];
            const body = node.querySelector<SVGGElement>('.bh-illustrated-body');
            if (turns.length && body) {
              const schedule = turnSchedule((markup.length % 97) / 15.4);
              const frames = (delta: number): Keyframe[] =>
                schedule.map((value, index) => ({
                  offset: index / schedule.length,
                  opacity: value === delta ? 1 : 0,
                  easing: 'steps(1, end)',
                }));
              const duration = TURN_STEPS * TURN_STEP_MS;
              loop(head, frames(0), duration);
              loop(body, frames(0), duration);
              for (const turn of turns)
                loop(turn, frames(Number(turn.dataset['avatarTurn'])), duration);
              return;
            }
            loop(head, stepped(HEAD_STEPS[effect]), compact ? 1200 : 1600);
            if (compact) return;
            const gazeSteps = [...GAZE_STEPS[effect], [0, 0] as Step];
            loop(gaze, stepped(gazeSteps, gazeSteps.length - 1), 2000);
            loop(blink, blinkFrames(gazeSteps.length - 1, gazeSteps.length), 2000);
          })
          .catch(() => undefined);
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver((entries) => {
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible) return;
              visible = next;
              sync();
            });
      observer?.observe(node);
      const motion = new MutationObserver(sync);
      motion.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-botharness-motion'],
      });
      document.addEventListener('visibilitychange', sync);
      sync();
      return () => {
        disposed = true;
        const pose = getComputedStyle(head).transform;
        const gazePose = getComputedStyle(gaze).transform;
        const headOpacity = getComputedStyle(head).opacity;
        stop();
        head.style.transform = pose;
        gaze.style.transform = gazePose;
        head.style.opacity = headOpacity;
        observer?.disconnect();
        motion.disconnect();
        document.removeEventListener('visibilitychange', sync);
      };
    },
    [state, effect, size, markup, recipe, presentation, symbol],
  );
  return (
    <span
      ref={mount}
      className="bh-avatar-media bh-avatar-media-composed"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
