import { useRef, type ReactElement } from 'react';
import type { PixelMouthState } from '../../../core/src/bots/avatar-appearance.js';
import { useMountedResource } from './mounted-resource.js';

export function AvatarSpeech({
  markup,
  mouth,
  still,
}: {
  markup: string;
  mouth: PixelMouthState;
  still: boolean;
}): ReactElement {
  const visible = useRef(true);
  const mount = useMountedResource<HTMLSpanElement>(
    (marker) => {
      const root = marker.previousElementSibling;
      if (!(root instanceof HTMLElement)) return;
      const layers = [...root.querySelectorAll<SVGGElement>('[data-avatar-mouth]')];
      const cover = root.querySelector<SVGGElement>('[data-avatar-pixel-morph]');
      const svg = cover?.ownerSVGElement;
      if (cover) layers.push(cover);
      const animations = new Map<SVGGElement, Animation>();
      let active = true;
      const cancel = () => {
        for (const [layer, animation] of animations) {
          layer.style.opacity = getComputedStyle(layer).opacity;
          animation.cancel();
        }
        animations.clear();
      };
      const sync = () => {
        if (!active) return;
        const moving =
          !still &&
          visible.current &&
          !document.hidden &&
          document.documentElement.dataset['botharnessMotion'] !== 'reduce' &&
          document.documentElement.dataset['botharnessActivity'] !== 'stale';
        const state = moving ? mouth : 'saved';
        cancel();
        root.dataset['avatarMouthState'] = state;
        svg?.toggleAttribute('data-avatar-speaking', state !== 'saved');
        for (const layer of layers) {
          const from = getComputedStyle(layer).opacity || layer.getAttribute('opacity') || '0';
          const to = (layer === cover ? state === 'saved' : layer.dataset['avatarMouth'] === state)
            ? '1'
            : '0';
          layer.style.opacity = to;
          if (moving && from !== to && typeof layer.animate === 'function') {
            const animation = layer.animate([{ opacity: from }, { opacity: to }], {
              duration: 80,
              easing: 'ease-out',
            });
            animations.set(layer, animation);
            void animation.finished
              .then(() => {
                if (animations.get(layer) === animation) animations.delete(layer);
              })
              .catch(() => undefined);
          }
        }
      };
      const observer =
        typeof IntersectionObserver === 'undefined'
          ? undefined
          : new IntersectionObserver((entries) => {
              if (!active) return;
              const next = entries.some((entry) => entry.isIntersecting);
              if (next === visible.current) return;
              visible.current = next;
              sync();
            });
      observer?.observe(root);
      const motion = new MutationObserver(sync);
      motion.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-botharness-motion', 'data-botharness-activity'],
      });
      document.addEventListener('visibilitychange', sync);
      sync();
      return () => {
        active = false;
        cancel();
        observer?.disconnect();
        motion.disconnect();
        document.removeEventListener('visibilitychange', sync);
      };
    },
    [markup, mouth, still],
  );
  return <span hidden ref={mount} />;
}
