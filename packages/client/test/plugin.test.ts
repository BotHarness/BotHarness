import { describe, expect, it, vi } from 'vitest';

import { apply, Config, name } from '../src/index.js';

describe('@botharness/ui host half', () => {
  it('exposes the plugin identity', () => {
    expect(name).toBe('botharness-client');
    expect(apply).toBeTypeOf('function');
  });

  it('projects live BOT-mode Config defaults and overrides', () => {
    const defaults = Config({});
    expect(defaults.botIcon.get()).toBe('mascot');
    expect(defaults.developerMode.get()).toBe(false);
    expect(defaults.motionPreference.get()).toBe('system');
    expect(defaults.sortMode.get()).toBe('updated');
    expect(defaults.sortModes.get()).toEqual({});

    const custom = Config({ developerMode: true, sortMode: 'manual', sortModes: { s1: 'manual' } });
    expect(custom.sortMode.get()).toBe('manual');
    expect(custom.developerMode.get()).toBe(true);
    expect(custom.sortModes.get()).toEqual({ s1: 'manual' });
  });

  it('suppresses the native generated page when its custom settings page is present', () => {
    const configure = vi.fn(() => () => undefined);
    const fiber = {};
    const ctx = {
      fiber,
      inject: (_deps: string[], callback: (ctx: unknown) => unknown) => {
        callback({ settings: { configure }, effect: (factory: () => unknown) => factory() });
      },
    };

    apply(ctx as never);

    expect(configure).toHaveBeenCalledWith({ auto: false }, fiber);
  });

  it('loads without a settings provider', () => {
    const inject = vi.fn(() => undefined);
    expect(() => {
      apply({ inject } as never);
    }).not.toThrow();
    expect(inject).toHaveBeenCalledWith(['settings'], expect.any(Function));
  });
});