import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(): BotAgentAdapter {
  return {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment() {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('Human attention projection', () => {
  it('finds pending Group join requests, resolves one, and survives restart', async () => {
    const home = createTempRoot('botharness-human-attention-');
    const core = createCore({ dshHome: home, agents: adapter() });
    let groupId = '';
    try {
      const ada = core.registry.create({ slug: 'ada', displayName: 'Ada' });
      if (!ada.ok) throw new Error('Bot fixture failed');
      const group = core.channels.createGroup({ name: 'Team', members: [] });
      groupId = group.id;
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const request = core.channels.requestGroupJoin({
        channelId: group.id,
        requesterBotSlug: 'ada',
        requesterBotCreatedAt: ada.record.createdAt,
      });
      const methods = createBridgeMethods({ ...core, sessions: { list: () => [] } });
      expect(methods.humanAttention({ category: 'action' })).toMatchObject({
        ok: true,
        value: {
          items: [
            {
              id: 'join:' + request.id,
              kind: 'group-join-request',
              channelId: group.id,
              botSlug: 'ada',
              requestId: request.id,
            },
          ],
        },
      });
      expect(methods.humanAttention({ category: 'action', botSlug: 'bea' })).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      expect(
        methods.channelGroupJoinDecide({
          channelId: group.id,
          requestId: request.id,
          accept: true,
        }),
      ).toMatchObject({ ok: true });
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      await core.channels.appendMessage(dm.id, {
        id: 'bot-reply-1',
        at: '2026-09-26T01:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Here is the report.',
      });
      expect(core.humanAttention.list({ category: 'info' }).items).toMatchObject([
        { kind: 'bot-dm-message', botSlug: 'ada', channelId: dm.id, messageId: 'bot-reply-1' },
      ]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const resumed = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(resumed.channels.get(groupId)?.members).toContain('ada');
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(resumed.humanAttention.list({ category: 'info' }).items).toHaveLength(1);
      await resumed.channels.markRead('dm-ada', 'bot-reply-1');
      expect(resumed.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });

  it('pages and binds its cursor to category and filters', async () => {
    const home = createTempRoot('botharness-human-attention-page-');
    const core = createCore({ dshHome: home, agents: adapter() });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      for (const index of [0, 1, 2])
        await core.channels.appendMessage(dm.id, {
          id: 'report-' + index,
          at: new Date(Date.UTC(2026, 8, 26, 2, 0, index)).toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: 'Report ' + index,
        });
      const first = core.humanAttention.list({ category: 'info', limit: 1 });
      expect(first.nextCursor).toBeDefined();
      const second = core.humanAttention.list({
        category: 'info',
        limit: 1,
        cursor: first.nextCursor!,
      });
      expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
      expect(() =>
        core.humanAttention.list({ category: 'action', cursor: first.nextCursor! }),
      ).toThrow('Human attention cursor is invalid for these filters');
      expect(
        core.humanAttention.list({ category: 'info', channelId: 'group-other' }).items,
      ).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
