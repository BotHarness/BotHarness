import { describe, expect, it } from 'vitest';

import type { ComputerRuntimeResult, ComputerRuntimeRunner } from '../src/provider.js';
import {
  DEFAULT_DOCKER_CONFIG,
  createDockerComputerProvider,
  createPullTracker,
  parseDockerSize,
} from '../src/providers/docker.js';

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

/** One `docker inspect` spec line: image | memory | swap | nanoCpus | shm | pids | env. */
function specLine(
  patch: {
    image?: string;
    memory?: string;
    swap?: string;
    nanoCpus?: string;
    shm?: string;
    pids?: string;
    env?: readonly string[];
  } = {},
): ComputerRuntimeResult {
  const image = patch.image ?? 'lscr.io/linuxserver/webtop:ubuntu-xfce';
  const memory = patch.memory ?? String(2 * 1024 ** 3);
  const swap = patch.swap ?? memory;
  const nanoCpus = patch.nanoCpus ?? String(2_000_000_000);
  const shm = patch.shm ?? String(512 * 1024 ** 2);
  const pids = patch.pids ?? '4096';
  const env = patch.env ?? ['HARDEN_DESKTOP=true', 'PIXELFLUX_WAYLAND=false'];
  return ok(`${image}|${memory}|${swap}|${nanoCpus}|${shm}|${pids}|${env.join('\n')}\n`);
}

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
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'start')).toBe(true);
    // Helper one-shots run with --rm; only a persistent container creation counts.
    expect(calls.some((argv) => argv[1] === 'run' && !argv.includes('--rm'))).toBe(false);
  });

  it('recreates a running container whose spec no longer matches', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine({ image: 'old-image:latest' });
          return ok('running\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(true);
    expect(calls.some((argv) => argv[1] === 'run')).toBe(true);
  });

  it('recreates the container when its spec no longer matches', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine({ image: 'old-image:latest' });
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

  it('quiesces the browser before stopping for an export', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        return ok('ok');
      }, calls),
    });
    await provider.exportTo?.('/tmp/exports');
    const verbs = calls.map((argv) => argv[1]);
    const execIndex = calls.findIndex((argv) => argv[1] === 'exec');
    expect(execIndex).toBeGreaterThanOrEqual(0);
    const quiesce = (calls[execIndex] ?? []).join(' ');
    expect(quiesce).toContain('kill -TERM');
    expect(quiesce).toContain('chromium');
    expect(execIndex).toBeLessThan(verbs.indexOf('stop'));
  });

  it('skips the browser quiesce when the container is not running', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('exited\n');
        return ok('ok');
      }, calls),
    });
    const archive = await provider.exportTo?.('/tmp/exports');
    expect(archive).toMatch(/\.tar$/);
    expect(calls.some((argv) => argv[1] === 'exec')).toBe(false);
    expect(calls.some((argv) => argv[1] === 'run')).toBe(true);
  });

  it('still exports when the browser quiesce fails', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return ok('running\n');
        if (argv[1] === 'exec') return fail('exec refused');
        return ok('ok');
      }),
    });
    await expect(provider.exportTo?.('/tmp/exports')).resolves.toMatch(/\.tar$/);
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

  it('recreates when a managed resource setting changed', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory'))
            return specLine({ memory: String(4 * 1024 ** 3) });
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(true);
    expect(calls.some((argv) => argv[1] === 'run')).toBe(true);
  });

  it('prepares the shortcut for a container that was already running', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('running\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(false);
    expect(calls.some((argv) => argv[1] === 'start')).toBe(false);
    expect((calls.find((argv) => argv[1] === 'exec') ?? []).join(' ')).toContain(
      'chromium.desktop',
    );
  });

  it('parses docker size strings', () => {
    expect(parseDockerSize('2g')).toBe(2 * 1024 ** 3);
    expect(parseDockerSize('2gb')).toBe(2 * 1024 ** 3);
    expect(parseDockerSize('2G')).toBe(2 * 1024 ** 3);
    expect(parseDockerSize('512m')).toBe(512 * 1024 ** 2);
    expect(parseDockerSize('512mb')).toBe(512 * 1024 ** 2);
    expect(parseDockerSize('1024k')).toBe(1024 * 1024);
    expect(parseDockerSize('1048576b')).toBe(1_048_576);
    expect(parseDockerSize('1048576')).toBe(1_048_576);
    expect(parseDockerSize('')).toBeUndefined();
    expect(parseDockerSize('lots')).toBeUndefined();
  });

  it('never recreates for a size it cannot verify', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
      config: { memory: '2 gibibytes' },
    });
    await provider.start();
    expect(calls.some((argv) => argv[1] === 'rm')).toBe(false);
    expect(calls.some((argv) => argv[1] === 'start')).toBe(true);
  });

  it('bounds memory, swap and process count on the container', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const run = (calls.find((argv) => argv[1] === 'run') ?? []).join(' ');
    expect(run).toContain('--memory 2g');
    expect(run).toContain('--memory-swap 2g');
    expect(run).toContain('--pids-limit 4096');
    expect(run).toContain('--shm-size 512m');
  });

  it('ships 2C2G defaults that stay overridable per Host', async () => {
    expect(DEFAULT_DOCKER_CONFIG).toMatchObject({
      cpus: 2,
      memory: '2g',
      shmSize: '512m',
      pidsLimit: 4096,
      idleStopMinutes: 30,
    });

    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('Error: No such container');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
      config: { cpus: 4, memory: '4g', shmSize: '1g', pidsLimit: 8192 },
    });
    await provider.start();
    const run = (calls.find((argv) => argv[1] === 'run') ?? []).join(' ');
    expect(run).toContain('--cpus 4');
    expect(run).toContain('--memory 4g');
    expect(run).toContain('--memory-swap 4g');
    expect(run).toContain('--shm-size 1g');
    expect(run).toContain('--pids-limit 8192');
  });

  it('prepares the Chromium shortcut in the volume after start', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const exec = (calls.find((argv) => argv[1] === 'exec') ?? []).join(' ');
    expect(exec).toContain('chromium.desktop');
  });

  it('seeds the Chromium session-restore policy after start', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const execs = calls.filter((argv) => argv[1] === 'exec').map((argv) => argv.join(' '));
    const policy = execs.find((command) => command.includes('RestoreOnStartup'));
    expect(policy).toContain('/etc/chromium/policies/managed/botharness.json');
    expect(policy).toContain('"RestoreOnStartup":1');
  });

  it('seeds the durable workspace directory after start', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const execs = calls.filter((argv) => argv[1] === 'exec').map((argv) => argv.join(' '));
    expect(execs.some((command) => command.includes('mkdir -p /config/workspace'))).toBe(true);
    expect(execs.some((command) => command.includes('chown abc:abc /config/workspace'))).toBe(true);
  });

  it('still starts when the session-restore policy cannot be written', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') return fail('No such object');
        if (argv[1] === 'image') return fail('No such image');
        if (argv[1] === 'exec') return fail('read-only filesystem');
        return ok('ok');
      }),
    });
    await expect(provider.start()).resolves.toBeUndefined();
  });

  it('seeds desktop defaults before starting a stopped container', async () => {
    const calls: string[][] = [];
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('exited\n');
        }
        return ok('ok');
      }, calls),
    });
    await provider.start();
    const seed = calls.find(
      (argv) => argv.includes('--rm') && argv.join(' ').includes('xfce4-panel.xml'),
    );
    expect(seed?.join(' ')).toContain('value="52"');
    expect(seed?.join(' ')).toContain('value="96"');
    expect(seed?.join(' ')).toContain('autostart/chromium.desktop');
    expect(calls.some((argv) => argv[1] === 'start')).toBe(true);
  });

  it('still starts when desktop defaults cannot be prepared', async () => {
    const provider = createDockerComputerProvider({
      runner: runnerWith((argv) => {
        if (argv[1] === 'info') return ok('27.0.0');
        if (argv[1] === 'inspect') {
          const format = argv.join(' ');
          if (format.includes('HostConfig.Memory')) return specLine();
          return ok('exited\n');
        }
        if (argv.includes('--rm')) return fail('image not present');
        return ok('ok');
      }),
    });
    await expect(provider.start()).resolves.toBeUndefined();
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
