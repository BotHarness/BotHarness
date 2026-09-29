import type { Context } from '@deepseek-ai/cordis';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';

import { BROWSER_GUIDANCE, BROWSER_TOOLS, browserToolName } from './catalog.js';
import type { BotBrowserRuntime } from '../runtime/browser.js';

export const BROWSER_PROMPT_SECTION = 'botharness:browser';

export interface BrowserAuditEvent {
  readonly at: string;
  readonly botSlug: string;
  readonly sessionId: string;
  readonly rootRole: string;
  readonly tool: string;
  readonly summary: string;
  readonly outcome: 'ok' | 'error';
  readonly durationMs: number;
  readonly error?: string;
}

export interface BrowserCoreLookup {
  readonly registry:
    | {
        get(slug: string): { browserAccess?: boolean } | undefined;
        list(): readonly { slug: string; browserAccess?: boolean }[];
      }
    | undefined;
  readonly ownership:
    | { resolve(sessionId: string): { botSlug: string; rootRole: string } | undefined }
    | undefined;
}

export interface BrowserToolProviderOptions {
  readonly ctx: Context;
  readonly runtime: BotBrowserRuntime;
  readonly isAutoAllowed: () => boolean;
  readonly audit: (event: BrowserAuditEvent) => void;
  readonly note?: (detail: string) => void;
  readonly onActivity?: () => void;
  readonly core: () => BrowserCoreLookup;
}

export interface BrowserToolProvider {
  attachAgent(scope: Context, sessionId: string, info: { botSlug: string; rootRole: string }): void;
  needsAuthorization(sessionId: string): boolean;
  markAuthorized(sessionId: string): void;
  reconcileBot(slug: string): Promise<void>;
  reconcileAll(): Promise<void>;
  isTakeover(slug: string): boolean;
  setTakeover(slug: string, active: boolean): boolean;
  currentTab(slug: string): string | undefined;
  dispose(): Promise<void>;
}

type BrowserToolContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly data: string; readonly mimeType: string };

interface SessionRegistration {
  readonly slug: string;
  readonly scope: Context;
  readonly disposers: readonly (() => void)[];
}

export function browserToolNames(): readonly string[] {
  return BROWSER_TOOLS.map((spec) => browserToolName(spec.raw));
}

export function ownsBrowserTool(name: string): boolean {
  return BROWSER_TOOLS.some((spec) => browserToolName(spec.raw) === name);
}

export function auditSummary(raw: string, args: Record<string, unknown>): string {
  const spec = BROWSER_TOOLS.find((candidate) => candidate.raw === raw);
  if (spec === undefined) return 'tool';
  try {
    return spec.audit(args);
  } catch {
    return 'tool';
  }
}

export function formatAudit(event: BrowserAuditEvent): string {
  const outcome = event.outcome === 'ok' ? 'ok' : `error: ${event.error ?? 'failed'}`;
  return `bot=${event.botSlug} session=${event.sessionId} role=${event.rootRole} ${event.tool} ${event.summary} -> ${outcome} (${event.durationMs}ms)`;
}

export function createBrowserToolProvider(
  options: BrowserToolProviderOptions,
): BrowserToolProvider {
  const { ctx, runtime, isAutoAllowed, audit, core } = options;
  const note = options.note ?? ((): void => undefined);
  const onActivity = options.onActivity ?? ((): void => undefined);

  const sessions = new Map<string, { scope: Context }>();
  const registrations = new Map<string, SessionRegistration>();
  const grants = new Set<string>();
  const tabs = new Map<string, string>();
  const takeovers = new Set<string>();
  const queues = new Map<string, Promise<unknown>>();
  let disposed = false;

  const botSlugOf = (sessionId: string): { botSlug: string; rootRole: string } | undefined =>
    core().ownership?.resolve(sessionId);

  const serialize = <T>(slug: string, action: () => Promise<T>): Promise<T> => {
    const previous = queues.get(slug) ?? Promise.resolve();
    const next = previous.then(action, action);
    queues.set(
      slug,
      next.then(
        () => undefined,
        () => undefined,
      ),
    );
    return next;
  };

  const record = (
    botSlug: string,
    sessionId: string,
    tool: string,
    summary: string,
    outcome: 'ok' | 'error',
    durationMs: number,
    error?: string,
  ): void => {
    const rootRole = botSlugOf(sessionId)?.rootRole ?? 'unknown';
    const event: BrowserAuditEvent = {
      at: new Date().toISOString(),
      botSlug,
      sessionId,
      rootRole,
      tool,
      summary,
      outcome,
      durationMs,
      ...(error === undefined ? {} : { error: error.slice(0, 200) }),
    };
    try {
      audit(event);
    } catch {}
  };

  const authorize = async (execution: ToolExecution, sessionId: string): Promise<void> => {
    const agent = execution.agent;
    if (agent === undefined) throw new Error('Browser tools require a PersonaBot session');
    if (grants.has(sessionId) || isAutoAllowed()) return;
    throw new Error('Browser action is not authorized for this session');
  };

  const runTool = async (
    raw: string,
    args: Record<string, unknown>,
    slug: string,
  ): Promise<{ content: BrowserToolContent[] }> => {
    if (raw === 'open') {
      const url = typeof args['url'] === 'string' ? args['url'] : '';
      if (!/^https?:\/\//u.test(url)) {
        throw new Error(
          'browser_open needs an absolute http(s) URL, for example https://example.com',
        );
      }
      const tab = await runtime.open(url, tabs.get(slug));
      tabs.set(slug, tab.tabId);
      const title = tab.title === '' ? '' : ` — ${tab.title}`;
      return {
        content: [
          {
            type: 'text',
            text: `Opened ${tab.url}${title}. Call browser_observe to read the page.`,
          },
        ],
      };
    }
    if (raw === 'observe') {
      const tabId = tabs.get(slug);
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let observation;
      try {
        observation = await runtime.observe(tabId);
      } catch (error) {
        tabs.delete(slug);
        throw new Error(
          `The Bot Browser tab is gone (${error instanceof Error ? error.message : String(error)}); call browser_open again`,
        );
      }
      const elementLines = observation.elements.map(
        (element) => `${element.ref} ${element.role} ${element.name}`,
      );
      const parts = [`URL: ${observation.url}`, `Title: ${observation.title}`];
      if (elementLines.length > 0) {
        parts.push('', 'Interactive elements:', ...elementLines);
      }
      parts.push('', 'Page text:', observation.text);
      return { content: [{ type: 'text', text: parts.join('\n') }] };
    }
    if (raw === 'screenshot') {
      if (takeovers.has(slug)) {
        throw new Error(
          'Browser Takeover is active for this PersonaBot; the Human is driving the Bot Browser',
        );
      }
      const tabId = tabs.get(slug);
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let shot;
      try {
        shot = await runtime.captureScreenshot(tabId);
      } catch (error) {
        tabs.delete(slug);
        throw new Error(
          `The Bot Browser tab is gone (${error instanceof Error ? error.message : String(error)}); call browser_open again`,
        );
      }
      if (shot === undefined) {
        return {
          content: [
            {
              type: 'text',
              text: '[image unavailable: the Bot Browser returned no frame; the tab may be in the background or minimized]',
            },
          ],
        };
      }
      return { content: [{ type: 'image', data: shot.data, mimeType: shot.mimeType }] };
    }
    throw new Error(`Unknown Bot Browser operation: ${raw}`);
  };

  const unregisterSession = (sessionId: string): void => {
    const registration = registrations.get(sessionId);
    if (registration === undefined) return;
    registrations.delete(sessionId);
    for (const dispose of [...registration.disposers].reverse()) dispose();
  };

  const registerSession = (sessionId: string, scope: Context, slug: string): void => {
    if (disposed) return;
    if (registrations.has(sessionId)) return;
    const disposers: (() => void)[] = [];
    try {
      for (const spec of BROWSER_TOOLS) {
        const definition = createMcpToolDefinition(scope, {
          name: browserToolName(spec.raw),
          rawName: spec.raw,
          description: spec.description,
          inputSchema: spec.inputSchema,
          call: async (args, execution) => {
            await authorize(execution, sessionId);
            onActivity();
            if (core().registry?.get(slug)?.browserAccess !== true) {
              throw new Error('Browser Access is off for this PersonaBot');
            }
            if (spec.raw !== 'observe' && takeovers.has(slug)) {
              throw new Error(
                'Browser Takeover is active for this PersonaBot; the Human is driving the Bot Browser',
              );
            }
            const started = Date.now();
            try {
              const result = await serialize(slug, () => runTool(spec.raw, args, slug));
              record(
                slug,
                sessionId,
                browserToolName(spec.raw),
                auditSummary(spec.raw, args),
                'ok',
                Date.now() - started,
              );
              return result;
            } catch (error) {
              record(
                slug,
                sessionId,
                browserToolName(spec.raw),
                auditSummary(spec.raw, args),
                'error',
                Date.now() - started,
                error instanceof Error ? error.message : String(error),
              );
              throw error;
            }
          },
        });
        disposers.push(scope.tools.register(definition));
      }
      disposers.push(
        scope.systemPrompt.section({
          name: BROWSER_PROMPT_SECTION,
          order: scope.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE') + 50,
          text: BROWSER_GUIDANCE,
        }),
      );
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
    registrations.set(sessionId, { slug, scope, disposers });
    note(`tools on slug=${slug} session=${sessionId} count=${disposers.length - 1}`);
    ctx.logger.info(`botharness-browser: Bot Browser tools on for ${slug} (${sessionId})`);
  };

  const onDisposed = function (payload: { agent: Agent }): undefined {
    const sessionId = String(payload.agent.id);
    unregisterSession(sessionId);
    sessions.delete(sessionId);
    grants.delete(sessionId);
    return undefined;
  };

  ctx.on('agent/disposed', onDisposed);

  return {
    attachAgent(scope, sessionId, info) {
      if (disposed) return;
      sessions.set(sessionId, { scope });
      const access = core().registry?.get(info.botSlug)?.browserAccess === true;
      note(
        `agent setup session=${sessionId} bot=${info.botSlug} role=${info.rootRole} access=${String(access)}`,
      );
      if (access !== true) return;
      try {
        registerSession(sessionId, scope, info.botSlug);
      } catch (error) {
        ctx.logger.warn(
          `botharness-browser: failed to register Bot Browser tools for ${info.botSlug}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },

    needsAuthorization(sessionId) {
      return !grants.has(sessionId) && !isAutoAllowed();
    },

    markAuthorized(sessionId) {
      grants.add(sessionId);
    },

    async reconcileBot(slug) {
      if (disposed) return;
      const access = core().registry?.get(slug)?.browserAccess === true;
      for (const [sessionId, session] of sessions) {
        const owner = botSlugOf(sessionId);
        if (owner?.botSlug !== slug) continue;
        if (access) {
          registerSession(sessionId, session.scope, slug);
        } else {
          unregisterSession(sessionId);
        }
      }
      if (!access) {
        tabs.delete(slug);
        takeovers.delete(slug);
      }
    },

    isTakeover(slug) {
      return takeovers.has(slug);
    },

    setTakeover(slug, active) {
      if (active) takeovers.add(slug);
      else takeovers.delete(slug);
      note(`takeover ${active ? 'on' : 'off'} slug=${slug}`);
      return takeovers.has(slug);
    },

    currentTab(slug) {
      return tabs.get(slug);
    },

    async reconcileAll() {
      if (disposed) return;
      for (const bot of core().registry?.list() ?? []) {
        if (bot.browserAccess === true) await this.reconcileBot(bot.slug);
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const sessionId of [...registrations.keys()]) unregisterSession(sessionId);
      sessions.clear();
      grants.clear();
      tabs.clear();
      takeovers.clear();
      queues.clear();
      await runtime.stop();
    },
  };
}
