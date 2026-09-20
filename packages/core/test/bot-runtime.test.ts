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
  it('does not turn an Orchestrator final message into a Channel message', async () => {
    const home = createTempRoot('botharness-bot-runtime-silent-');
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
      createSessionId: () => 'orchestrator-ada',
    });

    await runtime.handleDmMessage({
      channelId: dm!.id,
      messageId: 'human-1',
      body: '请调查发布状态',
    });

    expect(channels.readMessages(dm!.id)).toEqual([
      expect.objectContaining({ id: 'human-1', author: { kind: 'human' } }),
    ]);

    await runtime.close();
    owner.close();
  });

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

    await expect(runtime.handleDmMessage(input)).rejects.toThrow(/TRANSPORT/);
    expect(sourceEvents(owner)).toEqual([
      { source_event_id: 'source-retry', handled_at: null, attempt_state: 'retryable' },
    ]);
    expect(assignmentRuns).toBe(0);
    expect(
      channels.readMessages(dm!.id).filter((message) => message.author.kind === 'bot'),
    ).toEqual([]);

    await expect(runtime.handleDmMessage(input)).resolves.toBeUndefined();
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

    await expect(runtime.handleDmMessage(input)).resolves.toBeUndefined();
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

    await expect(runtime.handleDmMessage(input)).rejects.toThrow(/TRANSPORT after side effects/);
    await expect(runtime.handleDmMessage(input)).rejects.toThrow(/requires reconciliation/);

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
      runtime.handleDmMessage({
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

    await runtime.handleDmMessage({
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
});
