import type { Context } from '@deepseek-ai/cordis';
import { createMcpToolDefinition } from '@deepseek-ai/dsh-mcp-client';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';

import { basename } from 'node:path';
import { setTimeout as wait } from 'node:timers/promises';

import { BROWSER_GUIDANCE, BROWSER_TOOLS, browserToolName } from './catalog.js';
import { saveScreenshot } from '../screenshots.js';
import type { BotBrowserRuntimes } from '../runtimes.js';
import type { BrowserTab } from '../runtime/browser.js';

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
  readonly runtimes: BotBrowserRuntimes;
  readonly screenshotDir?: string;
  readonly screenshotLimit?: number;
  readonly isAutoAllowed: () => boolean;
  readonly audit: (event: BrowserAuditEvent) => void;
  readonly note?: (detail: string) => void;
  readonly onActivity?: (slug: string) => void;
  readonly core: () => BrowserCoreLookup;
}

export interface BrowserToolProvider {
  attachAgent(scope: Context, sessionId: string, info: { botSlug: string; rootRole: string }): void;
  executionSignal(sessionId: string): AbortSignal | undefined;
  needsAuthorization(sessionId: string): boolean;
  markAuthorized(sessionId: string): void;
  reconcileBot(slug: string): Promise<void>;
  reconcileAll(): Promise<void>;
  isTakeover(slug: string): boolean;
  setTakeover(slug: string, active: boolean): boolean;
  openForHuman(slug: string, requestedTabId?: string): Promise<BrowserTab>;
  currentTab(slug: string): string | undefined;
  ownsTab(slug: string, targetId: string): boolean;
  listTabs(
    slug: string,
  ): Promise<readonly { targetId: string; url: string; title: string; current: boolean }[]>;
  tabCount(slug: string): number;
  touch(slug: string): void;
  resetBot(slug: string): void;
  closeIdleTabs(idleMs: number): Promise<void>;
  dispose(): Promise<void>;
}

type BrowserToolContent =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly data: string; readonly mimeType: string };

interface SessionRegistration {
  readonly slug: string;
  readonly scope: Context;
  readonly controller: AbortController;
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

const DEAD_TARGET =
  /target closed|no target with given id|session with given id not found|inspected target navigated or closed|session closed|websocket closed|not attached|detached from target|browser has been closed/iu;

function isDeadTarget(message: string): boolean {
  return DEAD_TARGET.test(message);
}

function requiredString(args: Record<string, unknown>, key: string, message: string): string {
  const value = args[key];
  if (typeof value !== 'string' || value.trim() === '') throw new Error(message);
  return value;
}

function boundedNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

export function createBrowserToolProvider(
  options: BrowserToolProviderOptions,
): BrowserToolProvider {
  const { ctx, runtimes, isAutoAllowed, audit, core } = options;
  const note = options.note ?? ((): void => undefined);
  const onActivity = options.onActivity ?? ((): void => undefined);

  const sessions = new Map<string, { scope: Context }>();
  const registrations = new Map<string, SessionRegistration>();
  const grants = new Set<string>();
  interface BotTabs {
    current: string | undefined;
    readonly owned: Set<string>;
    lastActivity: number;
    controlRevision: number;
    observedControlRevision: number;
  }

  const tabsByBot = new Map<string, BotTabs>();

  const botTabs = (slug: string): BotTabs => {
    const existing = tabsByBot.get(slug);
    if (existing !== undefined) return existing;
    const created: BotTabs = {
      current: undefined,
      owned: new Set(),
      lastActivity: Date.now(),
      controlRevision: 0,
      observedControlRevision: 0,
    };
    tabsByBot.set(slug, created);
    return created;
  };

  const dropCurrent = (state: BotTabs): void => {
    if (state.current !== undefined) state.owned.delete(state.current);
    state.current = undefined;
  };

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

  const assertExecutionAllowed = (raw: string, slug: string): void => {
    if (core().registry?.get(slug)?.browserAccess !== true) {
      throw new Error('Browser Access is off for this PersonaBot');
    }
    if (raw !== 'observe' && takeovers.has(slug)) {
      throw new Error(
        'Browser Pause is active for this PersonaBot; ask the Human to Resume in the Browser entry, then call browser_observe before acting',
      );
    }
    if (['click', 'type', 'press_key', 'scroll', 'upload'].includes(raw)) {
      const state = botTabs(slug);
      if (state.observedControlRevision !== state.controlRevision) {
        throw new Error(
          'Browser Resume requires a fresh browser_observe of the current page before acting',
        );
      }
    }
  };

  const runTool = async (
    raw: string,
    args: Record<string, unknown>,
    slug: string,
    signal: AbortSignal,
    assertScreenshotCurrent: () => void,
  ): Promise<{ content: BrowserToolContent[] }> => {
    const runtime = runtimes.for(slug);
    if (raw === 'open') {
      const url = typeof args['url'] === 'string' ? args['url'] : '';
      if (!/^https?:\/\//u.test(url)) {
        throw new Error(
          'browser_open needs an absolute http(s) URL, for example https://example.com',
        );
      }
      const state = botTabs(slug);
      const tab = await runtime.open(url, state.current);
      state.owned.add(tab.tabId);
      state.current = tab.tabId;
      state.lastActivity = Date.now();
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
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      const revision = state.controlRevision;
      const actionable = !takeovers.has(slug);
      let observation;
      try {
        observation = await runtime.observe(tabId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isDeadTarget(message)) throw error;
        dropCurrent(state);
        throw new Error(
          `The Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
        );
      }
      if (
        actionable &&
        !takeovers.has(slug) &&
        state.controlRevision === revision &&
        tabsByBot.get(slug) === state
      ) {
        state.observedControlRevision = revision;
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
          'Browser Pause is active for this PersonaBot; ask the Human to Resume in the Browser entry, then call browser_observe before acting',
        );
      }
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let shot;
      try {
        shot = await runtime.captureScreenshot(tabId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isDeadTarget(message)) throw error;
        dropCurrent(state);
        throw new Error(
          `The Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
        );
      }
      assertScreenshotCurrent();
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
      signal.throwIfAborted();
      const saved =
        options.screenshotDir === undefined
          ? undefined
          : await saveScreenshot(
              options.screenshotDir,
              options.screenshotLimit ?? 100,
              shot.data,
            ).catch(() => undefined);
      signal.throwIfAborted();
      assertScreenshotCurrent();
      return {
        content: [
          { type: 'image', data: shot.data, mimeType: shot.mimeType },
          {
            type: 'text',
            text:
              (saved === undefined ? 'Screenshot captured.' : `Screenshot saved to ${saved}`) +
              (shot.viewport === undefined
                ? ''
                : shot.image !== undefined && shot.image.width !== shot.viewport.width
                  ? ` (image ${shot.image.width}x${shot.image.height} vs viewport ${shot.viewport.width}x${shot.viewport.height}; divide image coordinates by ${(shot.image.width / shot.viewport.width).toFixed(2)} before browser_click x/y)`
                  : ` (viewport ${shot.viewport.width}x${shot.viewport.height}; image coordinates map 1:1 to browser_click x/y)`),
          },
        ],
      };
    }
    if (raw === 'click' || raw === 'type' || raw === 'press_key' || raw === 'scroll') {
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      let page;
      try {
        if (raw === 'click') {
          const ref =
            typeof args['ref'] === 'string' && args['ref'] !== '' ? args['ref'] : undefined;
          const x = typeof args['x'] === 'number' ? args['x'] : undefined;
          const y = typeof args['y'] === 'number' ? args['y'] : undefined;
          if (ref !== undefined) page = await runtime.click(tabId, ref);
          else if (x !== undefined && y !== undefined) page = await runtime.clickAt(tabId, x, y);
          else {
            throw new Error(
              'browser_click needs a ref from browser_observe or x/y coordinates from browser_screenshot',
            );
          }
        } else if (raw === 'type') {
          page = await runtime.type(
            tabId,
            requiredString(args, 'ref', 'browser_type needs a ref from browser_observe'),
            requiredString(args, 'text', 'browser_type needs text to enter'),
          );
        } else if (raw === 'press_key') {
          page = await runtime.pressKey(
            tabId,
            requiredString(args, 'key', 'browser_press_key needs a key'),
          );
        } else {
          page = await runtime.scroll(
            tabId,
            args['direction'] === 'up' ? 'up' : 'down',
            boundedNumber(args['amount'], 100, 2000, 600),
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isDeadTarget(message)) dropCurrent(state);
        throw error;
      }
      return { content: [{ type: 'text', text: `${raw} done — ${page.url}` }] };
    }
    if (raw === 'upload') {
      const state = botTabs(slug);
      const tabId = state.current;
      if (tabId === undefined) {
        throw new Error(
          'This PersonaBot has no Bot Browser tab yet; call browser_open with a URL first',
        );
      }
      const path = requiredString(args, 'path', 'browser_upload needs an absolute file path');
      const ref = typeof args['ref'] === 'string' && args['ref'] !== '' ? args['ref'] : undefined;
      try {
        await runtime.uploadFile(tabId, { ...(ref === undefined ? {} : { ref }), path });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isDeadTarget(message)) dropCurrent(state);
        throw error;
      }
      return {
        content: [{ type: 'text', text: `Uploaded ${basename(path)} to the page.` }],
      };
    }
    if (raw === 'tabs') {
      const action = requiredString(args, 'action', 'browser_tabs needs an action');
      const state = botTabs(slug);
      if (action === 'list') {
        const live = await runtime.listTabs();
        const lines = live
          .filter((tab) => state.owned.has(tab.targetId))
          .map(
            (tab) =>
              `${tab.targetId === state.current ? '* ' : '  '}${tab.targetId} ${tab.url}${
                tab.title === '' ? '' : ` — ${tab.title}`
              }`,
          );
        if (lines.length === 0) {
          throw new Error(
            'This PersonaBot has no Bot Browser tabs; call browser_open or browser_tabs action open',
          );
        }
        return {
          content: [
            { type: 'text', text: `Bot Browser tabs (current marked *):\n${lines.join('\n')}` },
          ],
        };
      }
      if (action === 'open') {
        const url = requiredString(args, 'url', 'browser_tabs action open needs an absolute URL');
        if (!/^https?:\/\//u.test(url)) {
          throw new Error(
            'browser_tabs action open needs an absolute http(s) URL, for example https://example.com',
          );
        }
        const tab = await runtime.createTab(url);
        state.owned.add(tab.tabId);
        state.current = tab.tabId;
        state.lastActivity = Date.now();
        return {
          content: [
            {
              type: 'text',
              text: `Opened ${tab.url}${tab.title === '' ? '' : ` — ${tab.title}`} in a new tab (${tab.tabId})`,
            },
          ],
        };
      }
      if (action === 'select' || action === 'close') {
        const targetId = requiredString(
          args,
          'targetId',
          `browser_tabs action ${action} needs a targetId from action list`,
        );
        if (!state.owned.has(targetId)) {
          throw new Error(
            'That tab is not owned by this PersonaBot; call browser_tabs action list to see its tabs',
          );
        }
        if (action === 'select') {
          let info;
          try {
            info = await runtime.tabInfo(targetId);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (!isDeadTarget(message)) throw error;
            state.owned.delete(targetId);
            if (state.current === targetId) state.current = undefined;
            throw new Error(
              `The requested Bot Browser tab is gone (${message}); call browser_tabs action list to pick another tab, or browser_open`,
            );
          }
          state.current = targetId;
          state.lastActivity = Date.now();
          return {
            content: [
              {
                type: 'text',
                text: `Selected ${targetId}${info.title === '' ? '' : ` — ${info.title}`}`,
              },
            ],
          };
        }
        await runtime.closeTab(targetId);
        state.owned.delete(targetId);
        if (state.current === targetId) state.current = undefined;
        return { content: [{ type: 'text', text: `Closed tab ${targetId}` }] };
      }
      throw new Error(`Unknown browser_tabs action: ${action}`);
    }
    if (raw === 'wait') {
      const ms = boundedNumber(args['ms'], 0, 10_000, 1000);
      await wait(ms, undefined, { signal });
      return { content: [{ type: 'text', text: `waited ${ms}ms` }] };
    }
    throw new Error(`Unknown Bot Browser operation: ${raw}`);
  };

  const unregisterSession = (
    sessionId: string,
    reason = new Error('Browser session was disposed'),
  ): void => {
    const registration = registrations.get(sessionId);
    if (registration === undefined) return;
    registration.controller.abort(reason);
    registrations.delete(sessionId);
    for (const dispose of [...registration.disposers].reverse()) dispose();
  };

  const registerSession = (sessionId: string, scope: Context, slug: string): void => {
    if (disposed) return;
    if (registrations.has(sessionId)) return;
    const disposers: (() => void)[] = [];
    const controller = new AbortController();
    try {
      for (const spec of BROWSER_TOOLS) {
        const screenshotGuards = new WeakMap<ToolExecution, () => void>();
        const definition = createMcpToolDefinition(scope, {
          name: browserToolName(spec.raw),
          rawName: spec.raw,
          description: spec.description,
          inputSchema: spec.inputSchema,
          call: async (args, execution) => {
            const signal = AbortSignal.any([execution.signal, controller.signal]);
            const screenshotState = spec.raw === 'screenshot' ? botTabs(slug) : undefined;
            const controlRevision = screenshotState?.controlRevision;
            const assertScreenshotCurrent = (): void => {
              if (screenshotState === undefined) return;
              assertExecutionAllowed(spec.raw, slug);
              if (
                tabsByBot.get(slug) !== screenshotState ||
                screenshotState.controlRevision !== controlRevision
              ) {
                throw new Error(
                  'Browser control changed during screenshot; retry with a new browser_screenshot after Human Resume',
                );
              }
            };
            screenshotGuards.set(execution, assertScreenshotCurrent);
            signal.throwIfAborted();
            await authorize(execution, sessionId);
            onActivity(slug);
            assertExecutionAllowed(spec.raw, slug);
            const result = await serialize(slug, () => {
              signal.throwIfAborted();
              assertExecutionAllowed(spec.raw, slug);
              assertScreenshotCurrent();
              return runTool(spec.raw, args, slug, signal, assertScreenshotCurrent);
            });
            signal.throwIfAborted();
            assertScreenshotCurrent();
            return result;
          },
        });
        disposers.push(
          scope.tools.register({
            ...definition,
            execute: async (args, execution) => {
              const started = Date.now();
              const input =
                typeof args === 'object' && args !== null ? (args as Record<string, unknown>) : {};
              try {
                const result = await definition.execute(args, execution);
                AbortSignal.any([execution.signal, controller.signal]).throwIfAborted();
                screenshotGuards.get(execution)?.();
                record(
                  slug,
                  sessionId,
                  browserToolName(spec.raw),
                  auditSummary(spec.raw, input),
                  'ok',
                  Date.now() - started,
                );
                return result;
              } catch (error) {
                record(
                  slug,
                  sessionId,
                  browserToolName(spec.raw),
                  auditSummary(spec.raw, input),
                  'error',
                  Date.now() - started,
                  error instanceof Error ? error.message : String(error),
                );
                throw error;
              } finally {
                screenshotGuards.delete(execution);
              }
            },
          }),
        );
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
    registrations.set(sessionId, { slug, scope, controller, disposers });
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

    executionSignal(sessionId) {
      return registrations.get(sessionId)?.controller.signal;
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
          unregisterSession(sessionId, new Error('Browser Access is off for this PersonaBot'));
        }
      }
      if (!access) {
        takeovers.delete(slug);
      }
    },

    isTakeover(slug) {
      return takeovers.has(slug);
    },

    setTakeover(slug, active) {
      if (takeovers.has(slug) !== active) {
        const state = botTabs(slug);
        state.controlRevision += 1;
        note(`observation invalidated slug=${slug} revision=${state.controlRevision}`);
      }
      if (active) takeovers.add(slug);
      else takeovers.delete(slug);
      note(`takeover ${active ? 'on' : 'off'} slug=${slug}`);
      return takeovers.has(slug);
    },

    openForHuman(slug, requestedTabId) {
      return serialize(slug, async () => {
        if (disposed) throw new Error('The Browser Provider is disposed');
        const started = Date.now();
        const state = botTabs(slug);
        state.lastActivity = started;
        onActivity(slug);
        const runtime = runtimes.for(slug);
        await runtime.ensure();
        const live = new Set((await runtime.listTabs()).map((tab) => tab.targetId));
        for (const targetId of state.owned) {
          if (!live.has(targetId)) state.owned.delete(targetId);
        }
        if (state.current !== undefined && !state.owned.has(state.current)) {
          state.current = undefined;
        }
        const targetId =
          requestedTabId !== undefined && state.owned.has(requestedTabId)
            ? requestedTabId
            : (state.current ?? state.owned.values().next().value);
        const tab = await runtime.openWindow(targetId);
        state.owned.add(tab.tabId);
        state.current ??= tab.tabId;
        state.lastActivity = Date.now();
        note(
          `human window ${targetId === undefined ? 'created' : 'revealed'} slug=${slug} durationMs=${Date.now() - started}`,
        );
        return tab;
      });
    },

    currentTab(slug) {
      return tabsByBot.get(slug)?.current;
    },

    ownsTab(slug, targetId) {
      return tabsByBot.get(slug)?.owned.has(targetId) === true;
    },

    async listTabs(slug) {
      const state = tabsByBot.get(slug);
      if (state === undefined || state.owned.size === 0) return [];
      const live = await runtimes
        .for(slug)
        .listTabs()
        .catch(() => []);
      return live
        .filter((tab) => state.owned.has(tab.targetId))
        .map((tab) => ({ ...tab, current: tab.targetId === state.current }));
    },

    tabCount(slug) {
      return tabsByBot.get(slug)?.owned.size ?? 0;
    },

    touch(slug) {
      const state = tabsByBot.get(slug);
      if (state !== undefined) state.lastActivity = Date.now();
    },

    resetBot(slug) {
      tabsByBot.delete(slug);
      takeovers.delete(slug);
    },

    async closeIdleTabs(idleMs) {
      for (const [slug, state] of tabsByBot) {
        if (state.owned.size === 0) continue;
        if (Date.now() - state.lastActivity < idleMs) continue;
        const runtime = runtimes.for(slug);
        for (const targetId of [...state.owned]) {
          await runtime.closeTab(targetId).catch(() => undefined);
        }
        state.owned.clear();
        state.current = undefined;
        note(`idle tabs closed slug=${slug}`);
      }
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
      tabsByBot.clear();
      takeovers.clear();
      await runtimes.stopAll();
      await Promise.all([...queues.values()]);
      queues.clear();
    },
  };
}
