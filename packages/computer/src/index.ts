import { spawn } from 'node:child_process';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';

import { createIdleWatcher } from './idle.js';
import { DEFAULT_DOCKER_CONFIG, createDockerComputerProvider } from './providers/docker.js';
import type { ComputerRuntimeResult, ComputerRuntimeRunner } from './provider.js';
import { createComputerService, type ComputerService } from './service.js';
import { ViewerProxy, proxyUpgrade } from './viewer.js';

export const name = 'botharness-computer';

export interface ComputerConfig {
  enabled: boolean;
  image: string;
  containerName: string;
  volumeName: string;
  hostPort: number;
  cpus: number;
  memory: string;
  shmSize: string;
  idleStopMinutes: number;
}

export const DEFAULT_CONFIG: ComputerConfig = {
  enabled: true,
  image: DEFAULT_DOCKER_CONFIG.image,
  containerName: DEFAULT_DOCKER_CONFIG.containerName,
  volumeName: DEFAULT_DOCKER_CONFIG.volumeName,
  hostPort: DEFAULT_DOCKER_CONFIG.hostPort,
  cpus: DEFAULT_DOCKER_CONFIG.cpus,
  memory: DEFAULT_DOCKER_CONFIG.memory,
  shmSize: DEFAULT_DOCKER_CONFIG.shmSize,
  idleStopMinutes: DEFAULT_DOCKER_CONFIG.idleStopMinutes,
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Computer'),
  image: Schema.string().default(DEFAULT_CONFIG.image),
  containerName: Schema.string().default(DEFAULT_CONFIG.containerName),
  volumeName: Schema.string().default(DEFAULT_CONFIG.volumeName),
  hostPort: Schema.number().default(DEFAULT_CONFIG.hostPort),
  cpus: Schema.number().default(DEFAULT_CONFIG.cpus),
  memory: Schema.string().default(DEFAULT_CONFIG.memory),
  shmSize: Schema.string().default(DEFAULT_CONFIG.shmSize),
  idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes),
});

/** Runs one argv array through `node:child_process` without a shell. */
export function createProcessRunner(): ComputerRuntimeRunner {
  const spawnOnce = (
    argv: readonly string[],
    onChunk?: (chunk: string) => void,
  ): Promise<ComputerRuntimeResult> =>
    new Promise((resolve) => {
      const child = spawn(argv[0] ?? '', argv.slice(1), {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        onChunk?.(text);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        onChunk?.(text);
      });
      child.on('error', (error) => {
        resolve({ code: -1, stdout, stderr: `${stderr}${String(error)}` });
      });
      child.on('close', (code) => {
        resolve({ code: code ?? -1, stdout, stderr });
      });
    });

  return {
    run: (argv) => spawnOnce(argv),
    runStreaming: (argv, onChunk) => spawnOnce(argv, onChunk),
  };
}

/** Structural view of the Host services this plugin optionally consumes. */
interface HostConnectionLike {
  readonly fetch: {
    register(route: {
      readonly path: string;
      readonly methods: readonly string[];
      readonly requestBody: 'buffered' | 'streaming';
      readonly fetch: (request: Request) => Promise<Response>;
    }): () => Promise<void>;
  };
  readonly requestRejection: (request: { readonly headers: Headers }) => number | undefined;
}

interface HostWebServerLike {
  register(route: {
    readonly kind: 'exact' | 'prefix';
    readonly path: string;
    readonly handler: (request: unknown, response: unknown) => void | Promise<void>;
  }): () => void;
  registerUpgrade?(route: {
    readonly path: string;
    readonly handler: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  }): () => void;
}

export const VIEWER_PREFIX = '/botharness-computer/viewer';

export function apply(ctx: Context, config: ComputerConfig): void {
  if (!config.enabled) return;

  const service: ComputerService = createComputerService();
  const provider = createDockerComputerProvider({
    runner: createProcessRunner(),
    config: {
      image: config.image,
      containerName: config.containerName,
      volumeName: config.volumeName,
      hostPort: config.hostPort,
      cpus: config.cpus,
      memory: config.memory,
      shmSize: config.shmSize,
      idleStopMinutes: config.idleStopMinutes,
    },
  });

  const release = service.registerProvider(provider);
  ctx.effect(() => release, 'botharness-computer: provider registration');
  ctx.provide('botharnessComputer', service);

  const watcher = createIdleWatcher({
    idleMs: Math.max(1, config.idleStopMinutes) * 60_000,
    onIdle: async () => {
      try {
        const status = await service.status();
        if (status.state === 'running') await service.stop();
      } catch {
        // A provider that cannot answer is already unavailable; idle stop is best effort.
      }
    },
  });
  ctx.effect(() => {
    const timer = setInterval(() => watcher.tick(), 60_000);
    return () => clearInterval(timer);
  }, 'botharness-computer: idle stop');

  let hostConnection: HostConnectionLike | undefined;
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    hostConnection = connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    const statusRoute = {
      path: '/api/computer/status',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => {
        const probe = await service
          .probe()
          .catch((error: unknown) => ({ available: false, detail: String(error) }));
        const status = await service
          .status()
          .catch((error: unknown) => ({ state: 'failed' as const, detail: String(error) }));
        if (status.state === 'running') watcher.touch();
        return json({ provider: service.providerName ?? null, probe, status });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(statusRoute),
      'botharness-computer: status route',
    );

    const startRoute = {
      path: '/api/computer/start',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let authorize = false;
        try {
          const body = (await request.json()) as { authorize?: unknown };
          authorize = body.authorize === true;
        } catch {
          // An empty or non-JSON body never authorizes a start.
        }
        if (!authorize) {
          return json(
            { ok: false, code: 'authorize-required', error: 'explicit authorization required' },
            400,
          );
        }
        watcher.touch();
        void service.start().catch(() => undefined);
        return json({ ok: true, started: true });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(startRoute),
      'botharness-computer: start route',
    );

    const stopRoute = {
      path: '/api/computer/stop',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => {
        try {
          await service.stop();
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(stopRoute),
      'botharness-computer: stop route',
    );
  });

  ctx.inject(['webServer'], (webCtx) => {
    let webServer: HostWebServerLike | undefined;
    try {
      webServer = (webCtx as unknown as { webServer?: HostWebServerLike }).webServer;
    } catch (error) {
      console.error('[botharness-computer] webServer unavailable:', String(error));
      return;
    }
    if (webServer === undefined) {
      console.error('[botharness-computer] webServer service is missing');
      return;
    }
    const proxy = new ViewerProxy({ prefix: VIEWER_PREFIX, upstream: () => service.upstream() });

    ctx.effect(
      () =>
        webServer.register({
          kind: 'prefix',
          path: VIEWER_PREFIX,
          handler: async (request, response) => {
            const nodeRequest = request as IncomingMessage;
            const nodeResponse = response as {
              writeHead(status: number, headers?: Record<string, string>): void;
              end(body?: Uint8Array | string): void;
            };
            console.error('[bc] viewer hit', nodeRequest.url);
            const requestHeaders = new Headers();
            for (const [key, value] of Object.entries(nodeRequest.headers)) {
              if (Array.isArray(value)) for (const item of value) requestHeaders.append(key, item);
              else if (value !== undefined) requestHeaders.set(key, value);
            }
            const rejection = hostConnection?.requestRejection({ headers: requestHeaders });
            if (rejection !== undefined) {
              nodeResponse.writeHead(rejection);
              nodeResponse.end();
              return;
            }
            watcher.touch();
            const url = new URL(nodeRequest.url ?? '/', 'http://127.0.0.1');
            let proxied: Response;
            try {
              proxied = await proxy.handle(
                new Request(url, { method: nodeRequest.method ?? 'GET' }),
              );
            } catch (error) {
              nodeResponse.writeHead(502, { 'content-type': 'text/plain; charset=utf-8' });
              nodeResponse.end(`computer upstream unavailable: ${String(error)}`);
              return;
            }
            const headers: Record<string, string> = {};
            proxied.headers.forEach((value, key) => {
              headers[key] = value;
            });
            nodeResponse.writeHead(proxied.status, headers);
            nodeResponse.end(
              proxied.body === null ? undefined : Buffer.from(await proxied.arrayBuffer()),
            );
          },
        }),
      'botharness-computer: viewer route',
    );

    if (webServer.registerUpgrade !== undefined) {
      ctx.effect(
        () =>
          webServer.registerUpgrade?.({
            path: VIEWER_PREFIX,
            handler: (request, socket, head) => {
              const rejection = hostConnection?.requestRejection({
                headers: request.headers as unknown as Headers,
              });
              if (rejection !== undefined) {
                socket.destroy();
                return;
              }
              const upstream = service.upstream();
              if (upstream === undefined) {
                socket.destroy();
                return;
              }
              watcher.touch();
              proxyUpgrade({ upstream, prefix: VIEWER_PREFIX, request, socket, head });
            },
          }) ?? (() => undefined),
        'botharness-computer: viewer upgrade',
      );
    }
  });
}
