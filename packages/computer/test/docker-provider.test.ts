import { describe, expect, it } from 'vitest';

import type { ComputerRuntimeResult, ComputerRuntimeRunner } from '../src/provider.js';
import { createDockerComputerProvider, createPullTracker } from '../src/providers/docker.js';

function runnerWith(
  handler: (argv: readonly string[]) => ComputerRuntimeResult,
  calls: string[][] = [],
): ComputerRuntimeRunner {
  return {
    run: async (argv) => {
      calls.push([...argv]);
      return handler(argv);
    },
  };
}

const ok = (stdout = ''): ComputerRuntimeResult => ({ code: 0, stdout, stderr: '' });
const fail = (stderr: string, code = 1): ComputerRuntimeResult => ({ code, stdout: '', stderr });

describe('Docker computer provider', () => {
  it('reports an unavailable runtime without throwing', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith(() => fail('Cannot connect to the Docker daemon')),
    });
    await expect(provider.probe()).resolves.toEqual({
      available: false,
      detail: 'Cannot connect to the Docker daemon',
    });
    await expect(provider.status()).resolves.toEqual({
      state: 'failed',
      detail: 'Cannot connect to the Docker daemon',
    });
  });

  it('reads container state from docker inspect', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        return fail('unexpected');
      }),
    });
    await expect(provider.status()).resolves.toEqual({ state: 'running' });
  });

  it('treats a missing container as absent', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) =>
        argv[1] === 'info' ? ok('27.0.0') : fail('Error: No such object: botharness-computer'),
      ),
    });
    await expect(provider.status()).resolves.toEqual({ state: 'absent' });
  });

  it('starts a hardened, loopback-bound container with a persistent volume', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('Error: No such object: botharness-computer');
        if (argv[1] === 'run') return ok('container-id');
        return ok('ok');
      }, calls),
    });
    await provider.start();

    const run = calls.find((argv) => argv[1] === 'run');
    expect(run).toBeDefined();
    const flattened = (run ?? []).join(' ');
    expect(flattened).toContain('127.0.0.1:39001:3000');
    expect(flattened).toContain('HARDEN_DESKTOP=true');
    expect(flattened).toContain('PIXELFLUX_WAYLAND=false');
    expect(flattened).toContain('botharness-computer-config:/config');
    expect(calls.some((argv) => argv[1] === 'volume' && argv[2] === 'create')).toBe(true);
  });

  it('fails start when the runtime is unavailable', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith(() => fail('docker: command not found')),
    });
    await expect(provider.start()).rejects.toThrow(/docker is not available|command not found/);
  });

  it('tolerates stopping a container that no longer exists', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith(() => fail('Error response from daemon: No such container')),
    });
    await expect(provider.stop()).resolves.toBeUndefined();
  });

  it('pulls the image before the first run', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        if (argv[1] === 'pull') return ok('pulled');
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const verbs = calls.map((argv) => argv[1]);
    expect(verbs).toContain('pull');
    expect(verbs).toContain('run');
    expect(verbs.indexOf('pull')).toBeLessThan(verbs.indexOf('run'));
  });

  it('starts an existing stopped container instead of creating a new one', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('Config.Image')) return ok('botharness-computer:xfce-chrome');
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'start')).toBe(true);
    expect(calls.some((argv) => argv[1] === 'run')).toBe(false);
  });

  it('recreates the container when its image no longer matches', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('Config.Image')) return ok('old-image:latest');
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(true);
    expect(calls.some((argv) => argv[1] === 'run')).toBe(true);
    expect(calls.some((argv) => argv[1] === 'start')).toBe(false);
  });

  it('surfaces a failed pull as a failed status with detail', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        if (argv[1] === 'pull') return fail('network unreachable');
        return ok('ok');
      }),
    });
    await expect(provider.start()).rejects.toThrow(/network unreachable/);
    await expect(provider.status()).resolves.toEqual({
      state: 'failed',
      phase: 'failed',
      detail: 'network unreachable',
    });
  });

  it('tracks completed layers and the latest pull line', () => {
    let clock = 1000;
    const tracker = createPullTracker(() => clock);
    tracker.observe('abc123456789: Pulling fs layer\r\n');
    tracker.observe('def456789012: Pulling fs layer\r\n');
    tracker.observe('abc123456789: Pull complete\r\n');
    const half = tracker.snapshot();
    expect(half.percent).toBe(50);
    expect(half.text).toContain('abc123456789');
    expect(half.updatedAt).toBe(1000);
    clock = 4000;
    tracker.observe('def456789012: Pull complete\r\n');
    const complete = tracker.snapshot();
    expect(complete.percent).toBe(100);
    expect(complete.updatedAt).toBe(4000);
  });

  it('exports by stopping, tarring, and restarting', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        return ok('ok');
      }, calls),
    });
    const archive = await provider.exportTo?.('/tmp/exports');
    expect(archive).toMatch(/botharness-computer-config-.*\.tar$/);
    const verbs = calls.map((argv) => argv[1]);
    expect(verbs).toContain('stop');
    expect(verbs).toContain('run');
    expect(verbs).toContain('start');
    expect(verbs.indexOf('stop')).toBeLessThan(verbs.indexOf('run'));
    const tar = calls.find((argv) => argv[1] === 'run');
    expect((tar ?? []).join(' ')).toContain('tar cf /backup/');
  });

  it('imports by creating the volume, untarring, and starting', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        return ok('ok');
      }, calls),
    });
    await provider.importFrom?.('/tmp/exports/botharness-computer-config-2026.tar');
    const verbs = calls.map((argv) => argv[1]);
    expect(verbs).toContain('volume');
    expect(verbs).toContain('run');
    const untar = calls.find((argv) => argv[1] === 'run');
    expect((untar ?? []).join(' ')).toContain('tar xf /backup/');
  });

  it('builds the shipped image context when the image is missing', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
      config: { imageContext: '/pkg/image', buildOnMissing: true },
    });
    await provider.start();
    const build = calls.find((argv) => argv[1] === 'build');
    expect((build ?? []).join(' ')).toContain('/pkg/image');
    expect(calls.some((argv) => argv[1] === 'pull')).toBe(false);
  });

  it('passes the requested desktop locale into the container', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        return ok('ok');
      }, calls),
      getLanguage: () => 'zh_CN.UTF-8',
    });
    await provider.start();
    const run = (calls.find((argv) => argv[1] === 'run') ?? []).join(' ');
    expect(run).toContain('LANG=zh_CN.UTF-8');
    expect(run).toContain('LC_ALL=zh_CN.UTF-8');
  });

  it('honors the hardening switch in the container environment', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        return ok('ok');
      }, calls),
      config: { hardenDesktop: false },
    });
    await provider.start();
    const run = calls.find((argv) => argv[1] === 'run');
    expect((run ?? []).join(' ')).toContain('HARDEN_DESKTOP=false');
  });

  it('restarts the Computer when export fails after stopping it', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        if (argv[1] === 'run') return fail('tar: write error');
        return ok('ok');
      }, calls),
    });
    await expect(provider.exportTo?.('/tmp/exports')).rejects.toThrow(/write error/);
    const verbs = calls.map((argv) => argv[1]);
    expect(verbs).toContain('stop');
    expect(verbs.filter((verb) => verb === 'start').length).toBeGreaterThanOrEqual(1);
  });

  it('cancels an in-flight start when stop is requested', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: {
        run: async (argv) => {
          calls.push([...argv]);
          if (argv[1] === 'info') return ok('27.0.0');
          if (argv[1] === 'inspect') return fail('No such object');
          if (argv[1] === 'image') return fail('No such image');
          return ok('ok');
        },
        runStreaming: async (_argv, onChunk) => {
          onChunk('abc123456789: Pulling fs layer\n');
          await gate;
          return ok('pulled');
        },
      },
    });
    const starting = provider.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const stopping = provider.stop();
    release();
    await expect(starting).rejects.toThrow(/cancelled/);
    await stopping;
    expect(calls.some((argv) => argv[1] === 'run')).toBe(false);
  });

  it('streams pull output into status progress while starting', async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started = false;
    const provider = createDockerComputerProvider({
      runner: {
        run: async (argv) => {
          if (argv[1] === 'info') return ok('27.0.0');
          if (argv[1] === 'inspect') return started ? ok('running\n') : fail('No such object');
          if (argv[1] === 'image') return fail('No such image');
          return ok('ok');
        },
        runStreaming: async (_argv, onChunk) => {
          onChunk('abc123456789: Pulling fs layer\n');
          await gate;
          onChunk('abc123456789: Pull complete\n');
          started = true;
          return ok('pulled');
        },
      },
    });
    const starting = provider.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const status = await provider.status();
    expect(status.phase).toBe('pulling');
    expect(status.progress?.percent).toBe(0);
    expect(status.progress?.text).toContain('abc123456789');
    release();
    await starting;
    await expect(provider.status()).resolves.toEqual({ state: 'running' });
  });
});
