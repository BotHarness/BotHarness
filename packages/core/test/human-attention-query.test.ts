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
      const methods = createBridgeMethods({ ...core });
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
      const oldest = core.humanAttention.list({ category: 'info', sort: 'oldest', limit: 1 });
      expect(oldest.items[0]?.messageId).toBe('report-0');
      expect(oldest.nextCursor).toBeDefined();
      expect(
        core.humanAttention.list({
          category: 'info',
          sort: 'oldest',
          limit: 1,
          cursor: oldest.nextCursor!,
        }).items[0]?.messageId,
      ).toBe('report-1');
      expect(() =>
        core.humanAttention.list({ category: 'info', cursor: oldest.nextCursor! }),
      ).toThrow('Human attention cursor is invalid for these filters');
      expect(
        core.humanAttention.list({ category: 'info', botSlug: 'ada', channelId: dm.id }).items,
      ).toHaveLength(3);
      expect(
        core.humanAttention.list({ category: 'info', botSlug: 'bea', channelId: dm.id }).items,
      ).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it('shows native questions as actions until their durable answer or cancellation, including after restart', async () => {
    const home = createTempRoot('botharness-human-question-');
    let activeQuestions = ['question-one'];
    const before = createCore({
      dshHome: home,
      agents: adapter(),
      activeQuestionMessageIds: () => activeQuestions,
    });
    const dmId = 'dm-ada';
    try {
      before.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = before.channels.getOrCreateDm('ada', 'Ada')!;
      await before.channels.appendMessage(dm.id, {
        id: 'question-one',
        at: '2026-09-26T03:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Which branch should I use?',
        userQuestionRequest: {
          sessionId: 'session-one',
          questions: [{ id: 'branch', question: 'Which branch should I use?' }],
        },
      });
      expect(before.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'user-question',
          channelId: dm.id,
          botSlug: 'ada',
          messageId: 'question-one',
          summary: 'Which branch should I use?',
        },
      ]);
      expect(before.humanAttention.list({ category: 'info' }).items).toEqual([]);
      expect(
        before.humanAttention.list({ category: 'action', channelId: 'group-other' }).items,
      ).toEqual([]);
    } finally {
      await before.runtime.close();
      before.operationalDatabase.close();
    }

    activeQuestions = [];
    const resumed = createCore({
      dshHome: home,
      agents: adapter(),
      activeQuestionMessageIds: () => activeQuestions,
    });
    try {
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      await resumed.channels.appendMessage(dmId, {
        id: 'answer-one',
        at: '2026-09-26T03:01:00.000Z',
        author: { kind: 'human' },
        body: 'main',
        replyTo: 'question-one',
        userQuestionResolution: {
          requestMessageId: 'question-one',
          state: 'answered',
          answers: [{ id: 'branch', selected: [], custom: 'main' }],
        },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      activeQuestions = ['question-two'];
      await resumed.channels.appendMessage(dmId, {
        id: 'question-two',
        at: '2026-09-26T03:02:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Should I continue?',
        userQuestionRequest: {
          sessionId: 'session-two',
          questions: [{ id: 'continue', question: 'Should I continue?' }],
        },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toHaveLength(1);
      await resumed.channels.appendMessage(dmId, {
        id: 'cancel-two',
        at: '2026-09-26T03:03:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Question cancelled',
        replyTo: 'question-two',
        userQuestionResolution: { requestMessageId: 'question-two', state: 'cancelled' },
      });
      expect(resumed.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(resumed.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await resumed.runtime.close();
      resumed.operationalDatabase.close();
    }
  });
  it('shows only live unresolved tool approvals as actions and removes them on decision or expiry', async () => {
    const home = createTempRoot('botharness-human-approval-');
    let activeApprovals = ['approval-one'];
    const core = createCore({
      dshHome: home,
      agents: adapter(),
      activeToolApprovalMessageIds: () => activeApprovals,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      await core.channels.appendMessage(dm.id, {
        id: 'approval-one',
        at: '2026-09-26T04:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Request approval for bash',
        toolApprovalRequest: {
          sessionId: 'session-one',
          callId: 'call-one',
          toolName: 'bash',
          role: 'orchestrator',
          cwd: '/tmp/project',
          input: '{"command":"pwd"}',
        },
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        {
          kind: 'tool-approval',
          botSlug: 'ada',
          channelId: dm.id,
          messageId: 'approval-one',
          summary: 'Request approval for bash',
        },
      ]);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
      activeApprovals = [];
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      activeApprovals = ['approval-one'];
      await core.channels.appendMessage(dm.id, {
        id: 'decision-one',
        at: '2026-09-26T04:01:00.000Z',
        author: { kind: 'human' },
        body: 'Approved once',
        replyTo: 'approval-one',
        toolApprovalDecision: { requestMessageId: 'approval-one', outcome: 'allowed-once' },
      });
      expect(core.humanAttention.list({ category: 'action' }).items).toEqual([]);
      expect(core.humanAttention.list({ category: 'info' }).items).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
