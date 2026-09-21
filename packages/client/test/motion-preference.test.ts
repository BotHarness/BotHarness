import { describe, expect, it, vi } from 'vitest';

import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import {
  mountMotionPolicyAttribute,
  resolveEffectiveMotion,
  type SystemMotionSource,
} from '../src/client/motion-preference.js';

function fakeSystemMotion(initial: boolean) {
  let reduced = initial;
  const listeners = new Set<(next: boolean) => void>();
  const unsubscribe = vi.fn();
  const source: SystemMotionSource = {
    get reduced() {
      return reduced;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        unsubscribe();
      };
    },
  };
  return {
    source,
    unsubscribe,
    push(next: boolean) {
      reduced = next;
      for (const listener of listeners) listener(next);
    },
  };
}

describe('BotHarness motion policy', () => {
  it.each([
    ['system', false, 'full'],
    ['system', true, 'reduce'],
    ['reduce', false, 'reduce'],
    ['reduce', true, 'reduce'],
    ['full', false, 'full'],
    ['full', true, 'full'],
  ] as const)('resolves %s with system reduced=%s to %s', (preference, reduced, expected) => {
    expect(resolveEffectiveMotion(preference, reduced)).toBe(expected);
  });

  it('follows runtime system changes only while the preference is system', () => {
    const system = fakeSystemMotion(false);
    const prefs = new BotModePrefs();
    const detach = prefs.attachSystemMotion(system.source);

    expect(prefs.source.getSnapshot().effectiveMotion).toBe('full');
    system.push(true);
    expect(prefs.source.getSnapshot().effectiveMotion).toBe('reduce');

    prefs.setMotionPreference('full');
    system.push(true);
    expect(prefs.source.getSnapshot().effectiveMotion).toBe('full');

    prefs.setMotionPreference('reduce');
    system.push(false);
    expect(prefs.source.getSnapshot().effectiveMotion).toBe('reduce');

    prefs.setMotionPreference('system');
    expect(prefs.source.getSnapshot().effectiveMotion).toBe('full');

    detach();
    system.push(true);
    expect(prefs.source.getSnapshot().effectiveMotion).toBe('full');
    expect(system.unsubscribe).toHaveBeenCalledOnce();
  });

  it('publishes one document boundary and restores the previous host value on cleanup', () => {
    const prefs = new BotModePrefs();
    const root = { dataset: { botharnessMotion: 'host-value' } };
    const cleanup = mountMotionPolicyAttribute(prefs.source, root as never);

    expect(root.dataset.botharnessMotion).toBe('full');
    prefs.setMotionPreference('reduce');
    expect(root.dataset.botharnessMotion).toBe('reduce');

    cleanup();
    expect(root.dataset.botharnessMotion).toBe('host-value');
  });
});
