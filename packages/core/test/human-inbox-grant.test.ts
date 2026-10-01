import { realpathSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const agents: BotAgentAdapter = {
  async runOrchestrator() {},
  async runAssignment() {},
  async close() {},
  requestAssignment() {
    throw new Error('No Assignment expected');
  },
};

describe('Human Inbox Grant source authority', () => {
  it('keeps plain approval text pending and accepts one Grant-linked reply across windows and restart', async () => {
    const home = createTempRoot('botharness-inbox-grant-');
    const workspace = {
      id: 'project',
      path: realpathSync(createTempRoot('botharness-inbox-project-')),
      title: 'QA Project',
      status: async () => 'ok' as const,
    };
    const workspaces = () => ({
      get: (id: string) => (id === workspace.id ? workspace : undefined),
      list: () => [workspace],
    });
    const core = createCore({ dshHome: home, agents, workspaces });
    const methods = createBridgeMethods({ ...core });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const other = core.channels.getOrCreateDm('bea', 'Bea')!;
      for (const channel of [dm, other])
        await core.channels.appendMessage(channel.id, {
          id: 'request',
          at: '2026-10-01T10:00:00Z',
          author: { kind: 'bot', slug: channel.botSlug! },
          body: 'Choose a project folder.',
          grantRequest: true,
        });
      await core.channels.appendMessage(dm.id, {
        id: 'legacy-text',
        at: '2026-10-01T10:01:00Z',
        author: { kind: 'human' },
        body: '已授权工作区「QA Project」，请继续处理之前的事项。',
        replyTo: 'request',
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toHaveLength(2);
      expect(core.grants.list('ada')).toEqual([]);
      const grant = await core.grants.create('ada', workspace.id);
      const payload = {
        channelId: dm.id,
        body: 'Workspace authorized.',
        replyTo: 'request',
        grantRequestResolution: { requestMessageId: 'request', grantId: grant.id },
      };
      const results = await Promise.all([
        methods.channelSend({
          ...payload,
          messageId: 'human-00000000-0000-4000-8000-000000000001',
        }),
        methods.channelSend({
          ...payload,
          messageId: 'human-00000000-0000-4000-8000-000000000002',
        }),
      ]);
      expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
      expect(
        core.channels.readMessages(dm.id).filter((message) => message.grantRequestResolution),
      ).toHaveLength(1);
      expect(
        core.channels.readHumanTimeline(dm.id, {
          direction: 'around',
          around: 'request',
          olderLimit: 0,
          newerLimit: 0,
        })?.entries,
      ).toMatchObject([{ id: 'request', grantRequestResolved: true }]);
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        { botSlug: 'bea' },
      ]);
      expect(await methods.channelSend({ ...payload, channelId: other.id })).toMatchObject({
        ok: false,
      });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents, workspaces });
    try {
      expect(resumed.humanAttention.list({ category: 'action' }).items).toMatchObject([
        { botSlug: 'bea' },
      ]);
      expect(resumed.channels.message('dm-ada', 'request')).toMatchObject({
        grantRequestResolved: true,
      });
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
});
