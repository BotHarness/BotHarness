import { describe, expect, it } from 'vitest';

import { groupChannelMessages } from '../src/client/message-groups.js';
import type { ChannelMessage } from '../src/client/store.js';

function message(
  id: string,
  seconds: number,
  author: ChannelMessage['author'] = { kind: 'bot', slug: 'ada' },
): ChannelMessage {
  return {
    id,
    at: new Date(Date.UTC(2026, 8, 22, 0, 0, seconds)).toISOString(),
    author,
    body: id,
  };
}

describe('Channel message visual groups', () => {
  it('joins nearby messages from the exact same sender but not another Bot or Human', () => {
    const groups = groupChannelMessages([
      message('a', 0),
      message('b', 10),
      message('c', 18),
      message('d', 19, { kind: 'bot', slug: 'bob' }),
      message('e', 20, { kind: 'human' }),
      message('f', 22, { kind: 'human' }),
    ]);
    expect(groups.map((group) => group.messages.map((item) => item.id))).toEqual([
      ['a', 'b', 'c'],
      ['d'],
      ['e', 'f'],
    ]);
  });

  it('breaks a run at long gaps, day boundaries and eight bubbles', () => {
    const groups = groupChannelMessages([
      ...Array.from({ length: 9 }, (_, index) => message(`m-${index}`, index * 10)),
      message('late', 120),
    ]);
    expect(groups.map((group) => group.messages.length)).toEqual([8, 1, 1]);
    expect(
      groupChannelMessages([
        { ...message('before', 0), at: '2026-09-21T23:59:59' },
        { ...message('after', 1), at: '2026-09-22T00:00:01' },
      ]),
    ).toHaveLength(2);
  });

  it('never merges bridged messages from different sources', () => {
    const groups = groupChannelMessages([
      message('feishu', 0, { kind: 'bridged', source: 'Feishu' }),
      message('slack', 1, { kind: 'bridged', source: 'Slack' }),
    ]);
    expect(groups).toHaveLength(2);
  });
});
