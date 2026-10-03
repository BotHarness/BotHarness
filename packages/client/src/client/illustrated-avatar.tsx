import { useMemo, type ReactElement } from 'react';
import {
  illustratedAvatarSvg,
  type IllustratedAvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import { useMountedResource } from './mounted-resource.js';
import type { PersonaBotActivityEffect, PersonaBotActivityState } from './avatar.js';

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
      if (!head || !gaze || typeof head.animate !== 'function') return;
      const animations = new Set<Animation>();
      let visible = true;
      let disposed = false;
      const stop = () => {
        for (const animation of animations) animation.cancel();
        animations.clear();
      };
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
        const amplitude = compact ? 1 : 3;
        const poses: Record<PersonaBotActivityEffect, string> = {
          'thinking-dots': `translateY(${-amplitude / 3}%) rotate(${-amplitude}deg)`,
          searching: `translateX(${amplitude / 2}%) rotate(${amplitude}deg)`,
          coding: `translateY(${amplitude / 2}%) rotate(${-amplitude / 2}deg)`,
          executing: `rotate(${amplitude}deg)`,
          'generic-working': `translateY(${-amplitude / 2}%)`,
        };
        const reach = compact ? 0.8 : 2;
        const looks: Record<PersonaBotActivityEffect, [number, number]> = {
          'thinking-dots': [-0.8, -1],
          searching: [1.2, 0],
          coding: [0.3, 1],
          executing: [0.8, 0.3],
          'generic-working': [0, -0.5],
        };
        const look = (x: number, y: number, open = 1) =>
          `translate(${x * reach}px, ${y * reach}px) scaleY(${open})`;
        const gazeFrames = (): Keyframe[] => {
          const [x, y] = looks[effect];
          const away = effect === 'searching' ? look(-x, y) : look(x, y);
          return [
            { offset: 0, transform: look(0, 0) },
            { offset: 0.3, transform: look(x, y) },
            { offset: 0.55, transform: away },
            ...(compact
              ? []
              : [
                  { offset: 0.6, transform: look(0, 0) },
                  { offset: 0.63, transform: look(0, 0, 0.12) },
                  { offset: 0.66, transform: look(0, 0) },
                ]),
            { offset: 1, transform: look(0, 0) },
          ];
        };
        const enter = head.animate(
          [{ transform: start === 'none' ? 'none' : start }, { transform: 'none' }],
          { duration: 180, easing: 'ease-out' },
        );
        animations.add(enter);
        const gazeEnter = gaze.animate(
          [{ transform: gazeStart || 'none' }, { transform: 'none' }],
          { duration: 180, easing: 'ease-out' },
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
              if (compact) return;
              animations.add(
                gaze.animate(
                  [
                    { offset: 0, transform: look(0, 0) },
                    { offset: 0.94, transform: look(0, 0) },
                    { offset: 0.97, transform: look(0, 0, 0.12) },
                    { offset: 1, transform: look(0, 0) },
                  ],
                  { duration: 4800, iterations: Infinity, easing: 'ease-in-out' },
                ),
              );
              return;
            }
            animations.add(
              head.animate(
                [{ transform: 'none' }, { transform: poses[effect] }, { transform: 'none' }],
                { duration: compact ? 1300 : 1900, iterations: Infinity, easing: 'ease-in-out' },
              ),
            );
            animations.add(
              gaze.animate(gazeFrames(), {
                duration: compact ? 1700 : 2600,
                iterations: Infinity,
                easing: 'ease-in-out',
              }),
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
