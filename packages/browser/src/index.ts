/**
 * BotHarness Browser: the profile-scoped managed Bot Browser (ADR-0089).
 * Owns the browser runtime (launch, persistent profile, CDP), registers the
 * curated read-only tools plus guidance into the session scopes of PersonaBots
 * whose Browser Access is on, audits every call, and serves the Browser
 * entry's status/actions over authenticated Host routes.
 * @module @botharness/browser
 */

import { homedir } from 'node:os';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import Schema from '@deepseek-ai/schemastery';

import { createBrowserDiagnostics, toLogEntry } from './diagnostics.js';
// Deep relative import, not the package root: the log module is leaf-only
// (node builtins) and must not pull core's barrel types into this bundle.
import { openLogDatabase, type LogDatabase } from '../../core/src/logs/log-db.js';
import { createBotBrowserRuntime } from './runtime/browser.js';
import {
  browserToolNames,
  createBrowserToolProvider,
  formatAudit,
  ownsBrowserTool,
} from './tool/provider.js';

export const name = 'botharness-browser';

export interface BrowserConfig {
  enabled: boolean;
  /** Explicit browser binary; empty probes the platform's Chrome/Edge/Chromium. */
  browserPath: string;
  /** Headless by default? The Human needs a window to sign in. */
  headless: boolean;
  /** Minutes without tool activity before the Bot Browser stops itself. */
  idleStopMinutes: number;
  /** When on, PersonaBot browser actions run without a per-session Human approval. */
  autoAllowActions: boolean;
}

export const DEFAULT_CONFIG: BrowserConfig = {
  enabled: true,
  browserPath: '',
  headless: false,
  idleStopMinutes: 30,
  autoAllowActions: false,
};

export const Config = Schema.object({
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

export function apply(ctx: Context, config: BrowserConfig): void {
  if (!config.enabled) return;

  // Durable drain for the diagnostics ring: best effort — without a home, or
  // when the file is unusable, the ring keeps serving reads on its own.
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

  const lastActivity = { at: Date.now() };
  const runtime = createBotBrowserRuntime({
    ...(config.browserPath.trim() === '' ? {} : { browserPath: config.browserPath.trim() }),
    userDataDir: profileDirectory(),
    ...(config.headless ? { headless: true } : {}),
    onEvent: (detail) => diagnostics.record('lifecycle', detail),
  });

  const provider = createBrowserToolProvider({
    ctx,
    runtime,
    isAutoAllowed: () => config.autoAllowActions,
    audit: (event) => diagnostics.record('browser-action', formatAudit(event)),
    note: (detail) => diagnostics.record('lifecycle', detail),
    onActivity: () => {
      lastActivity.at = Date.now();
    },
    core: () => {
      const core = ctx.get('botharness') as unknown as
        | { registry?: unknown; ownership?: unknown }
        | undefined;
      return {
        registry: core?.registry as never,
        ownership: core?.ownership as never,
      };
    },
  });
  ctx.provide('botharnessBrowserTools', {
    reconcileBot: (slug: string) => provider.reconcileBot(slug),
    ownsTool: (name: string) => ownsBrowserTool(name),
    needsAuthorization: (sessionId: string) => provider.needsAuthorization(sessionId),
    markAuthorized: (sessionId: string) => provider.markAuthorized(sessionId),
  });
  // Core owns Bot agent construction (create, resume, borrow); contributing
  // through its setup path guarantees the scoped tools exist before the
  // agent's first prompt assembly. Host-side tools that act outside Host
  // files join `hostTools` so core's file-grant guard skips them; Browser
  // Authorization governs instead.
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

  // Idle stop: the Bot Browser stops itself after the configured idle window,
  // mirroring the Computer's policy; a stopped browser is a readable tool error.
  const idleMs = Math.max(1, config.idleStopMinutes) * 60_000;
  ctx.effect(() => {
    const timer = setInterval(() => {
      if (!runtime.isRunning()) return;
      if (Date.now() - lastActivity.at < idleMs) return;
      diagnostics.record('lifecycle', `idle stop after ${config.idleStopMinutes}m`);
      void runtime.stop();
    }, 30_000);
    return () => clearInterval(timer);
  }, 'botharness-browser: idle stop');

  // Human surfaces: the Browser entry reads status and invokes open/stop over
  // the authenticated Host connection (the Computer viewer routes' pattern).
  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (connectionCtx as unknown as { connection: HostConnectionLike }).connection;
    const json = (value: unknown, status = 200): Response =>
      Response.json(value as Record<string, unknown>, { status });

    const statusRoute = {
      path: '/api/browser/status',
      methods: ['GET'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> =>
        json({
          ok: true,
          running: runtime.isRunning(),
          url: runtime.currentUrl() ?? null,
          binary: runtime.binaryPath() ?? null,
        }),
    };
    connectionCtx.effect(
      () => connection.fetch.register(statusRoute),
      'botharness-browser: status route',
    );

    const openRoute = {
      path: '/api/browser/open',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => {
        diagnostics.record('lifecycle', 'open requested (panel)');
        try {
          await runtime.openWindow();
          return json({ ok: true });
        } catch (error) {
          return json({ ok: false, error: String(error) }, 500);
        }
      },
    };
    connectionCtx.effect(
      () => connection.fetch.register(openRoute),
      'botharness-browser: open route',
    );

    const stopRoute = {
      path: '/api/browser/stop',
      methods: ['POST'] as const,
      requestBody: 'buffered' as const,
      fetch: async (): Promise<Response> => {
        diagnostics.record('lifecycle', 'stop requested (panel)');
        try {
          await runtime.stop();
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
