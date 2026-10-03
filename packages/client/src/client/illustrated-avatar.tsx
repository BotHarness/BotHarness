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
        const amplitude = size <= 64 ? 1 : 3;
        const poses: Record<PersonaBotActivityEffect, string> = {
          'thinking-dots': `rotate(${-amplitude}deg)`,
          searching: `translateX(${amplitude}%) rotate(${amplitude}deg)`,
          coding: `translateY(${amplitude}%) rotate(${-amplitude}deg)`,
          executing: `rotate(${amplitude}deg)`,
          'generic-working': `translateY(${-amplitude}%)`,
        };
        const enter = head.animate(
          [{ transform: start === 'none' ? 'none' : start }, { transform: 'none' }],
          { duration: 180, easing: 'ease-out' },
        );
        animations.add(enter);
        enter.finished
          .then(() => {
            animations.delete(enter);
            if (state !== 'thinking' && state !== 'working') return;
            if (
              disposed ||
              !visible ||
              document.hidden ||
              document.documentElement.dataset['botharnessMotion'] === 'reduce'
            )
              return;
            animations.add(
              head.animate(
                [{ transform: 'none' }, { transform: poses[effect] }, { transform: 'none' }],
                { duration: size <= 64 ? 1300 : 1900, iterations: Infinity, easing: 'ease-in-out' },
              ),
            );
            animations.add(
              gaze.animate(
                [
                  { transform: 'translateX(0)' },
                  { transform: `translateX(${effect === 'searching' ? amplitude : -amplitude}px)` },
                  { transform: 'translateX(0)' },
                ],
                { duration: 1700, iterations: Infinity, easing: 'ease-in-out' },
              ),
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
        stop();
        head.style.transform = pose;
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
