import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
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

describe('Bot Group self-leave', () => {
  it('relinquishes creator authority, revokes read/send, keeps peer access and history after restart', async () => {
    const home = createTempRoot('botharness-group-self-leave-');
    let groupId = '';
    const turns: string[] = [];
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        turns.push(run.bot.slug);
        if (run.bot.slug === 'ada') {
          expect(run.channels.leaveGroup({ channelId: groupId })).toEqual({
            channelId: groupId,
            left: true,
          });
          expect(run.channels.leaveGroup({ channelId: groupId })).toEqual({
            channelId: groupId,
            left: false,
          });
          expect(run.channels.list({ channelId: groupId }).channels).toEqual([]);
          expect(() => run.channels.read({ channelId: groupId })).toThrow('not a member');
          await expect(
            run.channels.send({ channelId: groupId, body: 'No longer joined' }),
          ).rejects.toThrow('not a member');
          expect(() =>
            run.channels.renameGroup({ channelId: groupId, name: 'No longer owner' }),
          ).toThrow('owner');
          return;
        }
        expect(run.bot.slug).toBe('bea');
        expect(run.channels.list({ channelId: groupId }).channels).toHaveLength(1);
        expect(
          run.channels.read({ channelId: groupId }).map((item) => item.message.body),
        ).toContain('Before departure');
        await run.channels.send({ channelId: groupId, body: 'Bea remains joined' });
      }),
    });
    try {
      for (const slug of ['ada', 'bea'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup({
        name: 'Colleagues',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      groupId = group.id;
      await core.channels.appendMessage(groupId, {
        id: 'before-leave',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Before departure',
      });
      for (const slug of ['ada', 'bea']) {
        const dm = core.channels.getOrCreateDm(slug, slug.toUpperCase())!;
        const id = 'request-' + slug;
        await core.channels.appendMessage(dm.id, {
          id,
          at: '2026-09-27T00:01:00.000Z',
          author: { kind: 'human' },
          body: slug === 'ada' ? 'Leave the Group' : 'Check the Group',
        });
        core.runtime.admitDmMessage({
          channelId: dm.id,
          messageId: id,
          body: slug === 'ada' ? 'Leave the Group' : 'Check the Group',
        });
        await core.runtime.whenIdle();
      }
      expect(turns).toEqual(['ada', 'bea']);
      expect(core.channels.get(groupId)).toMatchObject({ members: ['bea'] });
      expect(core.channels.get(groupId)?.ownerBotSlug).toBeUndefined();
      expect(
        core.channels
          .readMessages(groupId)
          .map((item) => item.body)
          .sort(),
      ).toEqual(['Before departure', 'Bea remains joined'].sort());
      const methods = createBridgeMethods({
        registry: core.registry,
        states: core.states,
        channels: core.channels,
        ownership: core.ownership,
        roster: core.roster,
      });
      expect(methods.channelRename({ channelId: groupId, name: 'Human managed' })).toMatchObject({
        ok: true,
        value: { channel: { name: 'Human managed', members: ['bea'] } },
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }

    const reopened = createCore({ dshHome: home });
    try {
      expect(reopened.channels.get(groupId)).toMatchObject({
        name: 'Human managed',
        members: ['bea'],
      });
      expect(reopened.channels.get(groupId)?.ownerBotSlug).toBeUndefined();
      expect(reopened.channels.readMessages(groupId).map((item) => item.body)).toContain(
        'Before departure',
      );
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('lets a non-owner leave without changing the Bot creator', async () => {
    const core = createCore({
      dshHome: createTempRoot('botharness-group-peer-leave-'),
      agents: adapter(async (run) => {
        expect(run.bot.slug).toBe('bea');
        const group = run.channels.list({ type: 'group' }).channels[0];
        expect(group).toBeDefined();
        expect(run.channels.leaveGroup({ channelId: group!.id })).toEqual({
          channelId: group!.id,
          left: true,
        });
        expect(() => run.channels.leaveGroup({ channelId: run.inboundChannelId! })).toThrow(
          'Group Channel not found',
        );
      }),
    });
    try {
      for (const slug of ['ada', 'bea'])
        core.registry.create({ slug, displayName: slug.toUpperCase() });
      const group = core.channels.createGroup({
        name: 'Ada owns',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      const dm = core.channels.getOrCreateDm('bea', 'Bea')!;
      await core.channels.appendMessage(dm.id, {
        id: 'peer-leave',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Leave this Group',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'peer-leave',
        body: 'Leave this Group',
      });
      await core.runtime.whenIdle();
      expect(core.channels.get(group.id)).toMatchObject({
        members: ['ada'],
        ownerBotSlug: 'ada',
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });

  it('stops a pending direct Group mention when membership ends', async () => {
    const core = createCore({ dshHome: createTempRoot('botharness-group-leave-pending-') });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const group = core.channels.createGroup({
        name: 'Pending',
        members: ['ada', 'bea'],
        ownerBotSlug: 'ada',
      });
      await core.channels.appendMessageOnce(group.id, {
        id: 'pending-mention',
        at: '2026-09-27T00:00:00.000Z',
        author: { kind: 'human' },
        body: '@Bea check this',
        mentions: [{ botSlug: 'bea', label: 'Bea', start: 0, end: 4 }],
      });
      const admissionState = (): string | undefined =>
        attachOperationalModule(core.operationalDatabase, 'group-leave-test').read((db) => {
          const row = db
            .prepare(
              "SELECT attempt_state FROM inbox_admissions WHERE bot_slug = 'bea' AND reason = 'group-mention'",
            )
            .get() as { attempt_state: string } | undefined;
          return row?.attempt_state;
        });
      expect(admissionState()).toBe('pending');
      core.channels.removeGroupMember(group.id, 'bea');
      expect(admissionState()).toBe('needs-repair');
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
