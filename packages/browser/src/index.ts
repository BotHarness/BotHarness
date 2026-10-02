import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';
import { registerBrowserViewer, type BrowserViewerHost } from './viewer.js';
import type { ContainerBrowserOptions } from './runtime/container.js';

import { createBrowserDiagnostics, toLogEntry } from './diagnostics.js';
import { openLogDatabase, type LogDatabase } from '../../core/src/logs/log-db.js';
import { createBotBrowserRuntimes, listStoredProfileNames } from './runtimes.js';
import {
  browserToolNames,
  createBrowserToolProvider,
  formatAudit,
  ownsBrowserTool,
} from './tool/provider.js';

export const name = 'botharness-browser';

export interface BrowserConfig {
  target?: 'local' | 'container';
  enabled: boolean;
  browserPath: string;
  headless: boolean;
  idleStopMinutes: number;
  autoAllowActions: boolean;
}

export const DEFAULT_CONFIG: BrowserConfig = {
  target: 'local',
  enabled: true,
  browserPath: '',
  headless: false,
  idleStopMinutes: 30,
  autoAllowActions: false,
};

export const Config = Schema.object({
  target: Schema.union([Schema.const('local'), Schema.const('container')])
    .default('local')
    .volatile(),
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 Browser'),
  browserPath: Schema.string()
    .default(DEFAULT_CONFIG.browserPath)
    .description('浏览器可执行文件路径；留空自动探测 Chrome / Edge / Chromium'),
  headless: Schema.boolean()
    .default(DEFAULT_CONFIG.headless)
    .description('无窗口运行；默认关闭，Human 需要在窗口里登录一次'),
  idleStopMinutes: Schema.number().default(DEFAULT_CONFIG.idleStopMinutes),
  autoAllowActions: Schema.boolean().default(DEFAULT_CONFIG.autoAllowActions),
});

interface HostConnectionLike {
  readonly fetch: {
    register(route: {
      readonly path: string;
      readonly methods: readonly string[];
      readonly requestBody: 'buffered';
      readonly fetch: (request: Request) => Promise<Response>;
    }): () => void;
  };
}

export function profileDirectory(): string {
  const home = process.env.DSH_HOME?.trim() ?? '';
  const root = home === '' ? join(homedir(), '.botharness') : join(home, 'botharness');
  return join(root, 'browser');
}

export function pinnedBrowserDirectory(): string {
  const home = process.env.DSH_HOME?.trim() ?? '';
  const root = home === '' ? join(homedir(), '.botharness') : join(home, 'botharness');
  return join(root, 'browser-chromium');
}

export function apply(
  ctx: Context,
  config: Omit<BrowserConfig, 'target'> & {
    target?: 'local' | 'container' | { get(): 'local' | 'container' };
  },
): void {
  if (!config.enabled) return;

  let logDb: LogDatabase | undefined;
  try {
    const home = process.env.DSH_HOME?.trim();
    logDb =
      home === undefined || home === ''
        ? undefined
        : openLogDatabase({ dir: join(home, 'botharness') });
  } catch {
    logDb = undefined;
  }
  const diagnostics = createBrowserDiagnostics(undefined, {
    write: (event) => {
      logDb?.write(toLogEntry(event, 'browser', 'profile-shared'));
    },
  });

  const coreLookup = (): { registry?: unknown; ownership?: unknown } | undefined =>
    ctx.get('botharness') as unknown as { registry?: unknown; ownership?: unknown } | undefined;
  const target = (): 'local' | 'container' =>
    (typeof config.target === 'object' ? config.target.get() : config.target) ?? 'local';
  let revision = 0;
  const authorizationScope = (): string => `${target()}:${revision}`;
  let switching: Promise<void> = Promise.resolve();
  let registerViewer: ContainerBrowserOptions['onViewer'];
  ctx.inject(['connection', 'webServer'], (viewerCtx) => {
    const services = viewerCtx as unknown as {
      webServer: BrowserViewerHost;
      connection: { requestRejection(request: { headers: Headers }): number | undefined };
    };
    registerViewer = (prefix, upstream) =>
      registerBrowserViewer({
        host: services.webServer,
        prefix,
        upstream,
        rejection: (headers) => services.connection.requestRejection({ headers }),
      });
    return () => {
      registerViewer = undefined;
    };
  });
  const runtimes = createBotBrowserRuntimes({
    browserDir: profileDirectory(),
    target,
    onViewer: (prefix, upstream) => {
      if (registerViewer === undefined)
        throw new Error('The Container Browser viewer requires the DSH Web Host');
      return registerViewer(prefix, upstream);
    },
    installDir: pinnedBrowserDirectory(),
    ...(config.browserPath.trim() === '' ? {} : { browserPath: config.browserPath.trim() }),
    ...(config.headless ? { headless: true } : {}),
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
    profileOf: (slug) => {
      const registry = coreLookup()?.registry as
        | { get(slug: string): { browserProfile?: string } | undefined }
        | undefined;
      return registry?.get(slug)?.browserProfile ?? '';
    },
  });

  const provider = createBrowserToolProvider({
    ctx,
    runtimes,
    screenshotDir: join(profileDirectory(), 'screenshots'),
    isAutoAllowed: () => config.autoAllowActions,
    beforeExecution: () => switching,
    audit: (event) => diagnostics.record('browser-action', formatAudit(event)),
    note: (detail) => diagnostics.record('lifecycle', detail),
    onActivity: (slug) => {
      runtimes.touch(slug);
    },
    core: () => {
      const core = coreLookup();
      return {
        registry: core?.registry as never,
        ownership: core?.ownership as never,
      };
    },
  });
  ctx.provide('botharnessBrowserTools', {
    reconcileBot: (slug: string) => provider.reconcileBot(slug),
    resetBot: (slug: string) => {
      const started = Date.now();
      provider.resetBot(slug);
      diagnostics.record(
        'lifecycle',
        `initiator=profile-assignment phase=reset-tabs slug=${slug} durationMs=${Date.now() - started}`,
      );
    },
    ownsTool: (name: string) => ownsBrowserTool(name),
    executionSignal: (sessionId: string) => provider.executionSignal(sessionId),
    needsAuthorization: (sessionId: string) => provider.needsAuthorization(sessionId),
    authorizationScope,
    markAuthorized: (sessionId: string, expectedScope?: string) => {
      if (expectedScope !== undefined && expectedScope !== authorizationScope()) return false;
      provider.markAuthorized(sessionId);
      return true;
    },
  });
  ctx.on('loader/volatile-update', (paths) => {
    if (!paths.some((path) => path[0] === 'target')) return;
    revision += 1;
    provider.resetRuntime();
    switching = switching.catch(() => undefined).then(() => runtimes.stopAll());
    void switching
      .then(() => provider.reconcileAll())
      .catch((error: unknown) =>
        diagnostics.record(
          'lifecycle',
          `initiator=target-switch phase=refused detail=${String(error).slice(0, 200)}`,
        ),
      );
  });
  ctx.inject(['botharness'], (coreCtx) => {
    const core = (
      coreCtx as unknown as {
        botharness?: {
          contributeBotAgentSetup?: (
            contribute: (
              agentCtx: import('@deepseek-ai/cordis').Context,
              agent: { id: unknown },
              info: { botSlug: string; rootRole: string },
            ) => void,
          ) => () => void;
          hostTools?: Set<string>;
        };
      }
    ).botharness;
    const remove = core?.contributeBotAgentSetup?.((agentCtx, agent, info) => {
      provider.attachAgent(agentCtx, String(agent.id), info);
    });
    for (const name of browserToolNames()) core?.hostTools?.add(name);
    return () => {
      remove?.();
      for (const name of browserToolNames()) core?.hostTools?.delete(name);
    };
  });
  ctx.effect(
    () => () => {
      void provider.dispose();
    },
    'botharness-browser: tool provider',
  );

  const idleMs = Math.max(1, config.idleStopMinutes) * 60_000;
  ctx.effect(() => {
    const timer = setInterval(() => {
      void runtimes.closeIdle(idleMs);
      void provider.closeIdleTabs(idleMs);
    }, 30_000);
    return () => clearInterval(timer);
  }, 'botharness-browser: idle stop');

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    const openRoute = {
      path: '/api/browser/open',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: { slug?: unknown; tab?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
        diagnostics.record('lifecycle', `open requested (panel) slug=${slug}`);
        runtimes.touch(slug);
        provider.touch(slug);
        try {
          await switching;
          const scope = authorizationScope();
          const requested = typeof body.tab === 'string' && body.tab !== '' ? body.tab : undefined;
          const tab = await provider.openForHuman(slug, requested);
          if (scope !== authorizationScope())
            throw new Error('Browser Target changed while opening');
          return json({
            ok: true,
            tabId: tab.tabId,
            viewerUrl: runtimes.for(slug).viewerUrl?.() ?? null,
          });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(openRoute),
      'botharness-browser: open route',
    );

    const observationRoute = {
      path: '/api/browser/observation',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        await switching;
        const scope = authorizationScope();
        const url = new URL(request.url);
        const slug = url.searchParams.get('slug') ?? '';
        const requested = url.searchParams.get('tab') ?? '';
        if (slug === '') {
          return json({
            ok: true,
            running: false,
            frame: null,
            focused: null,
            takeover: false,
            tabs: [],
          });
        }
        runtimes.touch(slug);
        provider.touch(slug);
        const runtime = runtimes.for(slug);
        const tabId =
          requested !== '' && provider.ownsTab(slug, requested)
            ? requested
            : provider.currentTab(slug);
        let frame: string | null = null;
        if (tabId !== undefined && runtime.isRunning()) {
          const shot = await runtime.captureScreenshot(tabId).catch(() => undefined);
          if (shot !== undefined) frame = `data:${shot.mimeType};base64,${shot.data}`;
        }
        const discoveryStarted = Date.now();
        const profiles = await listStoredProfileNames(profileDirectory()).catch(() => {
          diagnostics.record(
            'lifecycle',
            `initiator=observation phase=profile-discovery outcome=unavailable reason=directory-unavailable durationMs=${Date.now() - discoveryStarted}`,
          );
          return [];
        });
        const tabs = await provider.listTabs(slug);
        if (scope !== authorizationScope())
          return json({ ok: false, error: 'Browser Target changed during observation' }, 409);
        return json({
          ok: true,
          running: runtime.isRunning(),
          frame,
          focused: tabId ?? null,
          takeover: provider.isTakeover(slug),
          tabs,
          profiles,
          target: target(),
          viewerUrl: runtime.viewerUrl?.() ?? null,
        });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(observationRoute),
      'botharness-browser: observation route',
    );

    const takeoverRoute = {
      path: '/api/browser/takeover',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: { slug?: unknown; active?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '' || typeof body.active !== 'boolean') {
          return json({ ok: false, error: 'slug and active are required' }, 400);
        }
        runtimes.touch(slug);
        provider.touch(slug);
        await switching;
        const takeover = provider.setTakeover(slug, body.active);
        return json({ ok: true, takeover });
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(takeoverRoute),
      'botharness-browser: takeover route',
    );

    const stopRoute = {
      path: '/api/browser/stop',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (request: Request): Promise<Response> => {
        let body: { slug?: unknown } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          void 0;
        }
        const slug = typeof body.slug === 'string' ? body.slug : '';
        if (slug === '') return json({ ok: false, error: 'slug is required' }, 400);
        diagnostics.record('lifecycle', `stop requested (panel) slug=${slug}`);
        try {
          await switching;
          await runtimes.stop(slug);
          provider.resetBot(slug);
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(stopRoute),
      'botharness-browser: stop route',
    );
  });

  ctx.logger.info(`botharness-browser: Bot Browser ready (profile ${profileDirectory()})`);
}
