import { useMemo, useRef, type ReactElement } from 'react';
import {
  AVATAR_TURNS,
  avatarSvg,
  LINE_TRANSITION_TARGETS,
  type AvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
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
}: {
  recipe: AvatarRecipe;
  state: PersonaBotActivityState;
  effect: PersonaBotActivityEffect;
  size: number;
}): ReactElement {
  const turning = state === 'thinking' && size > 64;
  const markup = useMemo(
    () => avatarSvg(recipe, turning ? { turns: AVATAR_TURNS } : {}),
    [recipe, turning],
  );
  const presentation =
    state === 'working' ? effect : state === 'thinking' ? 'thinking-dots' : 'idle';
  const shown = useRef<string | undefined>(undefined);
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
      const previous = shown.current;
      shown.current = presentation;
      let pendingTransition = previous !== undefined && previous !== presentation;
      const dotLayer = node.querySelector<SVGGElement>('[data-avatar-transition]');
      const dots = dotLayer ? [...dotLayer.querySelectorAll<SVGCircleElement>('circle')] : [];
      const head = node.querySelector<SVGGElement>('.bh-illustrated-head');
      const gaze = node.querySelector<SVGGElement>('.bh-illustrated-gaze');
      const blink = node.querySelector<SVGGElement>('.bh-illustrated-blink');
      const mark = node.querySelector<SVGGElement>(`[data-avatar-mark="${effect}"]`);
      if (!head || !gaze || !blink || typeof head.animate !== 'function') return;
      const animations = new Set<Animation>();
      let visible = true;
      let disposed = false;
      const stop = () => {
        for (const animation of animations) animation.cancel();
        animations.clear();
      };
      const loop = (target: Element, frames: Keyframe[], duration: number) =>
        animations.add(target.animate(frames, { duration, iterations: Infinity }));
      const sync = () => {
        const start = getComputedStyle(head).transform;
        const gazeStart = getComputedStyle(gaze).transform;
        const dotStarts = dots.map((dot) => getComputedStyle(dot).transform);
        const layerStart = dotLayer ? getComputedStyle(dotLayer).opacity : '0';
        const headStart = getComputedStyle(head).opacity;
        stop();
        head.style.transform = 'none';
        gaze.style.transform = 'none';
        head.style.opacity = '';
        if (dotLayer) dotLayer.style.opacity = '';
        for (const dot of dots) dot.style.transform = '';
        if (
          disposed ||
          !visible ||
          document.hidden ||
          document.documentElement.dataset['botharnessMotion'] === 'reduce'
        ) {
          pendingTransition = false;
          return;
        }
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
        const transition: Animation[] = [];
        if (pendingTransition && dotLayer && dots.length) {
          pendingTransition = false;
          const targets = LINE_TRANSITION_TARGETS[presentation] ?? LINE_TRANSITION_TARGETS['idle']!;
          const duration = compact ? 450 : 900;
          const reach = compact ? 0.55 : 1;
          transition.push(
            dotLayer.animate(
              [
                { offset: 0, opacity: Number(layerStart) || 0 },
                { offset: 0.12, opacity: 1 },
                { offset: 0.88, opacity: 1 },
                { offset: 1, opacity: 0 },
              ],
              { duration, easing: 'ease-in-out' },
            ),
            head.animate(
              [
                { offset: 0, opacity: Number(headStart) },
                { offset: 0.12, opacity: 0 },
                { offset: 0.88, opacity: 0 },
                { offset: 1, opacity: 1 },
              ],
              { duration, easing: 'ease-in-out' },
            ),
            ...dots.map((dot, index) => {
              const [tx, ty] = targets[index % targets.length]!;
              const to = `translate(${((tx - Number(dot.getAttribute('cx'))) * reach).toFixed(2)}px, ${((ty - Number(dot.getAttribute('cy'))) * reach).toFixed(2)}px)`;
              const from = dotStarts[index];
              return dot.animate(
                [
                  { offset: 0, transform: from && from !== 'none' ? from : 'translate(0px, 0px)' },
                  { offset: 0.45, transform: to },
                  { offset: 0.62, transform: to },
                  { offset: 1, transform: 'translate(0px, 0px)' },
                ],
                { duration, easing: 'ease-in-out' },
              );
            }),
          );
          for (const animation of transition) animations.add(animation);
        }
        Promise.all([enter.finished, gazeEnter.finished, ...transition.map((a) => a.finished)])
          .then(() => {
            animations.delete(enter);
            animations.delete(gazeEnter);
            for (const animation of transition) animations.delete(animation);
            if (
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
              if (mark)
                loop(
                  mark,
                  [
                    { offset: 0, opacity: 1, easing: 'steps(1, end)' },
                    { offset: 0.75, opacity: 0, easing: 'steps(1, end)' },
                  ],
                  1600,
                );
              return;
            }
            loop(head, stepped(HEAD_STEPS[effect]), compact ? 1200 : 1600);
            if (compact) return;
            const gazeSteps = [...GAZE_STEPS[effect], [0, 0] as Step];
            loop(gaze, stepped(gazeSteps, gazeSteps.length - 1), 2000);
            loop(blink, blinkFrames(gazeSteps.length - 1, gazeSteps.length), 2000);
            if (mark)
              loop(
                mark,
                [
                  { offset: 0, opacity: 1, easing: 'steps(1, end)' },
                  { offset: 0.75, opacity: 0, easing: 'steps(1, end)' },
                ],
                1600,
              );
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
        const layerOpacity = dotLayer ? getComputedStyle(dotLayer).opacity : '';
        const dotPoses = dots.map((dot) => getComputedStyle(dot).transform);
        stop();
        head.style.transform = pose;
        gaze.style.transform = gazePose;
        head.style.opacity = headOpacity;
        if (dotLayer) dotLayer.style.opacity = layerOpacity;
        dots.forEach((dot, index) => {
          dot.style.transform = dotPoses[index] ?? '';
        });
        observer?.disconnect();
        motion.disconnect();
        document.removeEventListener('visibilitychange', sync);
      };
    },
    [state, effect, size, markup],
  );
  return (
    <span
      ref={mount}
      className="bh-avatar-media bh-avatar-media-composed"
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
