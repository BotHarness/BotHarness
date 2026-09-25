import { describe, expect, it } from 'vitest';

import { createCore } from '../src/plugin.js';
import type {
  AssignmentAgentRun,
  AssignmentRequestDelivery,
  BotAgentAdapter,
  OrchestratorAgentRun,
} from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment(_run: AssignmentAgentRun) {},
    requestAssignment(_run: AssignmentAgentRun): AssignmentRequestDelivery {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

describe('PersonaBot Channel history query', () => {
  it('filters old messages by author, date, and text before paginating, without leaking another Group', async () => {
    const home = createTempRoot('botharness-channel-query-');
    let groupId = '';
    let privateId = '';
    let checked = false;
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        if (run.bot.slug !== 'ada') return;
        const filter = {
          channelId: groupId,
          text: 'NEEDLE',
          authorBotId: 'bea',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-02T00:00:00.000Z',
          limit: 1,
        };
        const first = run.channels.query(filter);
        expect(first.messages.map((view) => view.message.id)).toEqual(['old-100']);
        expect(first.messages[0]?.message.replyToPreview?.body).toBe('needle 5');
        const cursor = first.nextCursor;
        if (cursor === undefined) throw new Error('Expected second history page');
        const second = run.channels.query({ ...filter, cursor });
        expect(second.messages.map((view) => view.message.id)).toEqual(['old-5']);
        expect(second.messages[0]?.message.replyToPreview).toBeUndefined();
        expect(second.nextCursor).toBeUndefined();
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', authorKind: 'human' })
            .messages.map((view) => view.message.id),
        ).toContain('old-210');
        expect(
          run.channels
            .query({ ...filter, from: '2026-09-01T00:01:00.000Z' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-100']);
        expect(() => run.channels.query({ ...filter, text: 'different', cursor })).toThrow(
          'invalid cursor',
        );
        expect(() => run.channels.query({ ...filter, authorKind: 'human' })).toThrow(
          'requires author_kind bot',
        );
        expect(
          run.channels
            .query({ channelId: groupId, text: 'café' })
            .messages.map((view) => view.message.id),
        ).toEqual(['unicode-1']);
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', to: '2026-09-01' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-210', 'old-100', 'old-5']);
        expect(
          run.channels
            .query({ channelId: groupId, text: 'needle', to: '2026-09-01T00:00:05.000Z' })
            .messages.map((view) => view.message.id),
        ).toEqual(['old-5']);
        expect(() => run.channels.query({ channelId: privateId })).toThrow('not a member');
        checked = true;
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      core.registry.create({ slug: 'cee', displayName: 'Cee' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const group = core.channels.createGroup({ name: 'History', members: ['ada', 'bea'] });
      groupId = group.id;
      privateId = core.channels.createGroup({ name: 'Private', members: ['cee'] }).id;
      for (let index = 0; index < 215; index++) {
        await core.channels.appendMessage(groupId, {
          id: 'old-' + index,
          at: new Date(Date.UTC(2026, 8, 1, 0, 0, index)).toISOString(),
          author: index === 5 || index === 100 ? { kind: 'bot', slug: 'bea' } : { kind: 'human' },
          body:
            index === 5 || index === 100 || index === 210 ? 'needle ' + index : 'filler ' + index,
          ...(index === 100 ? { replyTo: 'old-5' } : {}),
        });
      }
      await core.channels.appendMessage(groupId, {
        id: 'unicode-1',
        at: '2026-09-01T00:04:00.000Z',
        author: { kind: 'human' },
        body: 'CAFÉ status',
      });
      await core.channels.appendMessage(dm.id, {
        id: 'ask-history',
        at: '2026-09-02T00:00:00.000Z',
        author: { kind: 'human' },
        body: 'Find old messages',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'ask-history',
        body: 'Find old messages',
      });
      await core.runtime.whenIdle();
      expect(checked).toBe(true);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
