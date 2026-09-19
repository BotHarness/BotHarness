import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apply,
  inject,
  mountOperationalDatabase,
  name,
  type BotHarnessCore,
  type PersonaBotRegistry,
} from '../src/index.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

interface Stubs {
  tools: { register: ReturnType<typeof vi.fn> };
  systemPrompt: { section: ReturnType<typeof vi.fn> };
  sessions: { list: ReturnType<typeof vi.fn> };
}

const contexts: Context[] = [];

beforeEach(() => {
  vi.stubEnv('DSH_HOME', createTempRoot('botharness-plugin-home-'));
});

afterEach(async () => {
  while (contexts.length > 0) {
    const ctx = contexts.pop();
    if (ctx !== undefined) await ctx.fiber.dispose();
  }
  vi.unstubAllEnvs();
});

function createStubContext(): { ctx: Context; stubs: Stubs } {
  const ctx = new Context();
  contexts.push(ctx);
  const stubs: Stubs = {
    tools: { register: vi.fn(() => () => undefined) },
    systemPrompt: { section: vi.fn(() => () => undefined) },
    sessions: { list: vi.fn(() => []) },
  };
  ctx.provide('tools', stubs.tools);
  ctx.provide('systemPrompt', stubs.systemPrompt);
  ctx.provide('sessions', stubs.sessions);
  return { ctx, stubs };
}

describe('plugin entry', () => {
  it('declares its identity', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual(['tools', 'systemPrompt', 'sessions']);
  });

  it('registers nothing when disabled', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: false });

    expect(ctx.get('botharness')).toBeUndefined();
    expect(ctx.get('botharnessBridge')).toBeUndefined();
    expect(stubs.tools.register).not.toHaveBeenCalled();
    expect(stubs.systemPrompt.section).not.toHaveBeenCalled();
  });

  it('provides the core and registers memory tools', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });

    expect(ctx.get('botharness')).toMatchObject({
      rootDir: expect.stringContaining('botharness'),
      operationalDatabase: expect.objectContaining({ mode: 'ready' }),
      registry: expect.anything(),
      states: expect.anything(),
      memory: expect.anything(),
      channels: expect.anything(),
      roster: expect.anything(),
    });
    expect(stubs.tools.register).toHaveBeenCalledTimes(4);
    expect(stubs.tools.register.mock.calls.map((call) => call[0]?.name).sort()).toEqual([
      'memory_list',
      'memory_read',
      'memory_search',
      'memory_write',
    ]);
  });

  it('closes the operational database last with the plugin fiber', async () => {
    const home = createTempRoot('botharness-plugin-lifecycle-');
    vi.stubEnv('DSH_HOME', home);
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as BotHarnessCore | undefined;
    expect(core?.operationalDatabase.mode).toBe('ready');

    await ctx.fiber.dispose();
    expect(core?.operationalDatabase.mode).toBe('closed');

    const nextHost = mountOperationalDatabase({ dshHome: home });
    expect(nextHost.mode).toBe('ready');
    nextHost.close();
  });

  it('keeps file-backed surfaces and diagnostics mounted in database recovery mode', async () => {
    const home = createTempRoot('botharness-plugin-recovery-');
    vi.stubEnv('DSH_HOME', home);
    const firstHost = mountOperationalDatabase({ dshHome: home, instanceId: 'first-host' });
    const { ctx, stubs } = createStubContext();

    try {
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      expect(core?.operationalDatabase.mode).toBe('recovery');
      expect(core?.operationalDatabase.recovery?.code).toBe('lease-unavailable');
      expect(core?.operationalDatabase.diagnostics().leaseHolder?.instanceId).toBe('first-host');
      expect(core?.registry).toBeDefined();
      expect(core?.memory).toBeDefined();
      expect(core?.channels).toBeDefined();
      expect(stubs.tools.register).toHaveBeenCalledTimes(4);
      expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(2);
      expect(ctx.get('botharnessBridge')).toBeDefined();
    } finally {
      await ctx.fiber.dispose();
      firstHost.close();
    }
  });

  it('registers persona and memory-tree prompt sections in order', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });

    expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(2);
    const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
    const persona = sections.find((section) => section?.name === 'botharness:persona');
    const tree = sections.find((section) => section?.name === 'botharness:memory-tree');
    expect(persona?.order).toBeLessThan(tree?.order ?? 0);
    expect(tree?.order).toBe(10500);

    expect(persona?.text({})).toBe('');
    expect(tree?.text({})).toBe('');
    expect(persona?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe(
      '',
    );
    expect(tree?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe('');
  });

  it('registers the client bridge as a typert service on the gateway namespace', () => {
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const bridge = ctx.get('botharnessBridge');
    expect(bridge).toBeDefined();
    expect(bridge?.typertRemote.namespace).toBe('botharness');
    expect(
      remoteMethods(bridge as object).map((marker) => marker.exportName ?? marker.method),
    ).toEqual([
      'list',
      'get',
      'create',
      'update',
      'pause',
      'resume',
      'channels',
      'channelDm',
      'channelCreate',
      'channelMessages',
      'channelSend',
      'sessions',
      'rosterGet',
      'sectionCreate',
      'sectionRename',
      'sectionRemove',
      'channelAssign',
      'sectionReorder',
      'pinsSet',
    ]);
  });

  it('opens the roster domain when storageDomain is served', async () => {
    const { ctx } = createStubContext();
    const fake = createFakeRosterDomain();
    ctx.provide('storageDomain', fake.facility as never);

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as { roster: { available: boolean } } | undefined;
    await vi.waitFor(() => {
      expect(core?.roster.available).toBe(true);
    });
    const bridge = ctx.get('botharnessBridge');
    expect(bridge?.rosterGet()).toEqual({
      pins: [],
      sectionOrder: [],
      sections: [],
    });
  });

  it('keeps loading without storageDomain and reports the roster unavailable', async () => {
    const { ctx } = createStubContext();

    apply(ctx, { enabled: true });

    const core = ctx.get('botharness') as { roster: { available: boolean } } | undefined;
    expect(core?.roster.available).toBe(false);
    const bridge = ctx.get('botharnessBridge');
    expect(bridge).toBeDefined();
    try {
      bridge?.rosterGet();
      expect.unreachable('rosterGet should throw while storage is unavailable');
    } catch (error) {
      expect(error).toMatchObject({
        name: 'RemoteError',
        code: 'storage-unavailable',
        message: 'roster storage is unavailable',
      });
    }
  });

  it('wires the memory store into the registered memory tools and tree section', async () => {
    const home = createTempRoot('botharness-plugin-');
    const workspace = join(home, 'workspace');
    mkdirSync(workspace);
    vi.stubEnv('DSH_HOME', home);
    try {
      const { ctx, stubs } = createStubContext();
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as { registry: PersonaBotRegistry } | undefined;
      expect(core).toBeDefined();
      core?.registry.create({ slug: 'local-bot', displayName: 'Local', workspaces: [workspace] });

      const tools = stubs.tools.register.mock.calls.map(
        (call) => call[0] as ToolDefinition | undefined,
      );
      const write = tools.find((tool) => tool?.name === 'memory_write');
      const read = tools.find((tool) => tool?.name === 'memory_read');
      expect(write).toBeDefined();
      expect(read).toBeDefined();
      const exec = {
        agent: { session: { header: { cwd: workspace } } },
      } as unknown as ToolRunContext;

      await write?.execute(
        {
          path: 'confidences.md',
          body: 'tea over coffee\n',
          summary: 'Preference',
        },
        exec,
      );
      expect(await read?.execute({ path: 'confidences.md' }, exec)).toBe('tea over coffee\n');

      const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
      const tree = sections.find((section) => section?.name === 'botharness:memory-tree');
      expect(tree?.text({ agent: exec.agent })).toContain('confidences.md — Preference');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
