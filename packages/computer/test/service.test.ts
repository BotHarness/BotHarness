import { describe, expect, it, vi } from 'vitest';

import type { ComputerProvider, ComputerStatus } from '../src/provider.js';
import { createComputerService } from '../src/service.js';

function fakeProvider(
  name: string,
  status: ComputerStatus = { state: 'running' },
): ComputerProvider {
  return {
    name,
    probe: vi.fn(async () => ({ available: true })),
    status: vi.fn(async () => status),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    upstream: vi.fn(() => new URL('https://127.0.0.1:39001/')),
  };
}

describe('ComputerService provider registration', () => {
  it('rejects a second registration, even with a different name', () => {
    const service = createComputerService();
    service.registerProvider(fakeProvider('docker'));
    expect(() => service.registerProvider(fakeProvider('other'))).toThrow(/already registered/);
    expect(service.providerName).toBe('docker');
  });

  it('reports providerName while registered and undefined after release', () => {
    const service = createComputerService();
    const release = service.registerProvider(fakeProvider('docker'));
    expect(service.providerName).toBe('docker');
    release();
    expect(service.providerName).toBeUndefined();
  });

  it('does not let a stale disposer clear a later registration', () => {
    const service = createComputerService();
    const releaseFirst = service.registerProvider(fakeProvider('first'));
    releaseFirst();
    service.registerProvider(fakeProvider('second'));
    releaseFirst();
    expect(service.providerName).toBe('second');
  });

  it('delegates lifecycle calls to the registered provider', async () => {
    const service = createComputerService();
    const provider = fakeProvider('docker');
    service.registerProvider(provider);
    await service.start();
    await service.stop();
    await expect(service.status()).resolves.toEqual({ state: 'running' });
    expect(provider.start).toHaveBeenCalledOnce();
    expect(provider.stop).toHaveBeenCalledOnce();
    expect(service.upstream()?.port).toBe('39001');
  });

  it('fails closed when no provider is registered', async () => {
    const service = createComputerService();
    await expect(service.status()).rejects.toThrow(/no provider/);
  });
});
