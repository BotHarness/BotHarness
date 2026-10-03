import { useMemo, type ReactElement } from 'react';
import {
  illustratedAvatarSvg,
  type IllustratedAvatarRecipe,
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
  recipe: IllustratedAvatarRecipe;
  state: PersonaBotActivityState;
  effect: PersonaBotActivityEffect;
  size: number;
}): ReactElement {
  const markup = useMemo(() => illustratedAvatarSvg(recipe), [recipe]);
  const mount = useMountedResource<HTMLSpanElement>(
    (node) => {
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
        stop();
        head.style.transform = 'none';
        gaze.style.transform = 'none';
        if (
          disposed ||
          !visible ||
          document.hidden ||
          document.documentElement.dataset['botharnessMotion'] === 'reduce'
        )
          return;
        const compact = size <= 64;
        const enter = head.animate(
          [{ transform: start === 'none' ? 'none' : start }, { transform: 'none' }],
          { duration: 120, easing: 'steps(2, end)' },
        );
        animations.add(enter);
        const gazeEnter = gaze.animate(
          [{ transform: gazeStart || 'none' }, { transform: 'none' }],
          { duration: 120, easing: 'steps(2, end)' },
        );
        animations.add(gazeEnter);
        Promise.all([enter.finished, gazeEnter.finished])
          .then(() => {
            animations.delete(enter);
            animations.delete(gazeEnter);
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
              visible = entries.some((entry) => entry.isIntersecting);
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
        stop();
        head.style.transform = pose;
        gaze.style.transform = gazePose;
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
