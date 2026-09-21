import type { SnapshotStore } from '@deepseek-ai/dsh-client-store';

import type { BotModeMotionPreference } from '../bot-mode-settings.js';

/** Effective presentation consumed by every BotHarness animation. */
export type EffectiveMotion = 'reduce' | 'full';

/** Minimal media-query seam used by the shared policy and its tests. */
export interface SystemMotionSource {
  readonly reduced: boolean;
  subscribe(listener: (reduced: boolean) => void): () => void;
}

/** Snapshot shape required by the document-level motion boundary. */
export interface MotionPolicySnapshot {
  effectiveMotion: EffectiveMotion;
}

/** Resolve the product preference without leaking media queries into components. */
export function resolveEffectiveMotion(
  preference: BotModeMotionPreference,
  systemReduced: boolean,
): EffectiveMotion {
  if (preference === 'reduce') return 'reduce';
  if (preference === 'full') return 'full';
  return systemReduced ? 'reduce' : 'full';
}

/**
 * Build the one browser media-query adapter. Components consume the policy
 * snapshot instead of calling matchMedia themselves.
 */
export function browserSystemMotionSource(): SystemMotionSource | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  const query = window.matchMedia('(prefers-reduced-motion: reduce)');
  return {
    get reduced() {
      return query.matches;
    },
    subscribe(listener) {
      const onChange = (event: MediaQueryListEvent): void => {
        listener(event.matches);
      };
      query.addEventListener('change', onChange);
      return () => {
        query.removeEventListener('change', onChange);
      };
    },
  };
}

/**
 * Publish the effective policy once on the document root. This keeps CSS-only
 * consumers and portaled primitives on the same authority as hook consumers.
 */
export function mountMotionPolicyAttribute(
  source: SnapshotStore<MotionPolicySnapshot>,
  root: Pick<HTMLElement, 'dataset'>,
): () => void {
  const previous = root.dataset['botharnessMotion'];
  const sync = (): void => {
    root.dataset['botharnessMotion'] = source.getSnapshot().effectiveMotion;
  };
  sync();
  const unsubscribe = source.subscribe(sync);
  return () => {
    unsubscribe();
    if (previous === undefined) delete root.dataset['botharnessMotion'];
    else root.dataset['botharnessMotion'] = previous;
  };
}
