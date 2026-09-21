import type { AssistantStreamFrame } from '@deepseek-ai/dsh-agent';
import { describe, expect, it } from 'vitest';

import { ChannelDraftTracker, type ChannelDraftEvent } from '../src/channels/draft.js';

function delta(argumentsDelta: string, name = 'channel_send'): AssistantStreamFrame {
  return {
    type: 'chunk',
    attemptId: 'attempt-1',
    revision: 1,
    index: 0,
    time: 1,
    chunk: { type: 'tool-call-delta', index: 0, id: 'call-1', name, argumentsDelta },
  } as AssistantStreamFrame;
}

function tracker() {
  const events: ChannelDraftEvent[] = [];
  const drafts = new ChannelDraftTracker((event) => events.push(event));
  drafts.begin('orchestrator-ada', {
    channelId: 'dm-ada',
    botSlug: 'ada',
    canAccess: (id) => id === 'dm-ada' || id === 'group-team',
  });
  return { drafts, events };
}

describe('Orchestrator Channel draft tracker', () => {
  it('projects real tool-argument fragments into successive DM bodies, not assistant finals', () => {
    const { drafts, events } = tracker();
    drafts.accept('assignment-1', delta('{"body":"wrong"}'));
    drafts.accept('orchestrator-ada', delta('{"purpose":"work"}', 'create_assignment'));
    for (const fragment of ['{"body":"你', '好', '，', '世', '界"}']) {
      drafts.accept('orchestrator-ada', delta(fragment));
    }
    expect(
      events.filter((event) => event.type === 'update').map((event) => event.draft.body),
    ).toEqual(['你', '你好', '你好，', '你好，世', '你好，世界']);
    expect(events[0]).toMatchObject({
      type: 'update',
      draft: { channelId: 'dm-ada', botSlug: 'ada' },
    });
    drafts.end('orchestrator-ada');
    expect(events.at(-1)).toMatchObject({ type: 'end', channelId: 'dm-ada' });
  });

  it('decodes incomplete JSON escapes and abandons the preview without committing', () => {
    const { drafts, events } = tracker();
    for (const fragment of ['{"body":"第', '一\\', 'n行', '"}']) {
      drafts.accept('orchestrator-ada', delta(fragment));
    }
    expect(events.filter((event) => event.type === 'update').at(-1)).toMatchObject({
      draft: { body: '第一\n行' },
    });
    drafts.accept('orchestrator-ada', {
      type: 'end',
      attemptId: 'attempt-1',
      revision: 2,
      index: 4,
      outcome: { kind: 'abandoned' },
    } as AssistantStreamFrame);
    expect(events.at(-1)?.type).toBe('end');
  });

  it('moves a draft only to a joined explicit Channel', () => {
    const { drafts, events } = tracker();
    drafts.accept('orchestrator-ada', delta('{"body":"hello","channel_id":"group-team"}'));
    expect(events).toMatchObject([{ type: 'update', draft: { channelId: 'group-team' } }]);
    drafts.end('orchestrator-ada');
    drafts.begin('orchestrator-ada', {
      channelId: 'dm-ada',
      botSlug: 'ada',
      canAccess: (id) => id === 'dm-ada',
    });
    drafts.accept('orchestrator-ada', delta('{"body":"private","channel_id":"group-team"}'));
    expect(events.filter((event) => event.type === 'update')).toHaveLength(1);
  });
});
