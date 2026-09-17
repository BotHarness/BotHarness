import type { Context } from '@deepseek-ai/cordis';
import { describe, expect, it, vi } from 'vitest';

import { SETTINGS_NAMESPACE, apply, inject, name } from '../src/index.js';

interface StubContext {
  settings: { register: ReturnType<typeof vi.fn> };
  provide: ReturnType<typeof vi.fn>;
}

function createStubContext(): StubContext {
  return { settings: { register: vi.fn(() => ({})) }, provide: vi.fn() };
}

describe('plugin entry', () => {
  it('declares its identity', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual(['settings']);
  });

  it('registers settings and provides the core on apply', () => {
    const ctx = createStubContext();

    apply(ctx as unknown as Context);

    expect(ctx.settings.register).toHaveBeenCalledTimes(1);
    expect(ctx.settings.register.mock.calls[0]?.[0]).toBe(SETTINGS_NAMESPACE);
    expect(ctx.provide).toHaveBeenCalledTimes(1);
    const [serviceName, service] = ctx.provide.mock.calls[0] ?? [];
    expect(serviceName).toBe('botharness');
    expect(service).toMatchObject({
      rootDir: expect.stringContaining('botharness'),
      registry: expect.anything(),
      states: expect.anything(),
    });
  });
});
