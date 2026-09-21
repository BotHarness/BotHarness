import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createBotRuntime,
  type AssignmentAgentRun,
  type BotAgentAdapter,
  type BotRuntime,
  type HandleDmMessageInput,
  type OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

class DeterministicAgentAdapter implements BotAgentAdapter {
  readonly runs: Array<{ role: 'orchestrator' | 'assignment'; sessionId: string }> = [];

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.runs.push({ role: 'orchestrator', sessionId: run.sessionId });
    const report = await run.createAssignment(`调查并回答：${run.message}`);
    await run.channels.send({ body: `已完成：${report.summary}` });
  }

  async runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.runs.push({ role: 'assignment', sessionId: run.sessionId });
    await run.report({ state: 'completed', summary: `Assignment 已处理「${run.purpose}」` });
  }

  async close(): Promise<void> {}
}

function admit(runtime: BotRuntime, input: HandleDmMessageInput): Promise<void> {
  const admission = runtime.admitDmMessage(input);
  if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
  return admission.settled;
}

function ownershipRows(owner: OperationalDatabaseOwner): Array<{
  session_id: string;
  bot_slug: string;
  root_role: string;
  provenance: string;
  parent_session_id: string | null;
  cwd_reference: string | null;
}> {
  return attachOperationalModule(owner, 'bot-runtime-test').read((database) =>
    database
      .prepare(
        `SELECT session_id, bot_slug, root_role, provenance, parent_session_id, cwd_reference
           FROM session_ownership ORDER BY created_at, session_id`,
      )
      .all(),
  ) as Array<{
    session_id: string;
    bot_slug: string;
    root_role: string;
    provenance: string;
    parent_session_id: string | null;
    cwd_reference: string | null;
  }>;
}

function sourceEvents(owner: OperationalDatabaseOwner): Array<{
  source_event_id: string;
  handled_at: string | null;
  attempt_state: string;
}> {
  return attachOperationalModule(owner, 'bot-runtime-test').read((database) =>
    database
      .prepare(
        `SELECT source_event_id, handled_at, attempt_state FROM source_events
          WHERE source_kind = 'human-message' ORDER BY source_event_id`,
      )
      .all(),
  ) as Array<{ source_event_id: string; handled_at: string | null; attempt_state: string }>;
}

describe('Bot runtime tracer bullet', () => {
  it('keeps a failed Source Event pending, then retries and acknowledges it exactly once', async () => {
    const home = createTempRoot('botharness-bot-runtime-retry-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
      id: 'human-retry',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请重试发布状态',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let orchestratorAttempts = 0;
    let assignmentRuns = 0;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        orchestratorAttempts += 1;
        if (orchestratorAttempts === 1) throw new Error('TRANSPORT: DeepSeek API request failed');
        const report = await run.createAssignment(`调查并回答：${run.message}`);
        await run.channels.send({ body: `已完成：${report.summary}` });
      },
      async runAssignment(run) {
        assignmentRuns += 1;
        await run.report({ state: 'completed', summary: `Assignment 已处理「${run.purpose}」` });
      },
      async close() {},
    };
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents,
      now: FIXED_NOW,
      createEventId: (() => {
        const ids = ['source-retry', 'report-retry'];
        return () => ids.shift() ?? 'unexpected-event';
      })(),
      createMessageId: () => 'bot-retry',
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-retry'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    const input = {
      channelId: dm!.id,
      messageId: 'human-retry',
      body: '请重试发布状态',
    };

    await expect(admit(runtime, input)).rejects.toThrow(/TRANSPORT/);
    expect(sourceEvents(owner)).toEqual([
      { source_event_id: 'source-retry', handled_at: null, attempt_state: 'retryable' },
    ]);
    expect(assignmentRuns).toBe(0);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.author.kind === 'bot'),
    ).toEqual([]);

    await expect(admit(runtime, input)).resolves.toBeUndefined();
    expect(sourceEvents(owner)).toEqual([
      {
        source_event_id: 'source-retry',
        handled_at: FIXED_NOW().toISOString(),
        attempt_state: 'handled',
      },
    ]);
    expect(orchestratorAttempts).toBe(2);
    expect(assignmentRuns).toBe(1);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.author.kind === 'bot'),
    ).toEqual([expect.objectContaining({ id: 'bot-retry' })]);

    await expect(admit(runtime, input)).resolves.toBeUndefined();
    expect(sourceEvents(owner)).toHaveLength(1);
    expect(orchestratorAttempts).toBe(2);
    expect(assignmentRuns).toBe(1);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.author.kind === 'bot'),
    ).toHaveLength(1);

    await runtime.close();
    owner.close();
  });

  it('keeps a partially executed Source Event pending for reconciliation instead of replaying effects', async () => {
    const home = createTempRoot('botharness-bot-runtime-repair-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
      id: 'human-repair',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请核对副作用',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    let orchestratorAttempts = 0;
    let assignmentRuns = 0;
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          orchestratorAttempts += 1;
          const report = await run.createAssignment('核对副作用');
          await run.channels.send({ body: report.summary });
          throw new Error('TRANSPORT after side effects');
        },
        async runAssignment(run) {
          assignmentRuns += 1;
          await run.report({ state: 'completed', summary: '副作用已完成' });
        },
        async close() {},
      },
      now: FIXED_NOW,
      createEventId: (() => {
        const ids = ['source-repair', 'report-repair'];
        return () => ids.shift() ?? 'unexpected-event';
      })(),
      createMessageId: () => 'bot-repair',
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-repair'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });
    const input = {
      channelId: dm!.id,
      messageId: 'human-repair',
      body: '请核对副作用',
    };

    await expect(admit(runtime, input)).rejects.toThrow(/TRANSPORT after side effects/);
    await expect(admit(runtime, input)).rejects.toThrow(/requires reconciliation/);

    expect(sourceEvents(owner)).toEqual([
      { source_event_id: 'source-repair', handled_at: null, attempt_state: 'needs-repair' },
    ]);
    expect(orchestratorAttempts).toBe(1);
    expect(assignmentRuns).toBe(1);
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.author.kind === 'bot'),
    ).toEqual([expect.objectContaining({ id: 'bot-repair', body: '副作用已完成' })]);

    await runtime.close();
    owner.close();
  });

  it('rejects Channel read, search, and send outside the trusted PersonaBot membership', async () => {
    const home = createTempRoot('botharness-bot-runtime-membership-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    expect(registry.create({ slug: 'bob', displayName: 'Bob' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const adaDm = channels.getOrCreateDm('ada', 'Ada');
    const bobDm = channels.getOrCreateDm('bob', 'Bob');
    expect(adaDm).toBeDefined();
    expect(bobDm).toBeDefined();
    await channels.appendMessage(adaDm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '尝试越权',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        runOrchestrator: async (run) => {
          expect(() => run.channels.read({ channelId: bobDm!.id })).toThrow(/not a member/);
          expect(() => run.channels.search({ channelId: bobDm!.id, query: '越权' })).toThrow(
            /not a member/,
          );
          await run.channels.send({ channelId: bobDm!.id, body: '冒充 Bob' });
        },
        runAssignment: async () => undefined,
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    await expect(
      admit(runtime, {
        channelId: adaDm!.id,
        messageId: 'human-1',
        body: '尝试越权',
      }),
    ).rejects.toThrow(/not a member/);
    expect(channels.readMessages(bobDm!.id)).toEqual([]);

    await runtime.close();
    owner.close();
  });

  it('runs one DM through an Orchestrator and durable Assignment report, then restores the read model', async () => {
    const home = createTempRoot('botharness-bot-runtime-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    await channels.appendMessage(dm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: '请调查发布状态',
    });

    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const agents = new DeterministicAgentAdapter();
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents,
      now: FIXED_NOW,
      createSessionId: (() => {
        const ids = ['orchestrator-ada', 'assignment-1'];
        return () => ids.shift() ?? 'unexpected-session';
      })(),
    });

    await admit(runtime, {
      channelId: dm!.id,
      messageId: 'human-1',
      body: '请调查发布状态',
    });

    const messages = channels.readMessages(dm!.id);
    expect(messages[0]).toMatchObject({
      author: { kind: 'bot', slug: 'ada' },
      body: '已完成：Assignment 已处理「调查并回答：请调查发布状态」',
    });
    expect(messages.filter((message) => message.author.kind === 'bot')).toHaveLength(1);
    expect(agents.runs).toEqual([
      { role: 'orchestrator', sessionId: 'orchestrator-ada' },
      { role: 'assignment', sessionId: 'assignment-1' },
    ]);
    expect(runtime.listAssignments('ada')).toEqual([
      expect.objectContaining({
        sessionId: 'assignment-1',
        purpose: '调查并回答：请调查发布状态',
        activity: 'idle',
        latestReport: expect.objectContaining({
          state: 'completed',
          summary: 'Assignment 已处理「调查并回答：请调查发布状态」',
        }),
      }),
    ]);

    await runtime.close();
    owner.close();

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopened = createBotRuntime({
      database: reopenedOwner,
      registry,
      channels,
      agents: new DeterministicAgentAdapter(),
      now: FIXED_NOW,
    });
    expect(reopened.listAssignments('ada')).toEqual([
      expect.objectContaining({
        sessionId: 'assignment-1',
        activity: 'idle',
        latestReport: expect.objectContaining({
          state: 'completed',
          summary: 'Assignment 已处理「调查并回答：请调查发布状态」',
        }),
      }),
    ]);
    await reopened.close();
    reopenedOwner.close();
  });

  it('owns Sessions explicitly and records the run cwd as evidence, not identity', async () => {
    const home = createTempRoot('botharness-bot-runtime-ownership-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(
      registry.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/srv/shared'] }).ok,
    ).toBe(true);
    expect(
      registry.create({ slug: 'bob', displayName: 'Bob', workspaces: ['/srv/shared'] }).ok,
    ).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const adaDm = channels.getOrCreateDm('ada', 'Ada');
    const bobDm = channels.getOrCreateDm('bob', 'Bob');
    for (const [id, channelId] of [
      ['human-ada', adaDm!.id],
      ['human-bob', bobDm!.id],
    ] as const) {
      await channels.appendMessage(channelId, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: id,
      });
    }
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const sessionIds = ['orchestrator-ada', 'orchestrator-bob'];
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        runOrchestrator: async () => undefined,
        runAssignment: async () => undefined,
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => sessionIds.shift() ?? 'unexpected-session',
    });

    await admit(runtime, { channelId: adaDm!.id, messageId: 'human-ada', body: 'hi' });
    await admit(runtime, { channelId: bobDm!.id, messageId: 'human-bob', body: 'hi' });

    expect(ownershipRows(owner)).toEqual([
      {
        session_id: 'orchestrator-ada',
        bot_slug: 'ada',
        root_role: 'orchestrator',
        provenance: 'created',
        parent_session_id: null,
        cwd_reference: '/srv/shared',
      },
      {
        session_id: 'orchestrator-bob',
        bot_slug: 'bob',
        root_role: 'orchestrator',
        provenance: 'created',
        parent_session_id: null,
        cwd_reference: '/srv/shared',
      },
    ]);
    expect(runtime.getAssignment('ada', 'orchestrator-bob')).toBeUndefined();

    await runtime.close();
    owner.close();
  });

  it('records the default runtime workspace as the cwd reference when no workspace is configured', async () => {
    const home = createTempRoot('botharness-bot-runtime-cwd-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    await channels.appendMessage(dm!.id, {
      id: 'human-1',
      at: FIXED_NOW().toISOString(),
      author: { kind: 'human' },
      body: 'hi',
    });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        runOrchestrator: async () => undefined,
        runAssignment: async () => undefined,
        close: async () => undefined,
      },
      workspaceRoot: '/srv/runtime-workspaces',
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    await admit(runtime, { channelId: dm!.id, messageId: 'human-1', body: 'hi' });

    expect(ownershipRows(owner)).toEqual([
      expect.objectContaining({
        session_id: 'orchestrator-ada',
        cwd_reference: '/srv/runtime-workspaces/ada',
      }),
    ]);

    await runtime.close();
    owner.close();
  });

  it('admits DM messages without waiting and runs them serially in order', async () => {
    const home = createTempRoot('botharness-bot-runtime-queue-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    expect(dm).toBeDefined();
    for (const id of ['human-1', 'human-2']) {
      await channels.appendMessage(dm!.id, {
        id,
        at: FIXED_NOW().toISOString(),
        author: { kind: 'human' },
        body: id,
      });
    }
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const started: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          started.push(run.message);
          if (started.length === 1) await gate;
        },
        runAssignment: async () => undefined,
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    const first = runtime.admitDmMessage({
      channelId: dm!.id,
      messageId: 'human-1',
      body: 'human-1',
    });
    const second = runtime.admitDmMessage({
      channelId: dm!.id,
      messageId: 'human-2',
      body: 'human-2',
    });

    expect(first.admitted).toBe(true);
    expect(second.admitted).toBe(true);
    expect(started).toEqual([]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(started).toEqual(['human-1']);

    release();
    if (!first.admitted || !second.admitted) throw new Error('expected both admissions');
    await Promise.all([first.settled, second.settled]);
    expect(started).toEqual(['human-1', 'human-2']);
    const events = sourceEvents(owner);
    expect(events).toHaveLength(2);
    expect(
      events.every((event) => event.attempt_state === 'handled' && event.handled_at !== null),
    ).toBe(true);

    await runtime.close();
    owner.close();
  });

  it('rejects admission for unknown, non-DM, archived, and blank targets without scheduling', async () => {
    const home = createTempRoot('botharness-bot-runtime-admission-');
    const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
    const dm = channels.getOrCreateDm('ada', 'Ada');
    const group = channels.createGroup({ name: 'Team', members: [] });
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    const runs: string[] = [];
    const runtime = createBotRuntime({
      database: owner,
      registry,
      channels,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        runAssignment: async () => undefined,
        close: async () => undefined,
      },
      now: FIXED_NOW,
      createSessionId: () => 'orchestrator-ada',
    });

    expect(
      runtime.admitDmMessage({ channelId: 'dm-missing', messageId: 'm-1', body: 'hello' }),
    ).toEqual({ admitted: false, reason: 'unknown-channel' });
    expect(
      runtime.admitDmMessage({ channelId: group.id, messageId: 'm-2', body: 'hello' }),
    ).toEqual({ admitted: false, reason: 'not-dm' });
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-3', body: '   ' })).toEqual({
      admitted: false,
      reason: 'blank-body',
    });

    registry.setPaused('ada', true);
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-4', body: 'hello' })).toEqual({
      admitted: false,
      reason: 'archived-bot',
    });
    registry.setPaused('ada', false);

    await runtime.close();
    expect(runtime.admitDmMessage({ channelId: dm!.id, messageId: 'm-5', body: 'hello' })).toEqual({
      admitted: false,
      reason: 'runtime-closed',
    });
    expect(runs).toEqual([]);
    owner.close();
  });
});
