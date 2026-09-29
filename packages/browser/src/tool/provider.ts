/**
 * Browser Tool Provider: injects the curated Bot Browser tools plus guidance
 * into the session scopes of PersonaBots whose Browser Access is on
 * (ADR-0089/0090). Calls are attributed, authorized once per session, audited
 * with redacted summaries, and serialized per PersonaBot.
 * @module @botharness/browser/tool/provider
 */

import type { Context } from '@deepseek-ai/cordis';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';

import { BROWSER_GUIDANCE, BROWSER_TOOLS, browserToolName } from './catalog.js';
import type { BotBrowserRuntime } from '../runtime/browser.js';

/** Stable prompt-section name for the Bot Browser guidance. */
export const BROWSER_PROMPT_SECTION = 'botharness:browser';

/** One redacted audit record; never contains page contents or typed text. */
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

/** Narrow view of the core services the provider needs (both optional). */
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
  /** Profile-level auto-allow switch for Browser Authorization. */
  readonly isAutoAllowed: () => boolean;
  /** Durable redacted audit sink. */
  readonly audit: (event: BrowserAuditEvent) => void;
  /** Developer-visible lifecycle notes. */
  readonly note?: (detail: string) => void;
  /** Called on every tool call so browser activity resets the idle timer. */
  readonly onActivity?: () => void;
  /** Core lookups; undefined members degrade to "no access, no attribution". */
  readonly core: () => BrowserCoreLookup;
}

export interface BrowserToolProvider {
  /**
   * Attach one Bot-owned agent as core sets it up (before its first prompt):
   * track its scope and register the browser tools when its access is on.
   */
  attachAgent(scope: Context, sessionId: string, info: { botSlug: string; rootRole: string }): void;
  /** True while this session still needs a Human Browser Authorization ask. */
  needsAuthorization(sessionId: string): boolean;
  /** Record that core asked and the Human allowed one browser action for this session. */
  markAuthorized(sessionId: string): void;
  /** Reconcile the live registrations of one PersonaBot after its access changed. */
  reconcileBot(slug: string): Promise<void>;
  /** Reconcile every tracked session (e.g. after the Bot Browser started). */
  reconcileAll(): Promise<void>;
  /** Drop every registration and stop the browser. */
  dispose(): Promise<void>;
}

interface SessionRegistration {
  readonly slug: string;
  readonly scope: Context;
  readonly disposers: readonly (() => void)[];
}

/** Every model-facing name in the curated catalog. */
export function browserToolNames(): readonly string[] {
  return BROWSER_TOOLS.map((spec) => browserToolName(spec.raw));
}

/** Whether this provider owns one model-facing tool name. */
export function ownsBrowserTool(name: string): boolean {
  return BROWSER_TOOLS.some((spec) => browserToolName(spec.raw) === name);
}

/** Redacted audit summary for one call of one curated tool. */
export function auditSummary(raw: string, args: Record<string, unknown>): string {
  const spec = BROWSER_TOOLS.find((candidate) => candidate.raw === raw);
  if (spec === undefined) return 'tool';
  try {
    return spec.audit(args);
  } catch {
    return 'tool';
  }
}

/** Human-readable audit line for the diagnostics stream / logs.db. */
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

  /** sessionId -> live agent scope plus its current tool disposers. */
  const sessions = new Map<string, { scope: Context }>();
  /** sessionId -> active registrations (tools + guidance). */
  const registrations = new Map<string, SessionRegistration>();
  /** Sessions already authorized for browser actions (grant lives per session). */
  const grants = new Set<string>();
  /** botSlug -> the tab this PersonaBot owns (one tab per Bot in this tracer). */
  const tabs = new Map<string, string>();
  /** botSlug -> tail of its serialized action queue (ADR-0090). */
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
    } catch {
      // Audit is best effort; a failing sink never blocks a tool call.
    }
  };

  const authorize = async (execution: ToolExecution, sessionId: string): Promise<void> => {
    const agent = execution.agent;
    if (agent === undefined) throw new Error('Browser tools require a PersonaBot session');
    if (grants.has(sessionId) || isAutoAllowed()) return;
    // Core's `tools/pre-execute` hook owns the Human ask (so it rides the
    // existing Bot DM approval cards and their one-time / always rules);
    // reaching here without a grant means the gate did not run and the call
    // fails closed.
    throw new Error('Browser action is not authorized for this session');
  };

  const runTool = async (
    raw: string,
    args: Record<string, unknown>,
    slug: string,
  ): Promise<{ content: { type: 'text'; text: string }[] }> => {
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
      if (!access) tabs.delete(slug);
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
      queues.clear();
      await runtime.stop();
    },
  };
}
