import { describe, expect, it, vi } from 'vitest';

import { createIdleWatcher } from '../src/idle.js';

describe('idle watcher', () => {
  it('fires once per idle period', () => {
    let now = 0;
    const onIdle = vi.fn();
    const watcher = createIdleWatcher({ idleMs: 1000, onIdle, now: () => now });

    watcher.tick();
    expect(onIdle).not.toHaveBeenCalled();

    now = 1000;
    watcher.tick();
    watcher.tick();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('activity postpones the idle deadline and re-arms the hook', () => {
    let now = 0;
    const onIdle = vi.fn();
    const watcher = createIdleWatcher({ idleMs: 1000, onIdle, now: () => now });

    now = 900;
    watcher.touch();
    now = 1500;
    watcher.tick();
    expect(onIdle).not.toHaveBeenCalled();

    now = 2000;
    watcher.tick();
    expect(onIdle).toHaveBeenCalledTimes(1);
  });

  it('reports idleness without firing', () => {
    let now = 0;
    const watcher = createIdleWatcher({ idleMs: 500, onIdle: () => undefined, now: () => now });
    expect(watcher.isIdle()).toBe(false);
    now = 600;
    expect(watcher.isIdle()).toBe(true);
  });
});
