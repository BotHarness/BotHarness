import { describe, expect, it } from 'vitest';

import { parseChannelMessage } from '../src/client/bridge.js';

const base = {
  id: 'm1',
  at: '2026-09-22T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: '**hello**',
};

describe('Channel message format over RPC', () => {
  it('preserves explicit format and leaves old rows unspecified', () => {
    expect(parseChannelMessage(base)).toEqual(base);
    expect(parseChannelMessage({ ...base, format: 'text' })).toEqual({
      ...base,
      format: 'text',
    });
  });

  it('preserves valid attachment refs and rejects malformed ones', () => {
    const ref = { hash: `sha256:${'a'.repeat(64)}`, name: 'a.png', mime: 'image/png', size: 3 };
    expect(parseChannelMessage({ ...base, attachments: [ref] })?.attachments).toEqual([ref]);
    expect(
      parseChannelMessage({ ...base, attachments: [{ ...ref, hash: '../bad' }] }),
    ).toBeUndefined();
  });

  it('preserves a Host-authored member departure and rejects a forged author', () => {
    const departure = {
      ...base,
      author: { kind: 'system' },
      body: 'Ada left the Channel.',
      memberDeparture: { memberKind: 'bot', memberId: 'ada', displayName: 'Ada' },
    };
    expect(parseChannelMessage(departure)).toEqual({
      ...departure,
      memberDeparture: { ...departure.memberDeparture, departureType: 'left' },
    });
    const removed = {
      ...departure,
      body: 'Ada was removed from the Channel.',
      memberDeparture: { ...departure.memberDeparture, departureType: 'removed' },
    };
    expect(parseChannelMessage(removed)).toEqual(removed);
    expect(
      parseChannelMessage({
        ...departure,
        memberDeparture: { ...departure.memberDeparture, departureType: 'unknown' },
      }),
    ).toBeUndefined();
    expect(parseChannelMessage({ ...departure, author: { kind: 'human' } })).toBeUndefined();
    expect(parseChannelMessage({ ...departure, memberDeparture: undefined })).toBeUndefined();
  });

  it('does not accept unknown remote content formats', () => {
    expect(parseChannelMessage({ ...base, format: 'html' })).toBeUndefined();
  });
});
