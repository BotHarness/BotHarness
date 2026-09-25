import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { isChannelRecord } from '../src/channels/channel.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

async function ordinary(
  core: ReturnType<typeof createCore>,
  channelId: string,
  id: string,
): Promise<void> {
  const message = await core.channels.appendMessage(channelId, {
    id,
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'ordinary ' + id,
  });
  expect(message).toBeDefined();
  core.runtime.admitGroupMessage(channelId, id);
}

describe('Group ordinary-message digest', () => {
  it('wakes on the count threshold, observes two messages in one turn, and requires no reply', async () => {
    const home = createTempRoot('botharness-digest-count-');
    const runs: OrchestratorAgentRun[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'one');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(0);
      await ordinary(core, group.id, 'two');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]?.message).toContain('ordinary one');
      expect(runs[0]?.message).toContain('ordinary two');
      expect(runs[0]?.message).toContain('respond only if useful');
      const messages = core.channels.readMessages(group.id);
      expect(messages).toHaveLength(2);
      expect(messages.every((message) => message.author.kind === 'human')).toBe(true);
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-test').read((db) =>
        db
          .prepare(
            "SELECT attempt_state, observed_at, wake_count FROM inbox_admissions WHERE reason = 'group-ordinary' ORDER BY source_event_id",
          )
          .all(),
      );
      expect(facts).toEqual([
        { attempt_state: 'handled', observed_at: expect.any(String), wake_count: 2 },
        { attempt_state: 'handled', observed_at: expect.any(String), wake_count: 2 },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('keeps direct mentions immediate even when ordinary Group messages use a digest', async () => {
    const home = createTempRoot('botharness-digest-mention-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 3600,
      });
      await core.channels.appendMessage(group.id, {
        id: 'mention',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: '@Ada please inspect',
        mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      });
      core.runtime.admitGroupMessage(group.id, 'mention');
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('direct Group mention');
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-test').read((db) =>
        db.prepare('SELECT reason FROM inbox_admissions').all(),
      );
      expect(facts).toEqual([{ reason: 'group-mention' }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('delivers a nonempty digest after the interval and recovers its timer after restart', async () => {
    const home = createTempRoot('botharness-digest-restart-');
    const before = createCore({ dshHome: home, agents: adapter(async () => {}) });
    let groupId = '';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = before.channels.createGroup({ name: 'Team', members: ['ada'] });
      groupId = group.id;
      before.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 1,
      });
      await ordinary(before, group.id, 'only-one');
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }
    const runs: string[] = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      const deadline = Date.now() + 3000;
      while (runs.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      await resumed.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary only-one');
      expect(resumed.channels.readMessages(groupId)[0]?.deliveries).toEqual([
        { botSlug: 'ada', state: 'handled' },
      ]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('waits for the current turn and then delivers a due digest', async () => {
    const home = createTempRoot('botharness-digest-busy-');
    let release = (): void => undefined;
    let started = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const began = new Promise<void>((resolve) => {
      started = resolve;
    });
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
        if (run.message === 'Hold') {
          started();
          await gate;
        }
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      await core.channels.appendMessage(dm.id, {
        id: 'hold',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Hold',
      });
      core.runtime.admitDmMessage({ channelId: dm.id, messageId: 'hold', body: 'Hold' });
      await began;
      await ordinary(core, group.id, 'one');
      await ordinary(core, group.id, 'two');
      expect(runs).toEqual(['Hold']);
      release();
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(2);
      expect(runs[1]).toContain('ordinary one');
    } finally {
      release();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('validates the Human policy command and re-arms a due digest after resume', async () => {
    const home = createTempRoot('botharness-digest-resume-');
    const runs: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        runs.push(run.message);
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      const methods = createBridgeMethods({ ...core, sessions: { list: () => [] } });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'outsider',
          mode: 'digest',
          count: 5,
          intervalSeconds: 1,
        }),
      ).toMatchObject({ ok: false });
      expect(
        methods.channelGroupWakeSet({
          channelId: group.id,
          botSlug: 'ada',
          mode: 'digest',
          count: 5,
          intervalSeconds: 1,
        }),
      ).toMatchObject({
        ok: true,
        value: { channel: { wakePolicies: { ada: { mode: 'digest', revision: 1 } } } },
      });
      await ordinary(core, group.id, 'waiting');
      expect(methods.pause({ slug: 'ada' })).toMatchObject({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(runs).toHaveLength(0);
      expect(methods.resume({ slug: 'ada' })).toMatchObject({ ok: true });
      const deadline = Date.now() + 3000;
      while (runs.length === 0 && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 50));
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]).toContain('ordinary waiting');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('keeps a failed no-side-effect digest retryable with a bounded delay', async () => {
    const home = createTempRoot('botharness-digest-retry-');
    let attempts = 0;
    const core = createCore({
      dshHome: home,
      agents: adapter(async () => {
        attempts += 1;
        throw new Error('Temporary provider failure');
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 1,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'retry-me');
      await core.runtime.whenIdle();
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(attempts).toBe(1);
      const facts = attachOperationalModule(core.operationalDatabase, 'digest-retry').read((db) =>
        db
          .prepare(
            "SELECT attempt_state, side_effect_started_at FROM inbox_admissions WHERE reason = 'group-ordinary'",
          )
          .get(),
      );
      expect(facts).toEqual({ attempt_state: 'retryable', side_effect_started_at: null });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('revokes pending digest admission when a member leaves and keeps deleted records valid', async () => {
    const home = createTempRoot('botharness-digest-revoke-');
    const core = createCore({ dshHome: home, agents: adapter(async () => {}) });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      core.channels.setGroupWakePolicy(group.id, 'ada', {
        mode: 'digest',
        count: 5,
        intervalSeconds: 3600,
      });
      await ordinary(core, group.id, 'pending');
      core.channels.removeGroupMember(group.id, 'ada');
      const fact = attachOperationalModule(core.operationalDatabase, 'digest-revoke').read((db) =>
        db
          .prepare("SELECT attempt_state FROM inbox_admissions WHERE reason = 'group-ordinary'")
          .get(),
      );
      expect(fact).toEqual({ attempt_state: 'needs-repair' });
      const second = core.channels.createGroup({ name: 'Another', members: ['ada'] });
      core.channels.setGroupWakePolicy(second.id, 'ada', {
        mode: 'digest',
        count: 2,
        intervalSeconds: 3600,
      });
      core.channels.deleteGroup(second.id);
      const record = attachOperationalModule(core.operationalDatabase, 'digest-delete').read((db) =>
        db.prepare('SELECT record_json FROM channel_records WHERE channel_id = ?').get(second.id),
      ) as { record_json: string };
      expect(isChannelRecord(JSON.parse(record.record_json), second.id)).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
