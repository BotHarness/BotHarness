/**
 * v1 Computer Provider: one local Docker container running a Linux desktop
 * with a web VNC endpoint. The container port binds to loopback only; the Host
 * serves the authenticated viewer route in front of it.
 *
 * Startup is a background operation with a reported phase so the panel can show
 * progress (the first run pulls a large image) instead of blocking a request.
 * @module @botharness/computer/providers/docker
 */

import { basename, dirname, join } from 'node:path';

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
  /** Caps the container's process count so a runaway app cannot fork-bomb the host. */
  readonly pidsLimit: number;
  readonly idleStopMinutes: number;
  /** HARDEN_DESKTOP removes terminals/sudo; a full desktop usually wants it off. */
  readonly hardenDesktop: boolean;
  /** Locale the desktop runs in, e.g. zh_CN.UTF-8. */
  readonly language: string;
}

export const DEFAULT_DOCKER_CONFIG: DockerComputerConfig = {
  // The upstream webtop image already ships an XFCE desktop, Chromium and the
  // en_US/zh_CN locales, so BotHarness pulls it instead of building its own.
  image: 'lscr.io/linuxserver/webtop:ubuntu-xfce',
  containerName: 'botharness-computer',
  volumeName: 'botharness-computer-config',
  hostPort: 39_001,
  containerPort: 3000,
  cpus: 2,
  memory: '2g',
  shmSize: '512m',
  pidsLimit: 4096,
  idleStopMinutes: 30,
  hardenDesktop: true,
  language: 'en_US.UTF-8',
};

interface DockerComputerProviderOptions {
  readonly runner: ComputerRuntimeRunner;
  readonly config?: Partial<DockerComputerConfig>;
  /** Receives container state transitions for the plugin diagnostics stream. */
  readonly onEvent?: (detail: string) => void;
  /** Resolved at start time so a viewer can choose the desktop language. */
  readonly getLanguage?: () => string;
  /** Probed for HTTP 200 before start reports running; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Bound for the desktop-readiness wait; defaults to DESKTOP_READY_TIMEOUT_MS. */
  readonly readyTimeoutMs?: number;
  /** Wait primitive; defaults to setTimeout. Injected in tests for instant time. */
  readonly sleepImpl?: (ms: number) => Promise<void>;
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

/** Bound for the desktop-readiness wait inside start (staged, cancellable). */
export const DESKTOP_READY_TIMEOUT_MS = 90_000;

/** Per-attempt ceiling so a hung connection cannot block stop. */
const DESKTOP_PROBE_TIMEOUT_MS = 3_000;

/** Parses a docker size string (`2g`, `2gb`, `512m`, `1048576`) into bytes. */
export function parseDockerSize(value: string): number | undefined {
  const match = /^(\d+(?:\.\d+)?)\s*([kmg]?b?)$/i.exec(value.trim());
  if (match === null) return undefined;
  const amount = Number(match[1] ?? '');
  if (!Number.isFinite(amount)) return undefined;
  const unit = (match[2] ?? '').toLowerCase();
  const factor = unit.startsWith('g')
    ? 1024 ** 3
    : unit.startsWith('m')
      ? 1024 ** 2
      : unit.startsWith('k')
        ? 1024
        : 1;
  return Math.round(amount * factor);
}

export function createDockerComputerProvider(
  options: DockerComputerProviderOptions,
): ComputerProvider {
  const config = combine(options.config);
  const { runner, onEvent, getLanguage, fetchImpl, readyTimeoutMs, sleepImpl } = options;
  let phase: ComputerPhase = 'idle';
  let detail: string | undefined;
  let running = false;
  let operation: Promise<void> | undefined;
  let pullProgress: ComputerProgress | undefined;
  let lifecycle: Promise<unknown> = Promise.resolve();
  let cancelRequested = false;
  let lastObservedState: string | undefined;

  /** Serializes lifecycle operations so a stop cannot race an in-flight start. */
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = lifecycle.then(task, task);
    lifecycle = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  /** Aborts an in-flight start at its next checkpoint when a stop was requested. */
  const throwIfCancelled = (): void => {
    if (!cancelRequested) return;
    cancelRequested = false;
    phase = 'idle';
    detail = undefined;
    throw new Error('computer start cancelled');
  };

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

  const observe = (state: string, detail: string | undefined): void => {
    if (lastObservedState === state) return;
    const from = lastObservedState ?? 'unknown';
    lastObservedState = state;
    onEvent?.(`container ${from} → ${state}${detail === undefined ? '' : ` (${detail})`}`);
  };

  const inspect = async (): Promise<ComputerStatus> => {
    const result = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.State.Status}} {{.State.ExitCode}}',
      config.containerName,
    ]);
    if (result.code !== 0) {
      running = false;
      observe('absent', undefined);
      return { state: 'absent' };
    }
    const [status = '', exitCode = ''] = result.stdout.trim().split(/\s+/);
    running = status === 'running';
    if (running) {
      observe('running', undefined);
      return { state: 'running' };
    }
    const detail = status === '' ? undefined : `${status} code=${exitCode}`;
    observe(status === '' ? 'stopped' : status, detail);
    return detail === undefined ? { state: 'stopped' } : { state: 'stopped', detail };
  };

  const fail = (message: string): never => {
    phase = 'failed';
    detail = message;
    throw failure(message);
  };

  /** The image the existing container was created from, if it still exists. */
  const containerImage = async (): Promise<string | undefined> => {
    const result = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.Config.Image}}',
      config.containerName,
    ]);
    return result.code === 0 ? result.stdout.trim() : undefined;
  };

  /**
   * `docker start` applies none of the `docker run` arguments, so a container
   * whose image or managed settings changed must be recreated — the named
   * volume keeps the desktop. The locale is deliberately excluded: it follows
   * the viewer's language, and recreating a live desktop to change its locale
   * would destroy work in progress, so it applies on the next creation.
   * Returns true when the container was removed.
   */
  const recreateIfSpecChanged = async (): Promise<boolean> => {
    const spec = await runner.run([
      'docker',
      'inspect',
      '--format',
      '{{.Config.Image}}|{{.HostConfig.Memory}}|{{.HostConfig.MemorySwap}}|{{.HostConfig.NanoCpus}}|{{.HostConfig.ShmSize}}|{{.HostConfig.PidsLimit}}|{{range .Config.Env}}{{println .}}{{end}}',
      config.containerName,
    ]);
    if (spec.code !== 0) return false;
    const [image = '', memory = '', swap = '', nanoCpus = '', shmSize = '', pids = '', ...env] =
      spec.stdout.split('|');
    const expectedMemory = parseDockerSize(config.memory);
    const expectedShm = parseDockerSize(config.shmSize);
    const envText = env.join('|');
    const managedEnv = [
      `HARDEN_DESKTOP=${config.hardenDesktop ? 'true' : 'false'}`,
      'PIXELFLUX_WAYLAND=false',
    ];
    // An unparseable configured size cannot be verified, so it never forces a
    // recreate: an unknown value must not restart the desktop on every start.
    const matches =
      image.trim() === config.image &&
      (expectedMemory === undefined || memory.trim() === String(expectedMemory)) &&
      (expectedMemory === undefined || swap.trim() === String(expectedMemory)) &&
      nanoCpus.trim() === String(Math.round(config.cpus * 1_000_000_000)) &&
      (expectedShm === undefined || shmSize.trim() === String(expectedShm)) &&
      pids.trim() === String(config.pidsLimit) &&
      managedEnv.every((entry) => envText.includes(entry));
    if (matches) return false;
    const remove = await runner.run(['docker', 'rm', '-f', config.containerName]);
    if (remove.code !== 0) fail(remove.stderr.trim() || 'docker rm failed');
    running = false;
    observe('absent', `spec changed (${image.trim()} → ${config.image})`);
    return true;
  };

  /**
   * The base image ships Chromium, but a shortcut inside the volume is only
   * created at start: build-time writes under /config are shadowed by the
   * mounted volume, and the volume may predate this version. Best effort.
   */
  const ensureDesktopShortcut = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      'test -f /config/Desktop/chromium.desktop || { mkdir -p /config/Desktop && cp -f /usr/share/applications/chromium.desktop /config/Desktop/chromium.desktop && chmod +x /config/Desktop/chromium.desktop && chown abc:abc /config/Desktop /config/Desktop/chromium.desktop; }; command -v google-chrome-stable >/dev/null 2>&1 || rm -f /config/Desktop/google-chrome.desktop',
    ]);
    if (result.code !== 0) {
      onEvent?.('desktop shortcut could not be prepared');
    }
  };

  /**
   * A clean desktop stop makes Chromium forget open tabs: its default session
   * policy opens a new-tab page, and only a crashed session is restored. A
   * managed policy tells it to restore the previous session instead, so tabs
   * survive stop → start the same way they survive export → import today (a
   * tar taken while the browser runs keeps the crashed-session marker).
   * Policies live outside the profile so Chromium never rewrites them, and
   * they apply on the browser's next launch — safe to write while it runs.
   * Best effort.
   */
  const ensureSessionRestore = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      `mkdir -p /etc/chromium/policies/managed && printf '%s' '{"RestoreOnStartup":1}' > /etc/chromium/policies/managed/botharness.json`,
    ]);
    if (result.code !== 0) {
      onEvent?.('session-restore policy could not be prepared');
    }
  };

  /**
   * The stock desktop chrome is drawn for a large monitor: a 26px top bar and
   * a 48px dock look tiny inside the viewer. Panels are fixed pixels (they do
   * not follow the already-2x Xft DPI), so seed bigger defaults: top bar 52
   * with 32px icons, dock 96. Chromium gets an autostart entry so a reboot
   * reopens the browser and the session-restore policy brings its tabs back.
   * Both edits run in a helper container while the desktop is down — xfconfd
   * would overwrite a live edit — and only touch stock or previously-seeded
   * values, so a Human's own customization (or a deleted autostart entry) is
   * never overwritten and reruns are no-ops. Best effort: a fresh volume has
   * no config yet and migrates on the next start.
   */
  const ensureDesktopDefaults = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      '-v',
      `${config.volumeName}:/data`,
      config.image,
      '-c',
      `f=/data/.config/xfce4/xfconf/xfce-perchannel-xml/xfce4-panel.xml; test -f "$f" && sed -i 's/name="icon-size" type="uint" value="16"/name="icon-size" type="uint" value="32"/; s/name="icon-size" type="uint" value="24"/name="icon-size" type="uint" value="32"/; s/name="size" type="uint" value="26"/name="size" type="uint" value="52"/; s/name="size" type="uint" value="40"/name="size" type="uint" value="52"/; s/name="size" type="uint" value="48"/name="size" type="uint" value="96"/; s/name="size" type="uint" value="64"/name="size" type="uint" value="96"/' "$f"; a=/data/.config/autostart/chromium.desktop; test -f "$a" || { mkdir -p /data/.config/autostart && printf '%s\\n' '[Desktop Entry]' 'Type=Application' 'Name=Chromium' 'Exec=chromium --no-first-run' 'OnlyShowIn=XFCE;' 'X-GNOME-Autostart-enabled=true' > "$a"; }; exit 0`,
    ]);
    if (result.code !== 0) {
      onEvent?.('desktop defaults could not be prepared');
    }
  };

  /**
   * The durable workspace convention (#154): Human- and bot-produced files
   * belong in `~/workspace` (HOME is `/config`, so the path sits on the named
   * volume), separate from the browser profile at `~/.config/chromium`. Seeded
   * at every start so the path exists on a fresh volume and travels through
   * export → import. Best effort.
   */
  const ensureWorkspaceDir = async (): Promise<void> => {
    const result = await runner.run([
      'docker',
      'exec',
      config.containerName,
      'sh',
      '-c',
      'mkdir -p /config/workspace && chown abc:abc /config/workspace',
    ]);
    if (result.code !== 0) {
      onEvent?.('workspace directory could not be prepared');
    }
  };

  /**
   * Best-effort graceful browser shutdown before an export: SIGTERM lets
   * Chromium flush cookies, history, and open tabs so the tar below sees a
   * consistent profile instead of a torn write. Bounded at ~10s; a timeout or
   * failure falls through to `docker stop`, where the managed RestoreOnStartup
   * policy still recovers the session. No-op while the container is down.
   */
  const quiesceBrowser = async (): Promise<void> => {
    const current = await inspect();
    if (current.state !== 'running') return;
    phase = 'stopping';
    detail = '正在关闭浏览器…';
    const script =
      'term_browsers() { for p in /proc/[0-9]*; do c=$(cat "$p/comm" 2>/dev/null) || continue; case "$c" in chromium|chrome) kill -TERM "$(basename "$p")" 2>/dev/null ;; esac; done; }; term_browsers; i=0; while [ "$i" -lt 20 ]; do alive=0; for p in /proc/[0-9]*; do c=$(cat "$p/comm" 2>/dev/null) || continue; case "$c" in chromium|chrome) alive=1 ;; esac; done; [ "$alive" -eq 0 ] && exit 0; sleep 0.5; i=$((i + 1)); done; exit 0';
    const result = await runner.run(['docker', 'exec', config.containerName, 'sh', '-c', script]);
    if (result.code !== 0) {
      onEvent?.('browser quiesce skipped');
    }
  };

  /**
   * `docker start` returns as soon as the container process exists — the
   * desktop (X, XFCE, Selkies) still needs seconds. Flipping `running` before
   * the web endpoint serves mounts the viewer into a dead port, so every path
   * into running waits here for HTTP 200 first: bounded, staged, and
   * cancellable like the rest of start.
   */
  const waitForDesktop = async (): Promise<void> => {
    const timeoutMs = readyTimeoutMs ?? DESKTOP_READY_TIMEOUT_MS;
    const delay =
      sleepImpl ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
    const probeFetch = fetchImpl ?? globalThis.fetch;
    phase = 'starting';
    detail = '正在等待桌面响应…';
    const startedAt = Date.now();
    for (;;) {
      throwIfCancelled();
      try {
        const response = await probeFetch(`http://127.0.0.1:${config.hostPort}/`, {
          signal: AbortSignal.timeout(DESKTOP_PROBE_TIMEOUT_MS),
        });
        await response.arrayBuffer();
        if (response.ok) return;
      } catch {
        // Not serving yet — keep waiting inside the bound.
      }
      if (Date.now() - startedAt > timeoutMs) {
        fail(`桌面在 ${Math.round(timeoutMs / 1000)} 秒内未响应，请重试启动`);
      }
      await delay(1000);
    }
  };

  /** Gate the desktop, then promote to running. */
  const confirmRunning = async (): Promise<void> => {
    await waitForDesktop();
    phase = 'running';
    detail = undefined;
    running = true;
  };

  const runStart = async (): Promise<void> => {
    cancelRequested = false;
    const probe = await probeRuntime();
    throwIfCancelled();
    if (!probe.available) {
      fail(probe.detail ?? 'docker runtime is not available');
    }
    const existing = await inspect();
    throwIfCancelled();
    if (existing.state === 'running' && !(await recreateIfSpecChanged())) {
      await confirmRunning();
      await ensureDesktopShortcut();
      await ensureSessionRestore();
      await ensureWorkspaceDir();
      return;
    }
    if (existing.state === 'stopped' && !(await recreateIfSpecChanged())) {
      phase = 'starting';
      detail = '正在启动已有容器…';
      throwIfCancelled();
      await ensureDesktopDefaults();
      const start = await runner.run(['docker', 'start', config.containerName]);
      if (start.code !== 0) {
        fail(start.stderr.trim() || 'docker start failed');
      }
      await confirmRunning();
      await ensureDesktopShortcut();
      await ensureSessionRestore();
      await ensureWorkspaceDir();
      return;
    }
    const image = await runner.run(['docker', 'image', 'inspect', config.image]);
    throwIfCancelled();
    if (image.code !== 0) {
      phase = 'pulling';
      detail = '正在拉取镜像（首次约 1.5 GB，请耐心等待）…';
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
      throwIfCancelled();
    }
    phase = 'starting';
    detail = '正在创建并启动容器…';
    const volume = await runner.run(['docker', 'volume', 'create', config.volumeName]);
    if (volume.code !== 0) {
      fail(volume.stderr.trim() || 'docker volume create failed');
    }
    throwIfCancelled();
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
      '--memory-swap',
      config.memory,
      '--pids-limit',
      String(config.pidsLimit),
      '--shm-size',
      config.shmSize,
      '-p',
      `127.0.0.1:${config.hostPort}:${config.containerPort}`,
      '-e',
      `HARDEN_DESKTOP=${config.hardenDesktop ? 'true' : 'false'}`,
      '-e',
      `LANG=${getLanguage?.() ?? config.language}`,
      '-e',
      `LC_ALL=${getLanguage?.() ?? config.language}`,
      '-e',
      'PIXELFLUX_WAYLAND=false',
      '-v',
      `${config.volumeName}:/config`,
      config.image,
    ]);
    if (start.code !== 0) {
      fail(start.stderr.trim() || 'docker run failed');
    }
    if (cancelRequested) {
      cancelRequested = false;
      await runner.run(['docker', 'stop', config.containerName]);
      running = false;
      phase = 'idle';
      detail = undefined;
      throw new Error('computer start cancelled');
    }
    await confirmRunning();
    await ensureDesktopShortcut();
    await ensureSessionRestore();
    await ensureWorkspaceDir();
  };

  const withDetail = (status: ComputerStatus): ComputerStatus => {
    if (detail === undefined) return status;
    return { ...status, detail };
  };

  const ensureStopped = async (reason: string): Promise<boolean> => {
    const current = await inspect();
    if (current.state !== 'running') return false;
    phase = 'stopping';
    detail = reason;
    const stop = await runner.run(['docker', 'stop', config.containerName]);
    if (stop.code !== 0) fail(stop.stderr.trim() || 'docker stop failed');
    running = false;
    return true;
  };

  const exportTo = async (destDir: string): Promise<string> => {
    await quiesceBrowser();
    const wasRunning = await ensureStopped('正在停止容器以导出…');
    phase = 'exporting';
    detail = '正在打包 Computer 数据…';
    const archive = `${config.volumeName}-${new Date().toISOString().replace(/[:.]/g, '-')}.tar`;
    try {
      const tar = await runner.run([
        'docker',
        'run',
        '--rm',
        '--entrypoint',
        '/bin/sh',
        '-v',
        `${config.volumeName}:/data`,
        '-v',
        `${destDir}:/backup`,
        config.image,
        '-c',
        `tar cf /backup/${archive} -C /data .`,
      ]);
      if (tar.code !== 0) fail(tar.stderr.trim() || 'computer export failed');
      phase = 'idle';
      detail = undefined;
      return join(destDir, archive);
    } finally {
      if (wasRunning) {
        const start = await runner.run(['docker', 'start', config.containerName]);
        if (start.code !== 0) {
          fail(start.stderr.trim() || 'docker start failed');
        } else {
          // Soft gate: the archive is already written, and an unconfirmed
          // desktop must never become a silent black-screen running — leave
          // it unflagged (a later start re-gates) and record the evidence.
          let confirmed = false;
          try {
            await waitForDesktop();
            confirmed = true;
          } catch {
            onEvent?.('desktop readiness unconfirmed after export restart');
          }
          running = confirmed;
          phase = 'idle';
          detail = undefined;
        }
      }
    }
  };

  const importFrom = async (archive: string): Promise<void> => {
    await ensureStopped('正在停止容器以导入…');
    phase = 'importing';
    detail = '正在恢复 Computer 数据…';
    const volume = await runner.run(['docker', 'volume', 'create', config.volumeName]);
    if (volume.code !== 0) fail(volume.stderr.trim() || 'docker volume create failed');
    const untar = await runner.run([
      'docker',
      'run',
      '--rm',
      '--entrypoint',
      '/bin/sh',
      '-v',
      `${config.volumeName}:/data`,
      '-v',
      `${dirname(archive)}:/backup`,
      config.image,
      '-c',
      `tar xf /backup/${basename(archive)} -C /data`,
    ]);
    if (untar.code !== 0) fail(untar.stderr.trim() || 'computer import failed');
    phase = 'idle';
    detail = undefined;
    await runStart();
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
      if (phase === 'stopping' || phase === 'exporting' || phase === 'importing') {
        return withDetail({ ...status, phase });
      }
      if (status.state === 'running') phase = 'running';
      return status;
    },
    async start(): Promise<void> {
      if (operation !== undefined) return operation;
      operation = enqueue(runStart).finally(() => {
        operation = undefined;
      });
      return operation;
    },
    async stop(): Promise<void> {
      cancelRequested = true;
      await enqueue(async () => {
        phase = 'stopping';
        detail = undefined;
        const result = await runner.run(['docker', 'stop', config.containerName]);
        if (result.code !== 0 && !result.stderr.includes('No such container')) {
          phase = 'failed';
          detail = result.stderr.trim() || 'docker stop failed';
          throw failure(detail);
        }
        running = false;
        phase = 'idle';
        detail = undefined;
      });
    },
    upstream(): URL | undefined {
      return running ? new URL(`http://127.0.0.1:${config.hostPort}/`) : undefined;
    },
    exportTo: (destDir: string) => enqueue(() => exportTo(destDir)),
    importFrom: (archive: string) => enqueue(() => importFrom(archive)),
  };
}
