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

  it('does not accept unknown remote content formats', () => {
    expect(parseChannelMessage({ ...base, format: 'html' })).toBeUndefined();
  });
});
