import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function admissionStates(core: ReturnType<typeof createCore>, botSlug: string): string[] {
  return (
    attachOperationalModule(core.operationalDatabase, 'harvest-test').read((db) =>
      db
        .prepare('SELECT attempt_state FROM inbox_admissions WHERE bot_slug = ? ORDER BY rowid')
        .all(botSlug),
    ) as unknown as Array<{ attempt_state: string }>
  ).map((row) => row.attempt_state);
}

async function admitMention(
  core: ReturnType<typeof createCore>,
  groupId: string,
  id: string,
  body: string,
): Promise<void> {
  await core.channels.appendMessageOnce(groupId, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body,
    mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
  });
}

function admit(core: ReturnType<typeof createCore>, groupId: string, id: string): void {
  core.runtime.admitGroupMessage(groupId, id);
}

describe('turn-time harvest', () => {
  it('brings pending mentions-mode Group context into the same turn as a direct mention', async () => {
    const home = createTempRoot('botharness-mentions-context-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: {
        async runOrchestrator(run) {
          runs.push(run.message);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'mentions',
        count: 5,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'prior-context',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'The release code is BLUE-17',
      });
      admit(core, group.id, 'prior-context');
      await core.runtime.whenIdle();
      expect(runs).toEqual([]);
      expect(admissionStates(core, 'ada')).toEqual(['pending']);
      await admitMention(core, group.id, 'context-trigger', '@Ada what is the release code?');
      admit(core, group.id, 'context-trigger');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('Message ID: context-trigger');
      expect(runs[0]).toContain('The release code is BLUE-17');
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('coalesces two pending mentions into one harvest turn', async () => {
    const home = createTempRoot('botharness-harvest-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada first',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m2',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada second',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-m1');
      core.runtime.admitGroupMessage(group.id, 'harvest-m2');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message.startsWith('[Bot Inbox harvest] 2 attention items are ready.')).toBe(true);
      expect(message).toContain('Message ID: harvest-m1');
      expect(message).toContain('Message ID: harvest-m2');
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps a single item free of the harvest preamble', async () => {
    const home = createTempRoot('botharness-harvest-single-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-single',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada solo',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-single');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message).not.toContain('[Bot Inbox harvest]');
      expect(message.startsWith('[Bot Inbox: direct Group mention')).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('harvests a due digest batch together with a mention', async () => {
    const home = createTempRoot('botharness-harvest-digest-');
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 1,
        intervalSeconds: 30,
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-o1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'ordinary chatter',
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'harvest-m1',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada ping',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'harvest-o1');
      core.runtime.admitGroupMessage(group.id, 'harvest-m1');
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const message = runs[0]?.message ?? '';
      expect(message).toContain('[Bot Inbox harvest]');
      expect(message).toContain('Message ID: harvest-m1');
      expect(message).toContain('[Bot Inbox: Group digest]');
      expect(message.indexOf('Message ID: harvest-m1')).toBeLessThan(
        message.indexOf('[Bot Inbox: Group digest]'),
      );
      expect(admissionStates(core, 'ada')).toEqual(['handled', 'handled']);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('leaves every included admission needs-repair when the harvest fails after a side effect', async () => {
    const home = createTempRoot('botharness-harvest-failure-');
    let runs = 0;
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs += 1;
        await run.channels.send({ body: 'partial progress' });
        throw new Error('harvest boom');
      },
      async runAssignment(_run: AssignmentAgentRun) {},
      requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await admitMention(core, group.id, 'harvest-f1', '@Ada one');
      await admitMention(core, group.id, 'harvest-f2', '@Ada two');
      admit(core, group.id, 'harvest-f1');
      admit(core, group.id, 'harvest-f2');
      await core.runtime.whenIdle();

      expect(runs).toBe(1);
      expect(admissionStates(core, 'ada')).toEqual(['needs-repair', 'needs-repair']);
      expect(
        core.channels.readMessages(group.id).some((item) => item.body === 'partial progress'),
      ).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
