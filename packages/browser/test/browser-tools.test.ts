/**
 * Browser Tool Provider: curated catalog, redacted audit, per-PersonaBot
 * access/authorization, per-Bot tab reuse, and serialized actions driven
 * through fake scopes and a fake Bot Browser runtime.
 * @module test/browser-tools
 */
import { describe, expect, it, vi } from 'vitest';

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import type { BotBrowserRuntime } from '../src/runtime/browser.js';
import {
  auditSummary,
  createBrowserToolProvider,
  formatAudit,
  ownsBrowserTool,
  type BrowserAuditEvent,
} from '../src/tool/provider.js';

interface FakeScope {
  readonly definitions: Map<string, ToolDefinition>;
  readonly sections: string[];
  registered(): readonly string[];
}

function fakeScope(): { scope: Context; state: FakeScope } {
  const definitions = new Map<string, ToolDefinition>();
  const sections: string[] = [];
  const scope = {
    tools: {
      register(definition: ToolDefinition) {
        definitions.set(definition.name, definition);
        return () => definitions.delete(definition.name);
      },
    },
    systemPrompt: {
      section(options: { name: string }) {
        sections.push(options.name);
        return () => undefined;
      },
      getSectionOrder: () => 3000,
    },
  } as unknown as Context;
  return {
    scope,
    state: {
      definitions,
      sections,
      registered: () => [...definitions.keys()].sort(),
    },
  };
}

function fakeRuntime(overrides: Partial<BotBrowserRuntime> = {}): BotBrowserRuntime {
  return {
    ensure: vi.fn(async () => undefined),
    isRunning: () => true,
    open: vi.fn(async (url: string) => ({ tabId: 'tab-1', url, title: 'Example Domain' })),
    observe: vi.fn(async () => ({
      url: 'https://example.com/',
      title: 'Example Domain',
      elements: [{ ref: 'e1', role: 'a', name: 'More information' }],
      text: 'Hello world',
    })),
    openWindow: vi.fn(async () => ({ tabId: 'tab-9', url: 'about:blank', title: '' })),
    currentUrl: () => undefined,
    binaryPath: () => undefined,
    stop: vi.fn(async () => undefined),
    ...overrides,
  };
}

interface Harness {
  readonly provider: ReturnType<typeof createBrowserToolProvider>;
  readonly scope: Context;
  readonly state: FakeScope;
  readonly runtime: BotBrowserRuntime;
  readonly audits: BrowserAuditEvent[];
  created(): void;
  setAccess(enabled: boolean): void;
  setAuto(allow: boolean): void;
}

function harness(options: { access: boolean; auto?: boolean }): Harness {
  const { scope, state } = fakeScope();
  const runtime = fakeRuntime();
  const audits: BrowserAuditEvent[] = [];
  let access = options.access;
  let auto = options.auto ?? false;
  const ctx = {
    on() {},
    inject() {},
    provide() {},
    logger: { info: () => undefined, warn: () => undefined },
    get: () => undefined,
  } as unknown as Context;
  const provider = createBrowserToolProvider({
    ctx,
    runtime,
    isAutoAllowed: () => auto,
    audit: (event) => audits.push(event),
    core: () => ({
      registry: {
        get: (slug: string) => (slug === 'bot-a' ? { browserAccess: access } : undefined),
        list: () => [{ slug: 'bot-a', browserAccess: access }],
      },
      ownership: {
        resolve: (sessionId: string) =>
          sessionId === 'session-a' ? { botSlug: 'bot-a', rootRole: 'orchestrator' } : undefined,
      },
    }),
  });
  return {
    provider,
    scope,
    state,
    runtime,
    audits,
    created: () =>
      provider.attachAgent(scope, 'session-a', { botSlug: 'bot-a', rootRole: 'orchestrator' }),
    setAccess: (next) => {
      access = next;
    },
    setAuto: (next) => {
      auto = next;
    },
  };
}

const agent: Agent = { id: 'session-a' } as unknown as Agent;

function execution(name: string): ToolRunContext {
  return {
    callId: 'call-1',
    name,
    arguments: {},
    agent,
    signal: new AbortController().signal,
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  } as unknown as ToolRunContext;
}

describe('curated catalog and audit redaction', () => {
  it('owns exactly the curated model-facing names', () => {
    expect(ownsBrowserTool('browser_open')).toBe(true);
    expect(ownsBrowserTool('browser_observe')).toBe(true);
    expect(ownsBrowserTool('browser_click')).toBe(false);
    expect(ownsBrowserTool('computer_click')).toBe(false);
  });

  it('audits the URL but never page contents or typed text', () => {
    const summary = auditSummary('open', { url: 'https://example.com/account?secret=1' });
    expect(summary).toContain('https://example.com/account');
    expect(auditSummary('observe', {})).toBe('observe');
    expect(auditSummary('nope', {})).toBe('tool');
  });

  it('formats a stable audit line', () => {
    const line = formatAudit({
      at: new Date().toISOString(),
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
      tool: 'browser_open',
      summary: 'url=https://example.com',
      outcome: 'ok',
      durationMs: 42,
    });
    expect(line).toBe(
      'bot=bot-a session=session-a role=orchestrator browser_open url=https://example.com -> ok (42ms)',
    );
  });
});

describe('per-PersonaBot registration, authorization, and tabs', () => {
  it('registers nothing while Browser Access is off', () => {
    const h = harness({ access: false });
    h.created();
    expect(h.state.registered()).toEqual([]);
  });

  it('registers the read-only tools plus guidance when access is on', () => {
    const h = harness({ access: true });
    h.created();
    expect(h.state.registered()).toEqual(['browser_observe', 'browser_open']);
    expect(h.state.sections).toContain('botharness:browser');
  });

  it('fails closed until core records the Browser Authorization grant', async () => {
    const h = harness({ access: true });
    h.created();
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/not authorized/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    h.provider.markAuthorized('session-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
  });

  it('opens a URL, reuses the Bot tab, and observes it with refs', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    const opened = await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    expect(h.runtime.open).toHaveBeenCalledWith('https://example.com', undefined);
    expect(JSON.stringify(opened)).toContain('Opened https://example.com');
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(h.runtime.observe).toHaveBeenCalledWith('tab-1');
    const text = JSON.stringify(observed);
    expect(text).toContain('e1');
    expect(text).toContain('Hello world');
    expect(h.audits.map((event) => event.outcome)).toEqual(['ok', 'ok']);
    expect(h.audits[0]?.summary).toContain('example.com');
  });

  it('rejects a non-http URL and a missing tab readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'file:///etc/passwd' }, execution('browser_open')),
    ).rejects.toThrow(/absolute http\(s\) URL/);
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/call browser_open/);
  });

  it('drops a dead tab and reports it readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.observe = vi.fn(async () => {
      throw new Error('target closed');
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/call browser_open again/);
    expect(h.audits.at(-1)?.outcome).toBe('error');
  });

  it('fails when access is turned off mid-session, and audits the error', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    h.setAccess(false);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.com' }, execution('browser_open')),
    ).rejects.toThrow(/Browser Access is off/);
    expect(h.runtime.open).not.toHaveBeenCalled();
    // Pre-flight refusals (authorization, access) never reach the audit.
    expect(h.audits).toHaveLength(0);
  });

  it('serializes one Bot’s actions while it is busy', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    let active = 0;
    let peak = 0;
    h.runtime.open = vi.fn(async (url: string) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { tabId: 'tab-1', url, title: '' };
    });
    const open = h.state.definitions.get('browser_open')!;
    await Promise.all([
      open.execute({ url: 'https://a.example' }, execution('browser_open')),
      open.execute({ url: 'https://b.example' }, execution('browser_open')),
      open.execute({ url: 'https://c.example' }, execution('browser_open')),
    ]);
    expect(peak).toBe(1);
  });

  it('drops registrations when Browser Access is turned off, and stops the browser on dispose', async () => {
    const h = harness({ access: true });
    h.created();
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
    await h.provider.dispose();
    expect(h.runtime.stop).toHaveBeenCalled();
  });
});
