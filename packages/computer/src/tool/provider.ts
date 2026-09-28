/**
 * Computer Tool Provider: registers the single official `ctx.computerUse` slot
 * and injects the curated Computer tools plus guidance into the session scopes
 * of PersonaBots whose Computer Access is on (ADR-0079/0080). Tool calls are
 * attributed, authorized once per session, and audited with redacted
 * summaries; the provider tolerates a stopped Computer.
 * @module @botharness/computer/tool/provider
 */

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-computer-use';
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';

import { COMPUTER_GUIDANCE, COMPUTER_TOOLS, FALLBACK_TOOLS, computerToolName } from './catalog.js';
import type { CuaDriver, DriverToolDescriptor } from './driver.js';

/** Provider name occupying the exclusive computer-use registration. */
export const COMPUTER_PROVIDER_NAME = 'botharness-computer';

/** Stable prompt-section name for the Computer guidance. */
export const COMPUTER_PROMPT_SECTION = 'botharness:computer';

/** One redacted audit record; never contains typed text or screenshots. */
export interface ComputerAuditEvent {
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
export interface ComputerCoreLookup {
  readonly registry:
    | {
        get(slug: string): { computerAccess?: boolean } | undefined;
        list(): readonly { slug: string; computerAccess?: boolean }[];
      }
    | undefined;
  readonly ownership:
    | { resolve(sessionId: string): { botSlug: string; rootRole: string } | undefined }
    | undefined;
  readonly contributeBotAgentSetup?:
    | ((
        contribute: (
          agentCtx: Context,
          agent: Agent,
          info: { botSlug: string; rootRole: string },
        ) => void,
      ) => () => void)
    | undefined;
}

export interface ComputerToolProviderOptions {
  readonly ctx: Context;
  readonly driver: CuaDriver;
  /** Whether the Computer container is currently running. */
  readonly isComputerRunning: () => boolean;
  /** Profile-level auto-allow switch for Computer Authorization. */
  readonly isAutoAllowed: () => boolean;
  /** Durable redacted audit sink. */
  readonly audit: (event: ComputerAuditEvent) => void;
  /** Developer-visible lifecycle notes for the Computer diagnostics ring. */
  readonly note?: (detail: string) => void;
  /** Called on every tool call so Computer activity resets the idle timer. */
  readonly onActivity?: () => void;
  /** Core lookups; undefined members degrade to "no access, no attribution". */
  readonly core: () => ComputerCoreLookup;
}

/** Every model-facing name in the curated catalog (the fallback mirrors it). */
export function computerToolNames(): readonly string[] {
  return COMPUTER_TOOLS.map((spec) => computerToolName(spec.raw));
}

/** Whether this provider owns one model-facing tool name. */
export function ownsComputerTool(name: string): boolean {
  return COMPUTER_TOOLS.some((spec) => computerToolName(spec.raw) === name);
}

export interface ComputerToolProvider {
  /**
   * Attach one Bot-owned agent as core sets it up (before its first prompt):
   * track its scope and register Computer tools when its access is on.
   */
  attachAgent(scope: Context, sessionId: string, info: { botSlug: string; rootRole: string }): void;
  /** True while this session still needs a Human Computer Authorization ask. */
  needsAuthorization(sessionId: string): boolean;
  /** Record that core asked and the Human allowed one Computer action for this session. */
  markAuthorized(sessionId: string): void;
  /** Reconcile the live registrations of one PersonaBot after its access changed. */
  reconcileBot(slug: string): Promise<void>;
  /** Reconcile every tracked session (e.g. after the Computer started). */
  reconcileAll(): Promise<void>;
  /** Drop every registration, release the slot, and close the driver. */
  dispose(): Promise<void>;
}

interface SessionRegistration {
  readonly slug: string;
  readonly scope: Context;
  readonly disposers: readonly (() => void)[];
  /** Where the tool descriptors came from; a fallback registration upgrades in place. */
  readonly source: 'driver' | 'fallback';
}

/** Curated tools actually present in one driver catalog. */
export function selectCuratedTools(
  descriptors: readonly DriverToolDescriptor[],
): readonly { raw: string; descriptor: DriverToolDescriptor }[] {
  const byName = new Map(descriptors.map((descriptor) => [descriptor.name, descriptor]));
  return COMPUTER_TOOLS.flatMap((spec) => {
    const descriptor = byName.get(spec.raw);
    return descriptor === undefined ? [] : [{ raw: spec.raw, descriptor }];
  });
}

/** Redacted audit summary for one call of one curated tool. */
export function auditSummary(raw: string, args: Record<string, unknown>): string {
  const spec = COMPUTER_TOOLS.find((candidate) => candidate.raw === raw);
  if (spec === undefined) return 'tool';
  try {
    return spec.audit(args);
  } catch {
    return 'tool';
  }
}

/** Human-readable audit line for the diagnostics stream / logs.db. */
export function formatAudit(event: ComputerAuditEvent): string {
  const outcome = event.outcome === 'ok' ? 'ok' : `error: ${event.error ?? 'failed'}`;
  return `bot=${event.botSlug} session=${event.sessionId} role=${event.rootRole} ${event.tool} ${event.summary} -> ${outcome} (${event.durationMs}ms)`;
}

export function createComputerToolProvider(
  options: ComputerToolProviderOptions,
): ComputerToolProvider {
  const { ctx, driver, isComputerRunning, isAutoAllowed, audit, core } = options;
  const note = options.note ?? ((): void => undefined);
  const onActivity = options.onActivity ?? ((): void => undefined);

  /** sessionId -> live agent scope plus its current tool disposers. */
  const sessions = new Map<string, { scope: Context; disposed: boolean }>();
  /** sessionId -> active registrations (tools + guidance). */
  const registrations = new Map<string, SessionRegistration>();
  /** Sessions already authorized for Computer actions (grant lives per session). */
  const grants = new Set<string>();
  let slotDisposer: (() => Promise<void>) | undefined;
  let disposed = false;

  const botSlugOf = (sessionId: string): { botSlug: string; rootRole: string } | undefined =>
    core().ownership?.resolve(sessionId);

  /**
   * Driver catalog cached after the first successful fetch. Registration is
   * synchronous so it always lands before the agent's first prompt assembly —
   * an awaited connect here lost that race and the model saw no Computer
   * tools at all (found by the 2026-09-28 acceptance session). Until the
   * cache warms, the fallback catalog keeps the tools callable; the cache
   * upgrade re-registers fallback sessions in place.
   */
  let cachedTools: readonly DriverToolDescriptor[] | undefined;
  let warming: Promise<void> | undefined;

  const warmCatalog = (): void => {
    if (warming !== undefined || disposed || !isComputerRunning()) return;
    warming = (async () => {
      try {
        await driver.ensure();
        cachedTools = await driver.tools();
        // Upgrade any session still on the fallback catalog.
        for (const [sessionId, registration] of [...registrations]) {
          if (registration.source !== 'fallback') continue;
          if (core().registry?.get(registration.slug)?.computerAccess !== true) continue;
          registerSession(sessionId, registration.scope, registration.slug);
        }
      } catch (error) {
        note(
          `driver warm failed: ${error instanceof Error ? error.message : String(error)}`.slice(
            0,
            160,
          ),
        );
        ctx.logger.warn(
          `botharness-computer: driver unavailable, keeping fallback tools: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      } finally {
        warming = undefined;
      }
    })();
  };

  const registerSession = (sessionId: string, scope: Context, slug: string): void => {
    if (disposed) return;
    const existing = registrations.get(sessionId);
    if (existing !== undefined) {
      // A fallback registration upgrades in place once the catalog is warm;
      // any other duplicate is already current.
      if (existing.source !== 'fallback' || cachedTools === undefined) return;
      unregisterSession(sessionId);
    }
    // The tools must exist even while the Computer is stopped: register the
    // fallback catalog and let each call return the readable not-running
    // error (ADR-0079). The real catalog replaces it once the driver answers.
    const descriptors = cachedTools ?? FALLBACK_TOOLS;
    const source: SessionRegistration['source'] = cachedTools === undefined ? 'fallback' : 'driver';
    const curated = selectCuratedTools(descriptors);
    const disposers: (() => void)[] = [];
    try {
      for (const { raw, descriptor } of curated) {
        const definition = createMcpToolDefinition(scope, {
          name: computerToolName(raw),
          rawName: raw,
          description: descriptor.description,
          inputSchema: descriptor.inputSchema,
          ...(descriptor.outputSchema === undefined
            ? {}
            : { outputSchema: descriptor.outputSchema }),
          call: async (args, execution) => {
            await authorize(execution, sessionId, slug);
            onActivity();
            if (core().registry?.get(slug)?.computerAccess !== true) {
              throw new Error('Computer Access is off for this PersonaBot');
            }
            if (!isComputerRunning()) {
              throw new Error(
                'The Computer is not running; ask the Human to start it from the Computer panel',
              );
            }
            const started = Date.now();
            try {
              const result = await driver.call(raw, args, execution.signal);
              record(
                slug,
                sessionId,
                definition.name,
                auditSummary(raw, args),
                'ok',
                Date.now() - started,
              );
              return result;
            } catch (error) {
              record(
                slug,
                sessionId,
                definition.name,
                auditSummary(raw, args),
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
          name: COMPUTER_PROMPT_SECTION,
          order: scope.systemPrompt.getSectionOrder('TOOL_COMPUTER_USE'),
          text: COMPUTER_GUIDANCE,
        }),
      );
    } catch (error) {
      for (const dispose of disposers.reverse()) dispose();
      throw error;
    }
    registrations.set(sessionId, { slug, scope, disposers, source });
    note(
      `tools on slug=${slug} session=${sessionId} source=${source} count=${disposers.length - 1}`,
    );
    ctx.logger.info(`botharness-computer: Computer tools on for ${slug} (${sessionId}, ${source})`);
    if (source === 'fallback' && isComputerRunning()) warmCatalog();
  };

  const unregisterSession = (sessionId: string): void => {
    const registration = registrations.get(sessionId);
    if (registration === undefined) return;
    registrations.delete(sessionId);
    for (const dispose of [...registration.disposers].reverse()) dispose();
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
    const event: ComputerAuditEvent = {
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

  const authorize = async (
    execution: ToolExecution,
    sessionId: string,
    slug: string,
  ): Promise<void> => {
    const agent = execution.agent;
    if (agent === undefined) throw new Error('Computer tools require a PersonaBot session');
    if (grants.has(sessionId) || isAutoAllowed()) return;
    // Core's `tools/pre-execute` hook owns the Human ask for Computer tools
    // (so it rides the existing Bot DM approval cards and their one-time /
    // always rules); reaching here without a grant means the gate did not run
    // and the call fails closed.
    throw new Error('Computer action is not authorized for this session');
  };

  const onDisposed = function (payload: { agent: Agent }): undefined {
    const sessionId = String(payload.agent.id);
    unregisterSession(sessionId);
    sessions.delete(sessionId);
    grants.delete(sessionId);
    return undefined;
  };

  ctx.on('agent/disposed', onDisposed);

  ctx.inject(['computerUse'], (scope) => {
    const release = scope.computerUse.register(ComputerUseProviderName(COMPUTER_PROVIDER_NAME));
    slotDisposer = () => release();
    return () => {
      slotDisposer = undefined;
    };
  });

  return {
    attachAgent(scope, sessionId, info) {
      if (disposed) return;
      sessions.set(sessionId, { scope, disposed: false });
      const access = core().registry?.get(info.botSlug)?.computerAccess === true;
      note(
        `agent setup session=${sessionId} bot=${info.botSlug} role=${info.rootRole} access=${String(access)}`,
      );
      if (access !== true) return;
      try {
        registerSession(sessionId, scope, info.botSlug);
      } catch (error) {
        ctx.logger.warn(
          `botharness-computer: failed to register Computer tools for ${info.botSlug}: ${
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
      const access = core().registry?.get(slug)?.computerAccess === true;
      for (const [sessionId, session] of sessions) {
        if (session.disposed) continue;
        const owner = botSlugOf(sessionId);
        if (owner?.botSlug !== slug) continue;
        if (access) {
          registerSession(sessionId, session.scope, slug);
        } else {
          unregisterSession(sessionId);
        }
      }
    },

    async reconcileAll() {
      if (disposed) return;
      warmCatalog();
      for (const bot of core().registry?.list() ?? []) {
        if (bot.computerAccess === true) await this.reconcileBot(bot.slug);
      }
    },

    async dispose() {
      if (disposed) return;
      disposed = true;
      for (const sessionId of registrations.keys()) unregisterSession(sessionId);
      sessions.clear();
      grants.clear();
      const release = slotDisposer;
      slotDisposer = undefined;
      if (release !== undefined) await release();
      await driver.close();
    },
  };
}
