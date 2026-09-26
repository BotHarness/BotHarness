import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
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
  readonly #finish = new Map<string, () => void>();

  async runOrchestrator(run: OrchestratorAgentRun): Promise<void> {
    this.access = run.assignments;
    if (run.message.trim().length > 0) return;
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
    const { runtime, agents, owner, admit, close } = await setup();
    await admit('开始调研', 'human-1');
    if (agents.access === undefined) throw new Error('Orchestrator never ran');

    const created = agents.access.create({ grantId: TEST_GRANT_ID, purpose: '调研 A 方向' });
    if (created.outcome !== 'created') throw new Error('create failed');
    const sessionId = created.assignment.sessionId;
    const run = agents.started[0]?.run;
    if (run === undefined) throw new Error('Assignment never started');

    await run.report({ state: 'progress', summary: '里程碑 1' });
    await Promise.resolve();
    expect(agents.inboxTurns).toEqual([]);

    await run.report({ state: 'progress', summary: '里程碑 2' });
    await run.report({ state: 'completed', summary: 'A 方向完成' });
    agents.finish(sessionId);
    await runtime.whenIdle();

    expect(agents.inboxTurns).toHaveLength(1);
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
});
