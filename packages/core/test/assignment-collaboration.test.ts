import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotAttentionQuery } from '../src/runtime/attention.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import {
  createBotRuntime,
  type AssignmentAgentRun,
  type AssignmentRequestDelivery,
  type BotAgentAdapter,
  type BotRuntime,
  type OrchestratorAgentRun,
  type OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { FIXED_NOW, createTempRoot, trackTestOwner } from './helpers.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

/** Drives Assignment turns manually so tests can report and finish on demand. */
class ManualAgents implements BotAgentAdapter {
  readonly started: Array<{ sessionId: string; purpose: string; run: AssignmentAgentRun }> = [];
  readonly resumed: Array<{ sessionId: string; text: string }> = [];
  readonly inboxTurns: string[] = [];
  access: OrchestratorAssignmentAccess | undefined;
  failNextStop = false;
  failInbox: 'before-side-effect' | 'after-side-effect' | undefined;
  readonly #finish = new Map<string, () => void>();

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.access = run.assignments;
    if (run.message.trim().length > 0) return;
    if (this.failInbox === 'after-side-effect') {
      const created = run.assignments.create({ grantId: TEST_GRANT_ID, purpose: 'Follow-up work' });
      if (created.outcome === 'created') this.finish(created.assignment.sessionId);
    }
    if (this.failInbox !== undefined) throw new Error('Inbox turn failed');
    this.inboxTurns.push(run.inbox);
  }

  runAssignment(run: AssignmentAgentRun): Promise<void> {
    this.started.push({ sessionId: run.sessionId, purpose: run.purpose, run });
    return new Promise<void>((resolve) => this.#finish.set(run.sessionId, resolve));
  }

  requestAssignment(run: AssignmentAgentRun): AssignmentRequestDelivery {
    this.resumed.push({ sessionId: run.sessionId, text: run.purpose });
    this.started.push({ sessionId: run.sessionId, purpose: run.purpose, run });
    return {
      delivery: 'followup',
      done: new Promise<void>((resolve) => this.#finish.set(run.sessionId, resolve)),
    };
  }

  finish(sessionId: string): void {
    this.#finish.get(sessionId)?.();
    this.#finish.delete(sessionId);
  }

  finishAll(): void {
    for (const resolve of this.#finish.values()) resolve();
    this.#finish.clear();
  }

  async stopAssignment(sessionId: string): Promise<void> {
    if (this.failNextStop) {
      this.failNextStop = false;
      throw new Error('DSH stop failed');
    }
    this.finish(sessionId);
  }

  async close(): Promise<void> {}
}

function sourceEvents(owner: ReturnType<typeof mountOperationalDatabase>): Array<{
  source_event_id: string;
  source_kind: string;
  observed_at: string | null;
  expects_reply: number;
}> {
  return attachOperationalModule(owner, 'collaboration-test').read((database) =>
    database
      .prepare(
        `SELECT source_event_id, source_kind, observed_at, expects_reply FROM source_events
          ORDER BY rowid`,
      )
      .all(),
  ) as Array<{
    source_event_id: string;
    source_kind: string;
    observed_at: string | null;
    expects_reply: number;
  }>;
}

async function setup(options: { assignmentConcurrencyLimit?: number } = {}): Promise<{
  runtime: BotRuntime;
  grants: WorkspaceGrantStore;
  agents: ManualAgents;
  owner: ReturnType<typeof mountOperationalDatabase>;
  channels: ReturnType<typeof createChannelStore>;
  home: string;
  admit: (body: string, messageId: string) => Promise<void>;
  close: () => Promise<void>;
  dmChannelId: string;
}> {
  const home = createTempRoot('botharness-assignment-collaboration-');
  const registry = createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const channels = createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW });
  const dm = channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('DM missing');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const agents = new ManualAgents();
  const grants = createTestWorkspaceGrants(owner, home);
  const runtime = createBotRuntime({
    database: owner,
    registry,
    channels,
    agents,
    grants,
    now: FIXED_NOW,
    ...(options.assignmentConcurrencyLimit === undefined
      ? {}
      : { assignmentConcurrencyLimit: options.assignmentConcurrencyLimit }),
  });
  return {
    runtime,
    grants,
    agents,
    owner,
    channels,
    home,
    close: async () => {
      agents.finishAll();
      await runtime.whenIdle();
      await runtime.close();
    },
    dmChannelId: dm.id,
    admit: async (body: string, messageId: string) => {
      const admission = runtime.admitDmMessage({ channelId: dm.id, messageId, body });
      if (!admission.admitted) throw new Error(`admission rejected: ${admission.reason}`);
      await admission.settled;
    },
  };
}

describe('Assignment collaboration', () => {
  it('starts parallel Assignments without blocking the Orchestrator turn', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('请同时处理两件事', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const first = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    const second = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 B 方向',
      key: 'research-b',
    });

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('created');
    expect(agents.started.map((run) => run.purpose)).toEqual(
      expect.arrayContaining(['调研 A 方向', '调研 B 方向']),
    );
    expect(runtime.listAssignments('ada')).toHaveLength(2);
    await close();
  });

  it('reuses an idle keyed Assignment and refuses to steal a running key', async () => {
    const { runtime, agents, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    agents.started[0]?.run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');

    const reused = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '继续调研 A 方向',
      key: 'research-a',
    });
    expect(reused.outcome).toBe('reused');
    expect(reused.outcome === 'reused' && reused.assignment.sessionId).toBe(sessionId);
    expect(agents.resumed).toEqual([{ sessionId, text: '继续调研 A 方向' }]);

    const busy = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '再次调研 A 方向',
      key: 'research-a',
    });
    expect(busy.outcome).toBe('key-busy');
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    await close();
  });

  it('stops a running Assignment, rejects late reports, and frees its continuity key', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    await admit('开始调研', 'human-stop');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '持续调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const runningTurn = agents.started[0]?.run;
    if (runningTurn === undefined) throw new Error('Assignment never started');

    const stopped = await access.stop(sessionId);
    expect(stopped.activity).toBe('stopped');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopped');
    expect(() => access.request({ sessionId, mode: 'next-turn', text: '继续' })).toThrow(
      /stopped or stopping/,
    );
    await expect(
      runningTurn.report({ state: 'completed', summary: '取消之后的迟到报告' }),
    ).rejects.toThrow(/transaction/);
    expect(runtime.getAssignment('ada', sessionId)?.latestReport).toBeUndefined();
    expect((await access.stop(sessionId)).activity).toBe('stopped');

    const next = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '重新开始 A 方向',
      key: 'research-a',
    });
    expect(next.outcome).toBe('created');
    expect(next.outcome === 'created' && next.assignment.sessionId).not.toBe(sessionId);
    await close();
    const reopened = createBotRuntime({
      database: owner,
      registry: createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: new ManualAgents(),
      now: FIXED_NOW,
    });
    expect(reopened.getAssignment('ada', sessionId)?.activity).toBe('stopped');
    await reopened.close();
  });

  it('keeps a stopping Assignment reserved when DSH stop rejects, then releases it on retry', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'human-stop-failure');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '可复用的事项',
      key: 'stopping-key',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('idle');

    agents.failNextStop = true;
    await expect(access.stop(sessionId)).rejects.toThrow('DSH stop failed');
    expect(runtime.getAssignment('ada', sessionId)?.activity).toBe('stopping');
    expect(
      access.create({
        grantId: TEST_GRANT_ID,
        purpose: '不得复用停止中的续接键',
        key: 'stopping-key',
      }).outcome,
    ).toBe('key-busy');
    expect(access.create({ grantId: TEST_GRANT_ID, purpose: '不得抢占停止中的名额' }).outcome).toBe(
      'capacity',
    );

    expect((await access.stop(sessionId)).activity).toBe('stopped');
    expect(access.create({ grantId: TEST_GRANT_ID, purpose: '停止完成后可新建' }).outcome).toBe(
      'created',
    );
    await close();
  });
  it('revocation blocks new and resumed work without rewriting an already running turn', async () => {
    const { runtime, grants, agents, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    const access = agents.access;
    if (access === undefined) throw new Error('Orchestrator never ran');
    const created = access.create({
      grantId: TEST_GRANT_ID,
      purpose: '调研 A 方向',
      key: 'research-a',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const permission = runtime.getAssignment('ada', sessionId)?.permission;
    expect(permission?.mode).toBe('workspace-write');

    grants.revoke('ada', TEST_GRANT_ID);
    expect(() => access.create({ grantId: TEST_GRANT_ID, purpose: '新方向' })).toThrow(
      /missing or revoked/,
    );
    expect(() => access.request({ sessionId, mode: 'next-turn', text: '继续' })).toThrow(
      /missing or revoked/,
    );
    expect(() =>
      access.create({ grantId: TEST_GRANT_ID, purpose: '继续', key: 'research-a' }),
    ).toThrow(/missing or revoked/);
    expect(runtime.getAssignment('ada', sessionId)?.permission).toEqual(permission);

    await agents.started[0]!.run.report({ state: 'completed', summary: '已运行的事项完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();
    expect(runtime.getAssignment('ada', sessionId)?.latestReport?.summary).toBe('已运行的事项完成');
    await close();
  });

  it('wakes an idle Orchestrator with one coalesced block and records observation', async () => {
    const { runtime, agents, owner, channels, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');
    const attention = createBotAttentionQuery(
      attachOperationalModule(owner, 'report-attention-test'),
      channels,
    );

    await run.report({ state: 'progress', summary: '里程碑 1' });
    await Promise.resolve();
    expect(agents.inboxTurns).toEqual([]);
    expect(attention.list({ botSlug: 'ada' }).items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reason: 'assignment-report',
          state: 'pending',
          sourceKind: 'assignment-report',
          assignmentSessionId: sessionId,
          assignmentPurpose: '调研 A 方向',
          assignmentReportState: 'progress',
          sourceAvailable: true,
          summary: '里程碑 1',
        }),
      ]),
    );

    await run.report({ state: 'progress', summary: '里程碑 2' });
    await run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();

    expect(agents.inboxTurns).toHaveLength(1);
    expect(
      attention
        .list({ botSlug: 'ada' })
        .items.filter((item) => item.reason === 'assignment-report'),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          state: 'handled',
          assignmentReportState: 'completed',
          assignmentSessionId: sessionId,
        }),
        expect.objectContaining({
          state: 'handled',
          assignmentReportState: 'progress',
          assignmentSessionId: sessionId,
        }),
      ]),
    );
    const injected = agents.inboxTurns[0] ?? '';
    expect(injected).toContain('A 方向完成');
    expect(injected).toContain('repeats 3');
    expect(injected).not.toContain('里程碑 1');
    expect(
      sourceEvents(owner)
        .filter((row) => row.source_kind === 'assignment-report')
        .map((row) => row.observed_at),
    ).toEqual([FIXED_NOW().toISOString(), FIXED_NOW().toISOString(), FIXED_NOW().toISOString()]);

    await admit('继续', 'human-2');
    await runtime.whenIdle();
    expect(agents.inboxTurns).toHaveLength(1);
    await close();
  });

  it('resumes an Assignment when the Orchestrator answers its open ask', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');

    await run.report({ state: 'blocked', summary: '需要决定 A 还是 B', expectsReply: true });
    agents.finish(sessionId);
    await runtime.whenIdle();

    const openAsk = runtime.getAssignment('ada', sessionId)?.openAsk;
    expect(openAsk?.summary).toBe('需要决定 A 还是 B');
    expect(agents.inboxTurns).toHaveLength(1);
    expect(agents.inboxTurns[0]).toContain('WAITING');
    const askId = openAsk?.sourceEventId ?? '';
    expect(agents.inboxTurns[0]).toContain(askId);
    expect(
      sourceEvents(owner).some(
        (row) => row.source_kind === 'assignment-report' && row.expects_reply === 1,
      ),
    ).toBe(true);

    const answered = agents.access.request({
      sessionId,
      mode: 'next-turn',
      text: '选 A',
      answerTo: askId,
    });
    expect(answered.delivery).toBe('followup');
    expect(agents.resumed).toEqual([{ sessionId, text: '选 A' }]);
    expect(runtime.getAssignment('ada', sessionId)?.openAsk).toBeUndefined();
    await close();
  });

  it('projects one open Assignment ask into Human Inbox and clears it when answered', async () => {
    const { runtime, agents, owner, admit, close } = await setup();
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        grantId: TEST_GRANT_ID,
        purpose: 'Choose a direction',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({
        state: 'waiting-human',
        summary: 'Should I choose A or B?',
        expectsReply: true,
      });
      agents.finish(sessionId);
      await runtime.whenIdle();

      const attention = createHumanAttentionQuery(
        attachOperationalModule(owner, 'assignment-human-attention-test'),
      );
      expect(attention.list({ category: 'action' }).items).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-waiting-human',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'Should I choose A or B?',
        },
      ]);
      expect(attention.list({ category: 'action', botSlug: 'bea' }).items).toEqual([]);
      expect(attention.list({ category: 'action', channelId: 'dm-ada' }).items).toEqual([]);
      expect(attention.list({ category: 'info' }).items).toEqual([]);

      const askId = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
      if (askId === undefined) throw new Error('Open ask missing');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Choose A',
        answerTo: askId,
      });
      expect(attention.list({ category: 'action' }).items).toEqual([]);
    } finally {
      await close();
    }
  });

  it('coalesces a blocked Assignment ask, opens its source, and clears it on reply', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    let sessionId = '';
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
      if (created.outcome !== 'created') throw new Error('create failed');
      sessionId = created.assignment.sessionId;
      const run = agents.started[0]!.run;
      await run.report({
        state: 'waiting-human',
        summary: 'Need a decision',
        expectsReply: true,
      });
      const query = createHumanAttentionQuery(
        attachOperationalModule(owner, 'assignment-blocked-human-attention-test'),
      );
      const first = query.list({ category: 'action' }).items;
      expect(first).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-waiting-human',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'Need a decision',
        },
      ]);
      const originalSource = first[0]?.sourceEventId;
      expect(originalSource).toBeDefined();

      await run.report({
        state: 'blocked',
        summary: 'Still blocked; need a grant',
        expectsReply: true,
      });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const revised = query.list({ category: 'action' }).items;
      expect(revised).toHaveLength(1);
      expect(revised[0]).toMatchObject({
        id: 'assignment:' + sessionId,
        kind: 'assignment-blocked',
        summary: 'Still blocked; need a grant',
      });
      expect(revised[0]?.sourceEventId).not.toBe(originalSource);
      expect(query.list({ category: 'info' }).items).toEqual([]);
      expect(query.list({ category: 'action', botSlug: 'bea' }).items).toEqual([]);

      const answerTo = revised[0]?.sourceEventId;
      if (answerTo === undefined) throw new Error('Open blocker missing source');
      agents.access!.request({
        sessionId,
        mode: 'next-turn',
        text: 'Use the new grant',
        answerTo,
      });
      expect(query.list({ category: 'action' }).items).toEqual([]);
      agents.finish(sessionId);
      await runtime.whenIdle();
      expect(query.list({ category: 'action' }).items).toMatchObject([
        {
          id: 'assignment:' + sessionId,
          kind: 'assignment-blocked',
          sourceEventId: answerTo,
          summary: 'Still blocked; need a grant',
        },
      ]);

      agents.access!.request({ sessionId, mode: 'next-turn', text: 'Complete the task' });
      await agents.started.at(-1)!.run.report({
        state: 'completed',
        summary: 'Resolved with the new grant',
      });
      agents.finish(sessionId);
      await runtime.whenIdle();
      expect(query.list({ category: 'action' }).items).toEqual([]);
    } finally {
      await close();
      owner.close();
    }
    const reopened = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const query = createHumanAttentionQuery(
        attachOperationalModule(reopened, 'assignment-blocked-restart-test'),
      );
      expect(query.list({ category: 'action' }).items).toEqual([]);
    } finally {
      reopened.close();
    }
  });

  it('keeps an open ask across a restart', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');
    await run.report({ state: 'waiting-human', summary: '需要 Human 决定', expectsReply: true });
    agents.finish(sessionId);
    await runtime.whenIdle();

    const askId = runtime.getAssignment('ada', sessionId)?.openAsk?.sourceEventId;
    await close();
    expect(askId).toBeDefined();

    const reopened = createBotRuntime({
      database: owner,
      registry: createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: new ManualAgents(),
      now: FIXED_NOW,
    });
    expect(reopened.getAssignment('ada', sessionId)?.openAsk?.sourceEventId).toBe(askId);
    expect(reopened.getAssignment('ada', sessionId)?.activity).toBe('idle');
    await reopened.close();
    owner.close();
  });

  it('releases a stale working reservation after Host restart without deleting the Assignment', async () => {
    const { runtime, owner, home, agents, grants, dmChannelId, admit } = await setup({
      assignmentConcurrencyLimit: 1,
    });
    await admit('开始调研', 'human-restart-capacity');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');
    const created = agents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '原事项',
      key: 'restart-direction',
    });
    if (created.outcome !== 'created') throw new Error('create failed');
    agents.finish(created.assignment.sessionId);
    await runtime.whenIdle();
    await runtime.close();

    // A terminated Host may leave a persisted reservation without a live Agent.
    attachOperationalModule(owner, 'restart-capacity-seed').transaction((database) => {
      database
        .prepare("UPDATE assignments SET activity = 'working' WHERE session_id = ?")
        .run(created.assignment.sessionId);
    });
    const resumedAgents = new ManualAgents();
    const resumed = createBotRuntime({
      database: owner,
      registry: createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: createChannelStore({ rootDir: join(home, 'channels'), now: FIXED_NOW }),
      agents: resumedAgents,
      grants,
      now: FIXED_NOW,
      assignmentConcurrencyLimit: 1,
    });
    expect(resumed.getAssignment('ada', created.assignment.sessionId)?.activity).toBe('error');
    expect(
      resumed.getAssignment('ada', created.assignment.sessionId)?.continuityKey,
    ).toBeUndefined();
    const admission = resumed.admitDmMessage({
      channelId: dmChannelId,
      messageId: 'human-after-restart',
      body: '新事项',
    });
    if (!admission.admitted) throw new Error('DM admission refused');
    await admission.settled;
    if (resumedAgents.access === undefined) throw new Error('Orchestrator never resumed');
    const replacement = resumedAgents.access.create({
      grantId: TEST_GRANT_ID,
      purpose: '新事项',
      key: 'restart-direction',
    });
    expect(replacement.outcome).toBe('created');
    if (replacement.outcome === 'created')
      expect(replacement.assignment.sessionId).not.toBe(created.assignment.sessionId);
    resumedAgents.finishAll();
    await resumed.whenIdle();
    await resumed.close();
    owner.close();
  });

  it('refuses creation beyond the Assignment Concurrency Limit', async () => {
    const { runtime, agents, admit, close } = await setup({ assignmentConcurrencyLimit: 1 });
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    expect(agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' }).outcome).toBe(
      'created',
    );
    const refused = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 B 方向' });
    expect(refused.outcome).toBe('capacity');
    expect(refused.outcome === 'capacity' && refused.message).toContain('retryable: true');
    expect(runtime.listAssignments('ada')).toHaveLength(1);
    await close();
  });
  it('recovers an unobserved due report once after restart', async () => {
    const { agents, owner, home, admit, close } = await setup();
    await admit('Start research', 'human-1');
    const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
    if (created.outcome !== 'created') throw new Error('create failed');
    const run = agents.started[0]!.run;
    await run.report({ state: 'progress', summary: 'Phase one' });
    const reportId = sourceEvents(owner).find(
      (row) => row.source_kind === 'assignment-report',
    )!.source_event_id;
    const testDatabase = attachOperationalModule(owner, 'report-recovery-test');
    testDatabase.transaction((db) => {
      db.prepare(`
        UPDATE source_events
           SET payload_json = ?, expects_reply = 1
         WHERE source_event_id = ?
      `).run(JSON.stringify({ assignmentReport: { state: 'completed' } }), reportId);
    });
    await close();
    owner.close();

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const reopenedChannels = createChannelStore({
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: reopenedChannels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.inboxTurns).toHaveLength(1);
      expect(reopenedAgents.inboxTurns[0]).toContain('Phase one');
      const attention = createBotAttentionQuery(
        attachOperationalModule(reopenedOwner, 'report-recovery-query'),
        reopenedChannels,
      );
      expect(
        attention.list({ botSlug: 'ada' }).items.find((item) => item.id === reportId),
      ).toMatchObject({
        state: 'handled',
        assignmentReportState: 'completed',
      });
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });

  it.each(['before-side-effect', 'after-side-effect'] as const)(
    'tracks every collected report when an Inbox turn fails %s',
    async (failure) => {
      const { runtime, agents, owner, admit, close } = await setup();
      try {
        await admit('Start research', 'human-1');
        const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
        if (created.outcome !== 'created') throw new Error('create failed');
        const run = agents.started[0]!.run;
        agents.failInbox = failure;
        await run.report({ state: 'progress', summary: 'First report' });
        await run.report({ state: 'completed', summary: 'Second report' });
        agents.finish(created.assignment.sessionId);
        await runtime.whenIdle();
        const rows = attachOperationalModule(owner, 'multi-report-recovery-test').read(
          (db) =>
            db
              .prepare(`
              SELECT a.attempt_state, a.side_effect_started_at, e.observed_at
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE a.reason = 'assignment-report'
               ORDER BY e.body
            `)
              .all() as Array<{
              attempt_state: string;
              side_effect_started_at: string | null;
              observed_at: string | null;
            }>,
        );
        expect(rows).toHaveLength(2);
        expect(rows.map((row) => row.attempt_state)).toEqual([
          failure === 'after-side-effect' ? 'needs-repair' : 'retryable',
          failure === 'after-side-effect' ? 'needs-repair' : 'retryable',
        ]);
        expect(rows.every((row) => row.observed_at === null)).toBe(true);
        expect(rows.every((row) => row.side_effect_started_at !== null)).toBe(
          failure === 'after-side-effect',
        );
      } finally {
        await close();
      }
    },
  );

  it('keeps an ignored completed report hidden until the same Assignment reports again', async () => {
    const { runtime, agents, owner, home, admit, close } = await setup();
    let nextReportId = '';
    try {
      await admit('Start research', 'human-1');
      const created = agents.access!.create({
        grantId: TEST_GRANT_ID,
        purpose: 'Research',
        key: 'research',
      });
      if (created.outcome !== 'created') throw new Error('create failed');
      const sessionId = created.assignment.sessionId;
      await agents.started[0]!.run.report({ state: 'completed', summary: 'First result' });
      agents.finish(sessionId);
      await runtime.whenIdle();

      const port = attachOperationalModule(owner, 'human-report-decision-test');
      const query = createHumanAttentionQuery(port);
      const decisions = createHumanAttentionDecisions(port, FIXED_NOW);
      const first = query.list({ category: 'info' }).items;
      expect(first).toMatchObject([
        {
          kind: 'assignment-report',
          botSlug: 'ada',
          assignmentSessionId: sessionId,
          summary: 'First result',
        },
      ]);
      const firstReportId = first[0]?.sourceEventId;
      if (firstReportId === undefined) throw new Error('report source missing');
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(true);
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(true);
      expect(query.list({ category: 'info' }).items).toEqual([]);

      const reused = agents.access!.create({
        grantId: TEST_GRANT_ID,
        purpose: 'Continue research',
        key: 'research',
      });
      if (reused.outcome !== 'reused') throw new Error('Assignment was not reused');
      await agents.started.at(-1)!.run.report({ state: 'completed', summary: 'New result' });
      agents.finish(sessionId);
      await runtime.whenIdle();
      const next = query.list({ category: 'info' }).items;
      expect(next).toMatchObject([
        {
          kind: 'assignment-report',
          assignmentSessionId: sessionId,
          summary: 'New result',
        },
      ]);
      nextReportId = next[0]?.sourceEventId ?? '';
      expect(nextReportId).not.toBe(firstReportId);
      expect(decisions.ignoreAssignmentReport(firstReportId)).toBe(false);
      expect(query.list({ category: 'info', channelId: 'dm-ada' }).items).toEqual([]);
    } finally {
      await close();
      owner.close();
    }
    const reopened = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    try {
      const query = createHumanAttentionQuery(
        attachOperationalModule(reopened, 'human-report-restart'),
      );
      expect(query.list({ category: 'info' }).items[0]?.sourceEventId).toBe(nextReportId);
    } finally {
      reopened.close();
    }
  });

  it('shows an interrupted observed report as needs-repair instead of waking it twice', async () => {
    const { agents, owner, home, admit, close } = await setup();
    await admit('Start research', 'human-1');
    const created = agents.access!.create({ grantId: TEST_GRANT_ID, purpose: 'Research' });
    if (created.outcome !== 'created') throw new Error('create failed');
    await agents.started[0]!.run.report({ state: 'progress', summary: 'Read this report' });
    const reportId = sourceEvents(owner).find(
      (row) => row.source_kind === 'assignment-report',
    )!.source_event_id;
    attachOperationalModule(owner, 'report-interruption-test').transaction((db) => {
      db.prepare('UPDATE source_events SET observed_at = ? WHERE source_event_id = ?').run(
        FIXED_NOW().toISOString(),
        reportId,
      );
      db.prepare(`
        UPDATE inbox_admissions SET observed_at = ?, attempt_state = 'running'
         WHERE source_event_id = ? AND bot_slug = 'ada'
      `).run(FIXED_NOW().toISOString(), reportId);
    });
    await close();
    owner.close();

    const reopenedOwner = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    });
    const reopenedAgents = new ManualAgents();
    const reopenedChannels = createChannelStore({
      rootDir: join(home, 'channels'),
      now: FIXED_NOW,
    });
    const reopenedRuntime = createBotRuntime({
      database: reopenedOwner,
      registry: createPersonaBotRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW }),
      channels: reopenedChannels,
      agents: reopenedAgents,
      now: FIXED_NOW,
    });
    try {
      await reopenedRuntime.whenIdle();
      expect(reopenedAgents.inboxTurns).toHaveLength(0);
      const attention = createBotAttentionQuery(
        attachOperationalModule(reopenedOwner, 'report-interruption-query'),
        reopenedChannels,
      );
      expect(
        attention.list({ botSlug: 'ada' }).items.find((item) => item.id === reportId),
      ).toMatchObject({
        state: 'needs-repair',
        observedAt: FIXED_NOW().toISOString(),
      });
    } finally {
      await reopenedRuntime.close();
      reopenedOwner.close();
    }
  });
});
