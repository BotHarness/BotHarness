import { describe, expect, it, vi } from 'vitest';

import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';

import {
  CUA_DRIVER_VERSION,
  driverAssetArch,
  driverAssetUrl,
  driverInstallScript,
  type CuaDriver,
  type DriverToolDescriptor,
} from '../src/tool/driver.js';
import {
  auditSummary,
  createComputerToolProvider,
  formatAudit,
  selectCuratedTools,
  type ComputerAuditEvent,
} from '../src/tool/provider.js';

const DESCRIPTORS: readonly DriverToolDescriptor[] = [
  { name: 'list_windows', description: 'List top-level windows', inputSchema: {} },
  { name: 'get_desktop_state', description: 'Capture the desktop', inputSchema: {} },
  { name: 'get_window_state', description: 'Walk a window tree', inputSchema: {} },
  { name: 'launch_app', description: 'Launch an app', inputSchema: {} },
  { name: 'click', description: 'Click', inputSchema: {} },
  { name: 'type_text', description: 'Type text', inputSchema: {} },
  { name: 'press_key', description: 'Press a key', inputSchema: {} },
  { name: 'hotkey', description: 'Hotkey', inputSchema: {} },
  { name: 'scroll', description: 'Scroll', inputSchema: {} },
  { name: 'verify_state', description: 'Verify', inputSchema: {} },
  { name: 'replay_trajectory', description: 'Not curated', inputSchema: {} },
];

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

function fakeDriver(overrides: Partial<CuaDriver> = {}): CuaDriver {
  return {
    ensure: vi.fn(async () => ({ status: 'present' as const, arch: 'linux-arm64' })),
    tools: vi.fn(async () => DESCRIPTORS),
    call: vi.fn(async (raw: string) => ({
      content: [{ type: 'text', text: `ran ${raw}` }],
    })),
    close: vi.fn(async () => undefined),
    ...overrides,
  };
}

interface Harness {
  readonly provider: ReturnType<typeof createComputerToolProvider>;
  readonly scope: Context;
  readonly state: FakeScope;
  readonly driver: CuaDriver;
  readonly audits: ComputerAuditEvent[];
  readonly created: (payload: { agent: Agent }) => void;
  setAccess(enabled: boolean): void;
  setRunning(running: boolean): void;
  setAuto(allow: boolean): void;
}

function harness(options: {
  access: boolean;
  running: boolean;
  auto?: boolean;
  authorizationScope?: () => string;
}): Harness {
  const { scope, state } = fakeScope();
  const driver = fakeDriver();
  const audits: ComputerAuditEvent[] = [];
  let access = options.access;
  let running = options.running;
  let auto = options.auto ?? false;
  const handlers = new Map<string, (this: unknown, payload: { agent: Agent }) => unknown>();
  const slots: string[] = [];
  const ctx = {
    on(name: string, handler: (this: unknown, payload: { agent: Agent }) => unknown) {
      handlers.set(name, handler);
    },
    inject(_deps: string[], callback: (child: unknown) => unknown) {
      return callback({
        computerUse: {
          register(name: string) {
            slots.push(name);
            return async () => undefined;
          },
        },
      });
    },
    provide() {},
    logger: { info: () => undefined, warn: () => undefined },
    get: () => undefined,
  } as unknown as Context;
  const provider = createComputerToolProvider({
    ctx,
    driver,
    isComputerRunning: () => running,
    isAutoAllowed: () => auto,
    authorizationScope: options.authorizationScope,
    audit: (event) => audits.push(event),
    core: () => ({
      registry: {
        get: (slug: string) => (slug === 'bot-a' ? { computerAccess: access } : undefined),
        list: () => [{ slug: 'bot-a', computerAccess: access }],
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
    driver,
    audits,
    created: () =>
      provider.attachAgent(scope, 'session-a', { botSlug: 'bot-a', rootRole: 'orchestrator' }),
    setAccess: (next) => {
      access = next;
    },
    setRunning: (next) => {
      running = next;
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

describe('driver supply', () => {
  it('maps container architectures onto release assets', () => {
    expect(driverAssetArch('x86_64')).toBe('linux-x86_64');
    expect(driverAssetArch('aarch64')).toBe('linux-arm64');
    expect(driverAssetArch('arm64')).toBe('linux-arm64');
    expect(() => driverAssetArch('riscv64')).toThrow(/unsupported/);
  });

  it('pins the asset URL and the install script to the checksum file', () => {
    expect(driverAssetUrl('linux-arm64')).toContain(`cua-driver-rs-v${CUA_DRIVER_VERSION}`);
    const script = driverInstallScript('linux-arm64');
    expect(script).toContain('checksums.txt');
    expect(script).toContain('sha256sum -c -');
    expect(script).toContain(`D=/config/.botharness/cua-driver/${CUA_DRIVER_VERSION}`);
    expect(script).toContain('$D/cua-driver');
    expect(script).toContain('chown -R abc:abc');
  });
});

describe('curated catalog and audit redaction', () => {
  it('keeps only curated tools that the driver actually lists', () => {
    const curated = selectCuratedTools(DESCRIPTORS);
    expect(curated.map((entry) => entry.raw)).not.toContain('replay_trajectory');
    expect(curated).toHaveLength(10);
  });

  it('never records typed text or predicates, only their size', () => {
    const typed = auditSummary('type_text', { pid: 7, text: 'hunter2-very-secret' });
    expect(typed).toContain('chars=19');
    expect(typed).not.toContain('hunter2');
    const predicate = auditSummary('verify_state', { pid: 7, predicate: 'password == "x"' });
    expect(predicate).toContain('chars=');
    expect(predicate).not.toContain('password');
    expect(auditSummary('unknown_tool', {})).toBe('tool');
  });

  it('formats a stable audit line', () => {
    const line = formatAudit({
      at: new Date().toISOString(),
      botSlug: 'bot-a',
      sessionId: 'session-a',
      rootRole: 'orchestrator',
      tool: 'computer_click',
      summary: 'pid=7 x=1 y=2',
      outcome: 'ok',
      durationMs: 12,
    });
    expect(line).toBe(
      'bot=bot-a session=session-a role=orchestrator computer_click pid=7 x=1 y=2 -> ok (12ms)',
    );
  });
});

describe('per-PersonaBot registration and authorization', () => {
  it('registers nothing while Computer Access is off', async () => {
    const h = harness({ access: false, running: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.driver.tools).not.toHaveBeenCalled());
    expect(h.state.registered()).toEqual([]);
  });

  it('registers curated tools plus guidance immediately, then upgrades to the driver catalog', async () => {
    const h = harness({ access: true, running: true });
    h.created({ agent });
    expect(h.state.registered()).toHaveLength(10);
    expect(h.state.sections).toContain('botharness:computer');
    expect(h.state.registered()).toContain('computer_get_window_state');
    expect(h.state.registered()).not.toContain('computer_replay_trajectory');
    await vi.waitFor(() =>
      expect(h.state.definitions.get('computer_get_window_state')?.description).toBe(
        'Walk a window tree',
      ),
    );
    expect(h.driver.ensure).toHaveBeenCalled();
  });

  it('registers fallback tools while stopped and upgrades when the Computer starts', async () => {
    const h = harness({ access: true, running: false });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    expect(h.driver.tools).not.toHaveBeenCalled();
    expect(h.state.definitions.get('computer_get_window_state')?.description).toContain(
      'Observe one window',
    );
    h.setRunning(true);
    await h.provider.reconcileAll();
    await vi.waitFor(() =>
      expect(h.state.definitions.get('computer_get_window_state')?.description).toBe(
        'Walk a window tree',
      ),
    );
    expect(h.driver.tools).toHaveBeenCalled();
  });

  it('falls back to the minimal catalog when the driver cannot answer', async () => {
    const h = harness({ access: true, running: true });
    h.driver.tools = vi.fn(async () => {
      throw new Error('docker exec failed');
    });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    expect(h.state.definitions.get('computer_click')?.description).toContain('element index');
  });

  it('fails closed until core records the Computer Authorization grant', async () => {
    const h = harness({ access: true, running: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    const click = h.state.definitions.get('computer_click');
    const type = h.state.definitions.get('computer_type_text');
    expect(click).toBeDefined();
    expect(type).toBeDefined();
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      click!.execute({ pid: 7, x: 1, y: 2 }, execution('computer_click')),
    ).rejects.toThrow(/not authorized/);
    h.provider.markAuthorized('session-a');
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
    await click!.execute({ pid: 7, x: 1, y: 2 }, execution('computer_click'));
    await type!.execute({ pid: 7, text: 'hello' }, execution('computer_type_text'));
    expect(h.audits).toHaveLength(2);
    expect(h.audits[0]?.summary).toContain('pid=7');
    expect(h.audits[1]?.summary).toContain('chars=5');
    expect(JSON.stringify(h.audits)).not.toContain('hello');
  });

  it('refuses a decision from the old target and requires a fresh grant after target reset', async () => {
    let scope = 'container:0';
    const h = harness({ access: true, running: true, authorizationScope: () => scope });
    h.created({ agent });
    h.provider.markAuthorized('session-a', scope);
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
    scope = 'local:1';
    h.provider.resetRuntime();
    expect(h.provider.markAuthorized('session-a', 'container:0')).toBe(false);
    expect(h.provider.needsAuthorization('session-a')).toBe(true);
    await expect(
      h.state.definitions.get('computer_click')!.execute({ pid: 7 }, execution('computer_click')),
    ).rejects.toThrow('not authorized');
    expect(h.driver.call).not.toHaveBeenCalled();
    expect(h.provider.markAuthorized('session-a', scope)).toBe(true);
    await h.state.definitions
      .get('computer_click')!
      .execute({ pid: 7 }, execution('computer_click'));
    expect(h.driver.call).toHaveBeenCalledTimes(1);
  });

  it('runs without a grant when the profile auto-allows', async () => {
    const h = harness({ access: true, running: true, auto: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    expect(h.provider.needsAuthorization('session-a')).toBe(false);
    await h.state.definitions
      .get('computer_click')!
      .execute({ pid: 7 }, execution('computer_click'));
  });

  it('does not call the driver when the session is unauthorized', async () => {
    const h = harness({ access: true, running: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    await expect(
      h.state.definitions.get('computer_click')!.execute({ pid: 7 }, execution('computer_click')),
    ).rejects.toThrow(/not authorized/);
    expect(h.driver.call).not.toHaveBeenCalled();
  });

  it('audits driver failures and rethrows', async () => {
    const h = harness({ access: true, running: true, auto: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    h.driver.call = vi.fn(async () => {
      throw new Error('container went away');
    });
    await expect(
      h.state.definitions.get('computer_click')!.execute({ pid: 7 }, execution('computer_click')),
    ).rejects.toThrow('container went away');
    expect(h.audits.at(-1)?.outcome).toBe('error');
    expect(h.audits.at(-1)?.error).toContain('container went away');
  });

  it('drops registrations when Computer Access is turned off', async () => {
    const h = harness({ access: true, running: true });
    h.created({ agent });
    await vi.waitFor(() => expect(h.state.registered()).toHaveLength(10));
    h.setAccess(false);
    await h.provider.reconcileBot('bot-a');
    expect(h.state.registered()).toEqual([]);
  });
});
