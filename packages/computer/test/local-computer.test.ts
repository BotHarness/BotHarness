import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Config, DEFAULT_CONFIG } from '../src/index.js';
import { createComputerTargetRuntime, type ComputerTarget } from '../src/target.js';
import { createLocalComputerProvider } from '../src/providers/local.js';
import { createLocalCuaDriver, installLocalDriver } from '../src/tool/local-driver.js';
import type { CuaDriver } from '../src/tool/driver.js';
import type { ComputerProvider, ComputerRuntimeRunner } from '../src/provider.js';

const dirs: string[] = [];
afterEach(async () => {
  for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true });
});

function fakeDriver(permissions = { accessibility: true, screen_recording: true }): CuaDriver {
  return {
    ensure: vi.fn(async () => ({ status: 'present' as const, arch: 'darwin-universal' })),
    tools: vi.fn(async () => []),
    call: vi.fn(async () => ({ structuredContent: permissions })),
    close: vi.fn(async () => undefined),
  };
}
const runner = (): ComputerRuntimeRunner => ({
  run: vi.fn(async () => ({ code: 0, stdout: '{"ok":true}', stderr: '' })),
});

function fakeRuntime(target: ComputerTarget) {
  const driver = fakeDriver();
  const provider: ComputerProvider = {
    name: target,
    probe: vi.fn(async () => ({ available: true })),
    status: vi.fn(async () => ({ state: 'running' as const })),
    start: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    upstream: () => (target === 'container' ? new URL('http://127.0.0.1:3000') : undefined),
    exportTo: vi.fn(async () => '/exports/proof.tar'),
    importFrom: vi.fn(async () => undefined),
  };
  return { provider, driver };
}

describe('macOS Local Computer', () => {
  it('keeps legacy schema rows container while the fresh Bundle default is local', () => {
    expect(DEFAULT_CONFIG.target).toBe('local');
    expect(Config({}).target.get()).toBe('container');
    expect(Config({ target: 'local' }).target.get()).toBe('local');
    expect(() => Config(JSON.parse('{"target":"remote"}'))).toThrow();
  });

  it('checks doctor and actual read-only OS grants without invoking Docker', async () => {
    const driver = fakeDriver();
    const processRunner = runner();
    const provider = createLocalComputerProvider({
      driver,
      runner: processRunner,
      platform: 'darwin',
    });
    expect(await provider.status()).toEqual({ state: 'stopped' });
    expect(processRunner.run).not.toHaveBeenCalled();
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
    expect(provider.upstream()).toBeUndefined();
    expect(driver.call).toHaveBeenCalledWith(
      'check_permissions',
      { prompt: false },
      expect.any(AbortSignal),
    );
    expect(
      vi.mocked(processRunner.run).mock.calls.every(([args]) => !args.includes('docker')),
    ).toBe(true);
    await provider.stop();
    expect(await provider.status()).toEqual({ state: 'stopped' });
  });

  it('refuses missing permission, closes its process and allows a fresh explicit check', async () => {
    const driver = fakeDriver({ accessibility: false, screen_recording: true });
    const provider = createLocalComputerProvider({ driver, runner: runner(), platform: 'darwin' });
    await expect(provider.start()).rejects.toThrow('Accessibility and Screen Recording');
    expect(await provider.status()).toMatchObject({ state: 'failed' });
    expect(driver.call).toHaveBeenCalledTimes(1);
    expect(driver.close).toHaveBeenCalledTimes(1);
    vi.mocked(driver.call).mockResolvedValue({
      structuredContent: { accessibility: true, screen_recording: true },
    });
    await provider.start();
    expect(await provider.status()).toMatchObject({ state: 'running' });
  });

  it('refuses another OS before installation or a Docker probe', async () => {
    const processRunner = runner();
    const driver = createLocalCuaDriver({ runner: processRunner, platform: 'linux' });
    await expect(driver.ensure()).rejects.toThrow('macOS');
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('refuses an incorrect download checksum before extraction or executable launch', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bh694-install-test-'));
    dirs.push(dir);
    const processRunner = runner();
    await expect(
      installLocalDriver({
        dir,
        runner: processRunner,
        download: async () => new Uint8Array([1, 2, 3]),
      }),
    ).rejects.toThrow('checksum mismatch');
    expect(processRunner.run).not.toHaveBeenCalled();
  });

  it('does not become ready if cancelled while setup is in flight', async () => {
    const driver = fakeDriver();
    let finish: (() => void) | undefined;
    vi.mocked(driver.ensure).mockImplementation(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { status: 'present' as const, arch: 'darwin-universal' };
    });
    const provider = createLocalComputerProvider({ driver, runner: runner(), platform: 'darwin' });
    const preparing = provider.start();
    const stopping = provider.stop();
    finish?.();
    await expect(preparing).rejects.toThrow('cancelled');
    await stopping;
    expect(await provider.status()).toEqual({ state: 'stopped' });
  });
});

describe('Profile Computer Target lifecycle', () => {
  it('creates only the selected strategy and refuses archive transfer in local mode', async () => {
    const factory = vi.fn(fakeRuntime);
    const runtime = createComputerTargetRuntime({
      target: () => 'local',
      create: factory,
      onChange: vi.fn(),
    });
    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith('local');
    await runtime.provider.start();
    expect(runtime.isRunning()).toBe(true);
    await expect(runtime.provider.exportTo?.('/tmp')).rejects.toThrow('Container Computer');
    await runtime.dispose();
    await expect(runtime.driver.call('click', {})).rejects.toThrow('Target changed');
  });

  it('refuses stale actions immediately and clears grants before switching, while preserving container transfer', async () => {
    let target: ComputerTarget = 'container';
    const old = fakeRuntime('container');
    const next = fakeRuntime('local');
    const onChange = vi.fn();
    const runtime = createComputerTargetRuntime({
      target: () => target,
      create: (value) => (value === 'container' ? old : next),
      onChange,
    });
    await expect(runtime.provider.exportTo?.('/exports')).resolves.toBe('/exports/proof.tar');
    target = 'local';
    expect(runtime.isRunning()).toBe(false);
    await expect(runtime.driver.call('click', {})).rejects.toThrow('Target changed');
    expect(old.driver.call).not.toHaveBeenCalled();
    await runtime.sync();
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(old.provider.stop).toHaveBeenCalledTimes(1);
    expect(runtime.provider.name).toBe('local');
    expect(runtime.isRunning()).toBe(false);
    await runtime.provider.start();
    expect(runtime.isRunning()).toBe(true);
    await runtime.driver.call('click', {});
    expect(next.driver.call).toHaveBeenCalledTimes(1);
  });
});
