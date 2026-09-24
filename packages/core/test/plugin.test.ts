import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import { remoteMethods } from '@deepseek-ai/dsh-typert-protocol';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  apply,
  inject,
  mountOperationalDatabase,
  name,
  type BotHarnessCore,
  type PersonaBotRegistry,
} from '../src/index.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createTempRoot, remember } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

interface Stubs {
  tools: { register: ReturnType<typeof vi.fn> };
  systemPrompt: { section: ReturnType<typeof vi.fn> };
  sessions: { list: ReturnType<typeof vi.fn> };
  agents: { create: ReturnType<typeof vi.fn>; resume: ReturnType<typeof vi.fn> };
  skills: { register: ReturnType<typeof vi.fn> };
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
    agents: { create: vi.fn(), resume: vi.fn() },
    skills: { register: vi.fn(() => () => undefined) },
  };
  ctx.provide('tools', stubs.tools);
  ctx.provide('systemPrompt', stubs.systemPrompt);
  ctx.provide('sessions', stubs.sessions);
  ctx.provide('agents', stubs.agents as never);
  ctx.provide('skills', stubs.skills);
  return { ctx, stubs };
}

describe('plugin entry', () => {
  it('declares its identity', () => {
    expect(name).toBe('botharness-core');
    expect(inject).toEqual(['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel']);
  });

  it('registers nothing when disabled', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: false });

    expect(ctx.get('botharness')).toBeUndefined();
    expect(ctx.get('botharnessBridge')).toBeUndefined();
    expect(stubs.tools.register).not.toHaveBeenCalled();
    expect(stubs.systemPrompt.section).not.toHaveBeenCalled();
    expect(stubs.skills.register).not.toHaveBeenCalled();
  });

  it('provides the core without model-visible memory tools', () => {
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
      runtime: expect.anything(),
    });
    expect(stubs.tools.register).not.toHaveBeenCalled();
  });

  it('registers the operational-logs skill for model-only reading', async () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(stubs.skills.register).toHaveBeenCalledTimes(1);
    const registration = stubs.skills.register.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(registration).toMatchObject({
      name: 'reading-operational-logs',
      invocation: { modelInvocable: true, userInvocable: false },
      // The loader validates source/provider as strings on get(): an omitted
      // source lists fine but fails every model load (#248 live diagnosis).
      source: 'runtime',
      provider: 'botharness-core',
    });
    expect(typeof registration['description']).toBe('string');
    expect(typeof registration['content']).toBe('string');
    expect(registration['content']).toBe(
      readFileSync(
        new URL('../../../docs/dev/guides/reading-operational-logs.md', import.meta.url),
        'utf8',
      ),
    );
  });

  it('rebuilds the activity projection from owned Session logs and follows live events', () => {
    const home = createTempRoot('botharness-plugin-activity-');
    vi.stubEnv('DSH_HOME', home);
    const seeded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    createSessionOwnership(attachOperationalModule(seeded, 'session-ownership')).claim({
      sessionId: 'owned-1',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      cwdReference: '/srv/shared',
      at: '2026-09-21T00:00:00.000Z',
    });
    seeded.close();

    const { ctx, stubs } = createStubContext();
    const log = (type: string) => [{ type, time: 1, data: {} }];
    stubs.sessions.list.mockReturnValue([
      {
        id: 'owned-1',
        header: { cwd: '/srv/shared', createdAt: 0 },
        snapshotEvents: () => log('tool/call'),
      },
      {
        id: 'unowned-1',
        header: { cwd: '/srv/shared', createdAt: 0 },
        snapshotEvents: () => log('tool/call'),
      },
    ]);

    apply(ctx, { enabled: true });
    const core = ctx.get('botharness') as BotHarnessCore | undefined;

    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'working' });

    ctx.emit(
      'session/event',
      { id: 'owned-1' } as never,
      { type: 'turn/end', time: 2, data: {} } as never,
    );
    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'done' });

    ctx.emit(
      'session/event',
      { id: 'unowned-1' } as never,
      { type: 'tool/call', time: 3, data: {} } as never,
    );
    expect(core?.states.snapshot('ada').sessions).toEqual({ 'owned-1': 'done' });

    ctx.emit('agent/disposed', { agent: { session: { id: 'owned-1' } } } as never);
    expect(core?.states.snapshot('ada').sessions).toEqual({});
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

    const nextHost = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
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
      expect(() =>
        core?.ownership.claim({
          sessionId: 'session-1',
          botSlug: 'ada',
          rootRole: 'orchestrator',
          at: '2026-09-21T00:00:00.000Z',
        }),
      ).toThrow(/recovery mode/);
      expect(stubs.tools.register).not.toHaveBeenCalled();
      expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(1);
      expect(ctx.get('botharnessBridge')).toBeDefined();
    } finally {
      await ctx.fiber.dispose();
      firstHost.close();
    }
  });

  it('registers the persona prompt section', () => {
    const { ctx, stubs } = createStubContext();

    apply(ctx, { enabled: true });

    expect(stubs.systemPrompt.section).toHaveBeenCalledTimes(1);
    const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
    const persona = sections.find((section) => section?.name === 'botharness:persona');
    expect(persona?.order).toBe(10400);

    expect(persona?.text({})).toBe('');
    expect(persona?.text({ agent: { session: { header: { cwd: '/no/such/workspace' } } } })).toBe(
      '',
    );
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
      'channelRename',
      'channelMessages',
      'channelTimeline',
      'channelReadPosition',
      'channelMarkRead',
      'channelSend',
      'assignments',
      'assignment',
      'sessions',
      'memorySnapshot',
      'memoryFile',
      'memoryHistory',
      'memoryDiff',
      'memorySave',
      'memoryRepair',
      'rosterGet',
      'sectionCreate',
      'sectionRename',
      'sectionRemove',
      'channelAssign',
      'sectionReorder',
      'topReorder',
      'pinsSet',
      'hiddenSet',
      'rosterBatch',
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
      hidden: [],
      sectionOrder: [],
      sections: [],
      topOrder: undefined,
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

  it('resolves memory by Session ownership', async () => {
    const home = createTempRoot('botharness-plugin-');
    vi.stubEnv('DSH_HOME', home);
    try {
      const { ctx, stubs } = createStubContext();
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      expect(core).toBeDefined();
      const created = core?.registry.create({ slug: 'local-bot', displayName: 'Local' });
      expect(created?.ok).toBe(true);
      core?.ownership.claim({
        sessionId: 'orchestrator-local',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:00.000Z',
      });

      const store = core?.memory.storeForSession('orchestrator-local');
      expect(store).toBeDefined();
      await remember(store!, {
        path: 'confidences.md',
        body: 'tea over coffee\n',
        summary: 'Preference',
      });

      const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
      const persona = sections.find((section) => section?.name === 'botharness:persona');
      expect(persona?.text({ agent: { session: { id: 'orchestrator-local' } } })).toBe('');
      expect(core?.memory.storeForSession('unowned-session')).toBeUndefined();
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it('freezes the persona prompt section for the Session and gives an edit to new Sessions', async () => {
    const home = createTempRoot('botharness-plugin-');
    vi.stubEnv('DSH_HOME', home);
    try {
      const { ctx, stubs } = createStubContext();
      apply(ctx, { enabled: true });

      const core = ctx.get('botharness') as BotHarnessCore | undefined;
      const created = core?.registry.create({ slug: 'local-bot', displayName: 'Local' });
      expect(created?.ok).toBe(true);
      core?.ownership.claim({
        sessionId: 'orchestrator-local',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:00.000Z',
      });
      core?.ownership.claim({
        sessionId: 'orchestrator-new',
        botSlug: 'local-bot',
        rootRole: 'orchestrator',
        at: '2026-09-21T00:00:01.000Z',
      });

      const memoryDir = core?.registry.memoryDirFor('local-bot');
      if (memoryDir === undefined) throw new Error('memory dir missing');
      writeFileSync(join(memoryDir, 'PERSONA.md'), '# Persona v1\n');

      const sections = stubs.systemPrompt.section.mock.calls.map((call) => call[0]);
      const persona = sections.find((section) => section?.name === 'botharness:persona');
      const running = { agent: { session: { id: 'orchestrator-local' } } };
      expect(persona?.text(running)).toBe('# Persona v1\n');

      writeFileSync(join(memoryDir, 'PERSONA.md'), '# Persona v2\n');

      expect(persona?.text(running)).toBe('# Persona v1\n');
      expect(persona?.text({ agent: { session: { id: 'orchestrator-new' } } })).toBe(
        '# Persona v2\n',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
