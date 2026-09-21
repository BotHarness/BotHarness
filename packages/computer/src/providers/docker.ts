/**
 * v1 Computer Provider: one local Docker container running a Linux desktop
 * with a web VNC endpoint. The container port binds to loopback only; the Host
 * serves the authenticated viewer route in front of it.
 *
 * Startup is a background operation with a reported phase so the panel can show
 * progress (the first run pulls a large image) instead of blocking a request.
 * @module @botharness/computer/providers/docker
 */

import type {
  ComputerPhase,
  ComputerProgress,
  ComputerProvider,
  ComputerRuntimeProbe,
  ComputerRuntimeResult,
  ComputerRuntimeRunner,
  ComputerStatus,
} from '../provider.js';

export interface DockerComputerConfig {
  readonly image: string;
  readonly containerName: string;
  readonly volumeName: string;
  /** Loopback port published from the container's web VNC port. */
  readonly hostPort: number;
  readonly containerPort: number;
  readonly cpus: number;
  readonly memory: string;
  readonly shmSize: string;
  readonly idleStopMinutes: number;
}

export const DEFAULT_DOCKER_CONFIG: DockerComputerConfig = {
  image: 'lscr.io/linuxserver/chrome:latest',
  containerName: 'botharness-computer',
  volumeName: 'botharness-computer-config',
  hostPort: 39_001,
  containerPort: 3000,
  cpus: 2,
  memory: '4g',
  shmSize: '1g',
  idleStopMinutes: 30,
};

interface DockerComputerProviderOptions {
  readonly runner: ComputerRuntimeRunner;
  readonly config?: Partial<DockerComputerConfig>;
}

function combine(config: Partial<DockerComputerConfig> | undefined): DockerComputerConfig {
  return { ...DEFAULT_DOCKER_CONFIG, ...config };
}

function failure(detail: string): Error {
  return new Error(detail);
}

/**
 * Turns `docker pull` plain progress into a coarse percentage (completed
 * layers over layers seen) plus the latest terminal line. Docker prints one
 * layer id per line in non-TTY mode; we never claim precision we do not have.
 */
export function createPullTracker(now: () => number = Date.now): {
  observe(chunk: string): void;
  snapshot(): ComputerProgress;
} {
  const layers = new Map<string, { done: boolean }>();
  let text = '';
  let percent = 0;
  let updatedAt: number | undefined;

  return {
    observe(chunk: string): void {
      for (const raw of chunk.split(/[\r\n]+/)) {
        const line = raw.trim();
        if (line === '') continue;
        text = line.length > 160 ? `${line.slice(0, 157)}…` : line;
        updatedAt = now();
        const match = /^([0-9a-f]{6,64})\s*:\s*(.+)$/i.exec(line);
        if (match === null) continue;
        const id = match[1] ?? '';
        const rest = match[2] ?? '';
        if (id === '') continue;
        const entry = layers.get(id) ?? { done: false };
        if (/pull complete|already exists/i.test(rest)) entry.done = true;
        layers.set(id, entry);
        const done = [...layers.values()].filter((value) => value.done).length;
        percent = Math.round((done / layers.size) * 100);
      }
    },
    snapshot(): ComputerProgress {
      return updatedAt === undefined
        ? { percent }
        : text === ''
          ? { percent, updatedAt }
          : { percent, text, updatedAt };
    },
  };
}

export function createDockerComputerProvider(
  options: DockerComputerProviderOptions,
): ComputerProvider {
  const config = combine(options.config);
  const { runner } = options;
  let phase: ComputerPhase = 'idle';
  let detail: string | undefined;
  let running = false;
  let operation: Promise<void> | undefined;
  let pullProgress: ComputerProgress | undefined;

  const probeRuntime = async (): Promise<ComputerRuntimeProbe> => {
    const result = await runner.run(['docker', 'info', '--format', '{{.ServerVersion}}']);
    if (result.code !== 0) {
      return {
        available: false,
        detail: result.stderr.trim() || 'docker runtime is not available',
      };
    }
    return { available: true };
  };

  const inspect = async (): Promise<ComputerStatus> => {
    const result = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.State.Status}}',
      config.containerName,
    ]);
    if (result.code !== 0) {
      running = false;
      return { state: 'absent' };
    }
    const status = result.stdout.trim();
    running = status === 'running';
    if (running) return { state: 'running' };
    return status === '' ? { state: 'stopped' } : { state: 'stopped', detail: status };
  };

  const fail = (message: string): never => {
    phase = 'failed';
    detail = message;
    throw failure(message);
  };

  const runStart = async (): Promise<void> => {
    const probe = await probeRuntime();
    if (!probe.available) {
      fail(probe.detail ?? 'docker runtime is not available');
    }
    const existing = await inspect();
    if (existing.state === 'running') {
      phase = 'running';
      detail = undefined;
      return;
    }
    if (existing.state === 'stopped') {
      phase = 'starting';
      detail = '正在启动已有容器…';
      const start = await runner.run(['docker', 'start', config.containerName]);
      if (start.code !== 0) {
        fail(start.stderr.trim() || 'docker start failed');
      }
      phase = 'running';
      detail = undefined;
      running = true;
      return;
    }
    const image = await runner.run(['docker', 'image', 'inspect', config.image]);
    if (image.code !== 0) {
      phase = 'pulling';
      detail = '正在拉取镜像（首次约 1.2 GB，请耐心等待）…';
      const tracker = createPullTracker();
      pullProgress = tracker.snapshot();
      const pull: ComputerRuntimeResult =
        runner.runStreaming === undefined
          ? await runner.run(['docker', 'pull', config.image])
          : await runner.runStreaming(['docker', 'pull', config.image], (chunk) => {
              tracker.observe(chunk);
              pullProgress = tracker.snapshot();
            });
      if (pull.code !== 0) {
        fail(pull.stderr.trim() || 'docker pull failed');
      }
      pullProgress = undefined;
    }
    phase = 'starting';
    detail = '正在创建并启动容器…';
    const volume = await runner.run(['docker', 'volume', 'create', config.volumeName]);
    if (volume.code !== 0) {
      fail(volume.stderr.trim() || 'docker volume create failed');
    }
    const start = await runner.run([
      'docker',
      'run',
      '-d',
      '--name',
      config.containerName,
      '--restart',
      'unless-stopped',
      '--cpus',
      String(config.cpus),
      '--memory',
      config.memory,
      '--shm-size',
      config.shmSize,
      '-p',
      `127.0.0.1:${config.hostPort}:${config.containerPort}`,
      '-e',
      'HARDEN_DESKTOP=true',
      '-e',
      'PIXELFLUX_WAYLAND=false',
      '-v',
      `${config.volumeName}:/config`,
      config.image,
    ]);
    if (start.code !== 0) {
      fail(start.stderr.trim() || 'docker run failed');
    }
    phase = 'running';
    detail = undefined;
    running = true;
  };

  const withDetail = (status: ComputerStatus): ComputerStatus => {
    if (detail === undefined) return status;
    return { ...status, detail };
  };

  return {
    name: 'docker',
    probe: probeRuntime,
    async status(): Promise<ComputerStatus> {
      const probe = await probeRuntime();
      if (!probe.available) {
        return probe.detail === undefined
          ? { state: 'failed' }
          : { state: 'failed', detail: probe.detail };
      }
      if (phase === 'pulling' || phase === 'starting') {
        const status: ComputerStatus = { state: 'absent', phase };
        const withProgress =
          pullProgress === undefined ? status : { ...status, progress: pullProgress };
        return withDetail(withProgress);
      }
      if (phase === 'failed') {
        return withDetail({ state: 'failed', phase: 'failed' });
      }
      const status = await inspect();
      if (status.state === 'running') phase = 'running';
      return status;
    },
    async start(): Promise<void> {
      if (operation !== undefined) return operation;
      operation = runStart().finally(() => {
        operation = undefined;
      });
      return operation;
    },
    async stop(): Promise<void> {
      phase = 'stopping';
      const result = await runner.run(['docker', 'stop', config.containerName]);
      if (result.code !== 0 && !result.stderr.includes('No such container')) {
        phase = 'failed';
        detail = result.stderr.trim() || 'docker stop failed';
        throw failure(detail);
      }
      running = false;
      phase = 'idle';
      detail = undefined;
    },
    upstream(): URL | undefined {
      return running ? new URL(`http://127.0.0.1:${config.hostPort}/`) : undefined;
    },
  };
}
