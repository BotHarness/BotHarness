import { describe, expect, it } from 'vitest';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type {
  AssignmentAgentRun,
  BotAgentAdapter,
  OrchestratorAssignmentAccess,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { createTestWorkspaceGrants, TEST_GRANT_ID } from './workspace-grant-fixture.js';

function agents() {
  const runs: AssignmentAgentRun[] = [];
  const finishes = new Map<string, () => void>();
  let access: OrchestratorAssignmentAccess | undefined;
  const adapter: BotAgentAdapter = {
    async runOrchestrator(run) {
      access = run.assignments;
    },
    runAssignment(run) {
      runs.push(run);
      return new Promise<void>((resolve) => finishes.set(run.sessionId, resolve));
    },
    requestAssignment(run) {
      runs.push(run);
      return {
        delivery: 'followup',
        done: new Promise<void>((resolve) => finishes.set(run.sessionId, resolve)),
      };
    },
    async stopAssignment(id) {
      finishes.get(id)?.();
    },
    async close() {
      for (const finish of finishes.values()) finish();
    },
  };
  return { adapter, runs, access: () => access, finish: (id: string) => finishes.get(id)?.() };
}

async function fixture(home = createTempRoot('botharness-assignment-attention-')) {
  const live = agents();
  const core = createCore({
    dshHome: home,
    agents: live.adapter,
    workspaces: () => ({
      get: (id) =>
        id === 'test-workspace'
          ? {
              id,
              path: home,
              title: 'Test Workspace',
              status: async () => 'ok',
            }
          : undefined,
      list: () => [],
    }),
  });
  if (core.registry.get('ada') === undefined)
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
  createTestWorkspaceGrants(core.operationalDatabase, home);
  const dm = core.channels.getOrCreateDm('ada', 'Ada');
  if (dm === undefined) throw new Error('Missing DM');
  const channelId = dm.id;
  const methods = createBridgeMethods({ ...core });
  async function start(state: 'waiting-human' | 'blocked', expectsReply = true) {
    const admission = core.runtime.admitDmMessage({
      channelId,
      messageId: 'human-' + crypto.randomUUID(),
      body: 'Start',
    });
    if (!admission.admitted) throw new Error('Not admitted');
    await admission.settled;
    const access = live.access();
    if (access === undefined) throw new Error('Missing Orchestrator');
    const created = access.create({ grantId: TEST_GRANT_ID, purpose: 'Attention QA' });
    if (created.outcome !== 'created') throw new Error('Missing Assignment');
    const run = live.runs.find((run) => run.sessionId === created.assignment.sessionId);
    if (run === undefined) throw new Error('Assignment not started');
    await run.report({ state, summary: 'Private report text', expectsReply });
    return { access, run };
  }
  async function close() {
    await live.adapter.close();
    await core.runtime.whenIdle();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
  return { home, core, live, methods, dm, start, close };
}

describe('shared Assignment Human attention', () => {
  it('uses canonical actions, clears on Human response, and retains independent execution and native counts', async () => {
    const f = await fixture();
    try {
      f.core.states.setSessionState('ada', 'orchestrator', 'thinking', undefined, 'orchestrator');
      f.core.states.setApprovalCount('ada', 1);
      f.core.states.setQuestionCount('ada', 1);
      const waiting = await f.start('waiting-human');
      const blocked = await f.start('blocked');
      expect(f.core.states.snapshot('ada')).toMatchObject({
        state: 'thinking',
        attention: {
          approvalCount: 1,
          questionCount: 1,
          waitingHumanCount: 1,
          blockedCount: 1,
        },
      });
      const item = f.core.humanAttention
        .list({ category: 'action' })
        .items.find((item) => item.assignmentSessionId === waiting.run.sessionId);
      if (item?.sourceEventId === undefined) throw new Error('Missing waiting action');
      expect(
        await f.methods.channelSend({
          channelId: f.dm.id,
          messageId: 'human-' + crypto.randomUUID(),
          body: 'Canary',
          assignmentReply: {
            sessionId: waiting.run.sessionId,
            sourceEventId: item.sourceEventId,
          },
        }),
      ).toMatchObject({ ok: true });
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 1,
        questionCount: 1,
        blockedCount: 1,
      });
      await blocked.access.stop(blocked.run.sessionId);
      expect(f.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 1,
        questionCount: 1,
      });
      expect(f.core.states.snapshot('ada').state).toBe('thinking');
    } finally {
      await f.close();
    }
  }, 60000);

  it('deduplicates notifications, rebuilds unresolved durable attention, and clears dismissed or stopped work', async () => {
    const before = await fixture();
    const waiting = await before.start('waiting-human');
    before.live.finish(waiting.run.sessionId);
    await before.core.runtime.whenIdle();
    const version = before.core.states.version();
    attachOperationalModule(before.core.operationalDatabase, 'attention-test').transaction(
      () => undefined,
      ['assignments'],
    );
    expect(before.core.states.version()).toEqual(version);
    await before.close();
    const after = await fixture(before.home);
    try {
      expect(after.core.states.snapshot('ada')).toMatchObject({
        state: 'idle',
        attention: { approvalCount: 0, waitingHumanCount: 1 },
      });
      const item = after.core.humanAttention
        .list({ category: 'action' })
        .items.find((item) => item.assignmentSessionId === waiting.run.sessionId);
      if (item === undefined) throw new Error('Missing durable action');
      expect(after.core.humanAttentionDecisions.dismiss(item)).toBe(true);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
      const blocked = await after.start('blocked', false);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
      after.live.finish(blocked.run.sessionId);
      await after.core.runtime.whenIdle();
      expect(after.core.states.snapshot('ada').attention).toEqual({
        approvalCount: 0,
        blockedCount: 1,
      });
      await blocked.access.stop(blocked.run.sessionId);
      expect(after.core.states.snapshot('ada').attention).toBeUndefined();
    } finally {
      await after.close();
    }
  }, 60000);
});
