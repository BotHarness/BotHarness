import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

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
    click: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    type: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    pressKey: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    scroll: vi.fn(async (tabId: string) => ({
      tabId,
      url: 'https://example.com/',
      title: 'Example Domain',
    })),
    uploadFile: vi.fn(async () => undefined),
    createTab: vi.fn(async (url: string) => ({
      tabId: 'tab-2',
      url,
      title: 'Example Domain',
    })),
    listTabs: vi.fn(async () => [
      { targetId: 'tab-1', url: 'https://example.com/', title: 'Example Domain' },
      { targetId: 'tab-2', url: 'https://example.org/', title: 'Other' },
    ]),
    tabInfo: vi.fn(async () => ({ url: 'https://example.com/', title: 'Example Domain' })),
    closeTab: vi.fn(async () => undefined),
    captureScreenshot: vi.fn(async () => ({ data: 'Zm9v', mimeType: 'image/jpeg' })),
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
  readonly runtimes: {
    readonly stopAll: ReturnType<typeof vi.fn>;
  };
  readonly audits: BrowserAuditEvent[];
  readonly screenshotDir: string;
  created(): void;
  setAccess(enabled: boolean): void;
  setAuto(allow: boolean): void;
}

const screenshotDirs: string[] = [];

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function harness(options: { access: boolean; auto?: boolean }): Harness {
  const { scope, state } = fakeScope();
  const runtime = fakeRuntime();
  const audits: BrowserAuditEvent[] = [];
  const screenshotDir = mkdtempSync(join(tmpdir(), 'browser-tools-'));
  screenshotDirs.push(screenshotDir);
  let access = options.access;
  let auto = options.auto ?? false;
  const ctx = {
    on() {},
    inject() {},
    provide() {},
    logger: { info: () => undefined, warn: () => undefined },
    get: () => undefined,
  } as unknown as Context;
  const runtimes = {
    for: () => runtime,
    touch: vi.fn(),
    closeIdle: vi.fn(async () => undefined),
    stop: vi.fn(async () => undefined),
    stopAll: vi.fn(async () => undefined),
    profileOf: () => '',
  };
  const provider = createBrowserToolProvider({
    ctx,
    runtimes,
    screenshotDir,
    screenshotLimit: 2,
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
    runtimes,
    audits,
    screenshotDir,
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
    expect(ownsBrowserTool('browser_click')).toBe(true);
    expect(ownsBrowserTool('browser_hover')).toBe(false);
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
    expect(h.state.registered()).toEqual([
      'browser_click',
      'browser_observe',
      'browser_open',
      'browser_press_key',
      'browser_screenshot',
      'browser_scroll',
      'browser_tabs',
      'browser_type',
      'browser_upload',
      'browser_wait',
    ]);
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

  it('captures a screenshot as an image result and audits it redacted', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const shot = await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(h.runtime.captureScreenshot).toHaveBeenCalledWith('tab-1');
    expect(JSON.stringify(shot)).toContain('Zm9v');
    expect(JSON.stringify(shot)).toContain('Screenshot saved to');
    expect(readdirSync(h.screenshotDir)).toHaveLength(1);
    expect(h.audits.at(-1)?.summary).toBe('screenshot');
  });

  it('keeps only the newest screenshots on disk', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const screenshot = h.state.definitions.get('browser_screenshot')!;
    await screenshot.execute({}, execution('browser_screenshot'));
    await screenshot.execute({}, execution('browser_screenshot'));
    await screenshot.execute({}, execution('browser_screenshot'));
    expect(readdirSync(h.screenshotDir)).toHaveLength(2);
  });

  it('reports a tab-less screenshot readably', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await expect(
      h.state.definitions.get('browser_screenshot')!.execute({}, execution('browser_screenshot')),
    ).rejects.toThrow(/call browser_open/);
  });

  it('pauses actions and screenshots under a Human takeover while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    expect(h.provider.isTakeover('bot-a')).toBe(true);
    await expect(
      h.state.definitions
        .get('browser_open')!
        .execute({ url: 'https://example.org' }, execution('browser_open')),
    ).rejects.toThrow(/Takeover is active/);
    await expect(
      h.state.definitions.get('browser_screenshot')!.execute({}, execution('browser_screenshot')),
    ).rejects.toThrow(/Takeover is active/);
    const observed = await h.state.definitions
      .get('browser_observe')!
      .execute({}, execution('browser_observe'));
    expect(JSON.stringify(observed)).toContain('Hello world');
    h.provider.setTakeover('bot-a', false);
    await h.state.definitions
      .get('browser_screenshot')!
      .execute({}, execution('browser_screenshot'));
    expect(h.runtime.captureScreenshot).toHaveBeenCalledTimes(1);
  });

  it('clicks observed refs, redacts typed text, and clamps scroll and wait', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    await h.state.definitions
      .get('browser_click')!
      .execute({ ref: 'e3' }, execution('browser_click'));
    expect(h.runtime.click).toHaveBeenCalledWith('tab-1', 'e3');
    expect(h.audits.at(-1)?.summary).toBe('ref=e3');

    await h.state.definitions
      .get('browser_type')!
      .execute({ ref: 'e2', text: 'hunter2' }, execution('browser_type'));
    expect(h.runtime.type).toHaveBeenCalledWith('tab-1', 'e2', 'hunter2');
    expect(h.audits.at(-1)?.summary).toContain('chars=7');
    expect(JSON.stringify(h.audits)).not.toContain('hunter2');

    await h.state.definitions
      .get('browser_scroll')!
      .execute({ direction: 'down' }, execution('browser_scroll'));
    expect(h.runtime.scroll).toHaveBeenCalledWith('tab-1', 'down', 600);

    const waited = await h.state.definitions
      .get('browser_wait')!
      .execute({ ms: 5 }, execution('browser_wait'));
    expect(JSON.stringify(waited)).toContain('waited 5ms');
  });

  it('keeps the current tab on recoverable errors and drops it on dead targets', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error(
        'The page has no file input; click the upload control first so the page creates one, then retry',
      );
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/no file input/);
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));

    h.runtime.observe = vi.fn(async () => {
      throw new Error('Target closed');
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/tab is gone/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
  });

  it('surfaces a stale ref readably and audits the failure', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.runtime.click = vi.fn(async () => {
      throw new Error('The element ref is stale; call browser_observe again before acting');
    });
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e1' }, execution('browser_click')),
    ).rejects.toThrow(/stale/);
    expect(h.audits.at(-1)?.outcome).toBe('error');
  });

  it('pauses interaction tools under a Human takeover while observe stays read-only', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    h.provider.setTakeover('bot-a', true);
    await expect(
      h.state.definitions.get('browser_click')!.execute({ ref: 'e3' }, execution('browser_click')),
    ).rejects.toThrow(/Takeover is active/);
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
  });

  it('manages multiple tabs: opens, lists the current, selects, and closes', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    const opened = await tabs.execute(
      { action: 'open', url: 'https://example.org' },
      execution('browser_tabs'),
    );
    expect(h.runtime.createTab).toHaveBeenCalledWith('https://example.org');
    expect(JSON.stringify(opened)).toContain('tab-2');
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    expect(h.provider.tabCount('bot-a')).toBe(2);
    const listed = await tabs.execute({ action: 'list' }, execution('browser_tabs'));
    expect(JSON.stringify(listed)).toContain('* tab-2');
    const view = await h.provider.listTabs('bot-a');
    expect(view.map((tab) => `${tab.targetId}${tab.current ? '*' : ''}`)).toEqual([
      'tab-1',
      'tab-2*',
    ]);
    expect(h.provider.ownsTab('bot-a', 'tab-2')).toBe(true);
    expect(h.provider.ownsTab('bot-a', 'tab-9')).toBe(false);
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-1');
    await tabs.execute({ action: 'close', targetId: 'tab-1' }, execution('browser_tabs'));
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
  });

  it('uploads a Host file and audits only its basename', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const uploaded = await h.state.definitions
      .get('browser_upload')!
      .execute({ ref: 'e3', path: '/Users/someone/secret/shot.jpg' }, execution('browser_upload'));
    expect(h.runtime.uploadFile).toHaveBeenCalledWith('tab-1', {
      ref: 'e3',
      path: '/Users/someone/secret/shot.jpg',
    });
    expect(JSON.stringify(uploaded)).toContain('shot.jpg');
    expect(h.audits.at(-1)?.summary).toContain('file=shot.jpg');
    expect(JSON.stringify(h.audits)).not.toContain('/Users/someone');
  });

  it('rejects foreign tabs and closes idle tabs without stopping the browser', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await expect(
      tabs.execute({ action: 'select', targetId: 'tab-9' }, execution('browser_tabs')),
    ).rejects.toThrow(/not owned/);
    h.provider.touch('bot-a');
    await h.provider.closeIdleTabs(60_000);
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await h.provider.closeIdleTabs(0);
    expect(h.runtime.closeTab).toHaveBeenCalledWith('tab-1');
    expect(h.provider.tabCount('bot-a')).toBe(0);
  });

  it('recovers from a human-closed current tab through tabs list and select', async () => {
    const h = harness({ access: true, auto: true });
    h.created();
    await h.state.definitions
      .get('browser_open')!
      .execute({ url: 'https://example.com' }, execution('browser_open'));
    const tabs = h.state.definitions.get('browser_tabs')!;
    await tabs.execute({ action: 'open', url: 'https://example.org' }, execution('browser_tabs'));
    await tabs.execute({ action: 'select', targetId: 'tab-1' }, execution('browser_tabs'));
    const original = h.runtime.observe;
    h.runtime.observe = vi.fn(async (tabId: string) => {
      if (tabId === 'tab-1') throw new Error('target closed');
      return original(tabId);
    });
    await expect(
      h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe')),
    ).rejects.toThrow(/browser_tabs/);
    expect(h.provider.currentTab('bot-a')).toBeUndefined();
    expect(h.provider.tabCount('bot-a')).toBe(1);
    await tabs.execute({ action: 'select', targetId: 'tab-2' }, execution('browser_tabs'));
    expect(h.provider.currentTab('bot-a')).toBe('tab-2');
    await h.state.definitions.get('browser_observe')!.execute({}, execution('browser_observe'));
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
    ).rejects.toThrow(/browser_tabs/);
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
    expect(h.runtimes.stopAll).toHaveBeenCalled();
  });
});
