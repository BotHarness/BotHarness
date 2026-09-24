import { describe, expect, it, vi } from 'vitest';

import { apply, BotModeSettingsSchema, name } from '../src/index.js';

describe('@botharness/client host half', () => {
  it('exposes the plugin identity', () => {
    expect(name).toBe('botharness-client');
    expect(apply).toBeTypeOf('function');
  });

  it('resolves the BOT-mode section with an updated default and a per-section map', () => {
    expect(BotModeSettingsSchema({})).toEqual({
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      sortMode: 'updated',
      sortModes: {},
    });
    expect(BotModeSettingsSchema({ sortMode: 'manual' })).toEqual({
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      sortMode: 'manual',
      sortModes: {},
    });
    expect(BotModeSettingsSchema({ sortModes: { s1: 'manual' } })).toEqual({
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
    });
    expect(BotModeSettingsSchema({ motionPreference: 'full' })).toMatchObject({
      motionPreference: 'full',
      botIcon: 'mascot' as const,
      developerMode: false,
    });
  });

  it('registers the ui-bot-mode namespace when a settings provider exists', () => {
    const register = vi.fn(() => () => undefined);
    const ctx = {
      inject: (_deps: string[], callback: (ctx: unknown) => unknown) => {
        callback({ settings: { register } });
      },
    };

    apply(ctx as never);

    expect(register).toHaveBeenCalledWith('ui-bot-mode', BotModeSettingsSchema);
  });

  it('loads without a settings provider, keeping the namespace absent', () => {
    const inject = vi.fn(() => undefined);
    expect(() => {
      apply({ inject } as never);
    }).not.toThrow();
    expect(inject).toHaveBeenCalledWith(['settings'], expect.any(Function));
  });
});
