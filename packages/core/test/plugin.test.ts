import type { Context } from '@deepseek-ai/cordis';
import { describe, expect, it, vi } from 'vitest';

import { SETTINGS_NAMESPACE, apply, inject, name } from '../src/index.js';

interface StubContext {
  settings: { register: ReturnType<typeof vi.fn> };
}

function createStubContext(): StubContext {
  return { settings: { register: vi.fn(() => ({})) } };
}

describe('plugin entry', () => {
  it('declares its name and injected services', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual(['settings']);
  });

  it('registers the settings namespace on apply', () => {
    const ctx = createStubContext();

    apply(ctx as unknown as Context);

    expect(ctx.settings.register).toHaveBeenCalledTimes(1);
    const [namespace] = ctx.settings.register.mock.calls[0] ?? [];
    expect(namespace).toBe(SETTINGS_NAMESPACE);
  });
});
