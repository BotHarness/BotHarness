/**
 * Computer Tool Provider: registers the single official `ctx.computerUse` slot
 * and injects the curated Computer tools plus guidance into the session scopes
 * of PersonaBots whose Computer Access is on (ADR-0079/0080). Tool calls are
 * attributed, authorized once per session, and audited with redacted
 * summaries; the provider tolerates a stopped Computer.
 * @module @botharness/computer/tool/provider
 */

import type { Context } from '@deepseek-ai/cordis';
import type { Scoped } from '@deepseek-ai/dsh-scope';
import type {} from '@deepseek-ai/dsh-computer-use';
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-user-approval';

import { COMPUTER_GUIDANCE, COMPUTER_TOOLS, computerToolName } from './catalog.js';
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
  /** Core lookups; undefined members degrade to "no access, no attribution". */
  readonly core: () => ComputerCoreLookup;
}

export interface ComputerToolProvider {
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

  const registerSession = async (
    sessionId: string,
    scope: Context,
    slug: string,
  ): Promise<void> => {
    if (registrations.has(sessionId) || disposed) return;
    if (!isComputerRunning()) return; // reconcileAll() after start picks it up
    await driver.ensure();
    const curated = selectCuratedTools(await driver.tools());
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
    registrations.set(sessionId, { slug, scope, disposers });
    ctx.logger.info(`botharness-computer: Computer tools on for ${slug} (${sessionId})`);
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
    if (ctx.approval === undefined)
      throw new Error('Computer actions are not authorized (no approval service)');
    const outcome = await ctx.approval.request({
      agent,
      toolName: execution.name,
      callId: execution.callId,
      reason: `PersonaBot ${slug} wants to act on the shared Computer`,
      signal: execution.signal,
    });
    if (outcome !== 'allowed-once') {
      throw new Error(`Computer action not authorized (${outcome})`);
    }
    grants.add(sessionId);
  };

  const onCreated = function (this: Scoped<Agent>, payload: { agent: Agent }): undefined {
    if (disposed) return undefined;
    const scope = this as unknown as Context;
    const sessionId = String(payload.agent.id);
    sessions.set(sessionId, { scope, disposed: false });
    const owner = botSlugOf(sessionId);
    if (owner === undefined) return undefined;
    if (core().registry?.get(owner.botSlug)?.computerAccess !== true) return undefined;
    void registerSession(sessionId, scope, owner.botSlug).catch((error: unknown) => {
      ctx.logger.warn(
        `botharness-computer: failed to register Computer tools for ${owner.botSlug}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });
    return undefined;
  };

  const onDisposed = function (payload: { agent: Agent }): undefined {
    const sessionId = String(payload.agent.id);
    unregisterSession(sessionId);
    sessions.delete(sessionId);
    grants.delete(sessionId);
    return undefined;
  };

  ctx.on('agent/created', onCreated);
  ctx.on('agent/disposed', onDisposed);

  ctx.inject(['computerUse'], (scope) => {
    const release = scope.computerUse.register(ComputerUseProviderName(COMPUTER_PROVIDER_NAME));
    slotDisposer = () => release();
    return () => {
      slotDisposer = undefined;
    };
  });

  return {
    async reconcileBot(slug) {
      if (disposed) return;
      const access = core().registry?.get(slug)?.computerAccess === true;
      for (const [sessionId, session] of sessions) {
        if (session.disposed) continue;
        const owner = botSlugOf(sessionId);
        if (owner?.botSlug !== slug) continue;
        if (access) {
          await registerSession(sessionId, session.scope, slug);
        } else {
          unregisterSession(sessionId);
        }
      }
    },

    async reconcileAll() {
      if (disposed) return;
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
