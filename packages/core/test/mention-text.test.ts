import { describe, expect, it } from 'vitest';

import {
  mentionMarkup,
  mentionPeople,
  withMentionNames,
  withoutMentionMarkup,
} from '../src/messaging/mention-text.js';

describe('mention text for the model', () => {
  it('replaces provider placeholders with names, falling back to the platform id', () => {
    expect(
      withMentionNames('@_user_1 hi @_user_10 and @_user_2', [
        { id: 'ou-bot', key: '@_user_1', name: 'QA Bot' },
        { id: 'ou-ten', key: '@_user_10', name: 'Ten' },
        { id: 'ou-two', key: '@_user_2' },
      ]),
    ).toBe('@QA Bot hi @Ten and @ou-two');
    expect(
      withMentionNames('<@U0C70V2DJA3> ping', [{ id: 'U0C70V2DJA3', key: '<@U0C70V2DJA3>' }]),
    ).toBe('@U0C70V2DJA3 ping');
    expect(withMentionNames('plain', undefined)).toBe('plain');
  });

  it('lists the sender and each mentioned person once', () => {
    expect(
      mentionPeople({ kind: 'user', id: 'ou-a', name: 'Ada' } as never, [
        { id: 'ou-bot', key: '@_user_1', name: 'QA Bot' },
        { id: 'ou-a', key: '@_user_2', name: 'Ada' },
      ]),
    ).toEqual([
      { role: 'sender', id: 'ou-a', name: 'Ada' },
      { role: 'mentioned', id: 'ou-bot', name: 'QA Bot' },
    ]);
  });

  it('writes platform mention markup and refuses unsupported platforms', () => {
    expect(mentionMarkup('feishu', 'ou_123', 'Ada <x>')).toBe('<at user_id="ou_123">Ada x</at>');
    expect(mentionMarkup('slack', 'U123')).toBe('<at user_id="U123"></at>');
    expect(() => mentionMarkup('weixin', 'wxid')).toThrow('not supported on weixin');
    expect(() => mentionMarkup('feishu', 'ou"><at user_id="all')).toThrow(
      'Invalid platform user id',
    );
  });

  it('turns mention markup written by the model into plain text', () => {
    expect(
      withoutMentionMarkup('hi <at user_id="all">所有人</at> and <AT user_id="ou_1"></at>!'),
    ).toBe('hi @所有人 and @someone!');
    expect(withoutMentionMarkup('broken <at user_id="all"> tag')).toBe('broken  tag');
  });
});
