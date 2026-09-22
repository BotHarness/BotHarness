import { describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { pageChannelTimeline } from '../src/channels/timeline.js';

const messages: ChannelMessage[] = Array.from({ length: 121 }, (_, index) => ({
  id: `m-${index}`,
  at: new Date(Date.UTC(2026, 8, 22, 0, 0, index)).toISOString(),
  author: { kind: 'human' },
  body: String(index),
}));

describe('Channel timeline opaque pages', () => {
  it('walks older history without overlap, holes, or exposure of storage offsets', () => {
    const latest = pageChannelTimeline('dm-ada', messages)!;
    expect(latest.entries.map((entry) => entry.id)).toEqual(
      messages.slice(71).map((entry) => entry.id),
    );
    expect(latest.hasOlder).toBe(true);
    expect(latest.hasNewer).toBe(false);
    expect(latest.olderCursor).not.toContain('m-71');

    const middle = pageChannelTimeline('dm-ada', messages, {
      direction: 'older',
      cursor: latest.olderCursor!,
    })!;
    const oldest = pageChannelTimeline('dm-ada', messages, {
      direction: 'older',
      cursor: middle.olderCursor!,
    })!;
    expect([...oldest.entries, ...middle.entries, ...latest.entries]).toEqual(messages);
    expect(oldest.hasOlder).toBe(false);
    expect(oldest.olderCursor).not.toBeNull();
  });

  it('keeps a cursor stable while new messages append, and pages newer independently', () => {
    const initial = pageChannelTimeline('dm-ada', messages)!;
    const appended: ChannelMessage = {
      id: 'm-121',
      at: '2026-09-22T00:02:01.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'latest',
    };
    const extended = [...messages, appended];
    const older = pageChannelTimeline('dm-ada', extended, {
      direction: 'older',
      cursor: initial.olderCursor!,
    })!;
    const newer = pageChannelTimeline('dm-ada', extended, {
      direction: 'newer',
      cursor: initial.newerCursor!,
    })!;
    expect(older.entries.at(-1)?.id).toBe('m-70');
    expect(newer.entries.map((entry) => entry.id)).toEqual(['m-121']);
    expect(newer.hasNewer).toBe(false);
  });

  it('reads a bounded around window and rejects unknown or cross-channel anchors', () => {
    const page = pageChannelTimeline('dm-ada', messages, {
      direction: 'around',
      around: 'm-37',
      olderLimit: 2,
      newerLimit: 2,
    })!;
    expect(page.entries.map((entry) => entry.id)).toEqual(['m-35', 'm-36', 'm-37', 'm-38', 'm-39']);
    expect(page.hasOlder).toBe(true);
    expect(page.hasNewer).toBe(true);
    expect(
      pageChannelTimeline('dm-ada', messages, {
        direction: 'around',
        around: 'missing',
      }),
    ).toBeUndefined();
    expect(
      pageChannelTimeline('group-team', messages, {
        direction: 'older',
        cursor: page.olderCursor!,
      }),
    ).toBeUndefined();
    expect(
      pageChannelTimeline('dm-ada', messages, {
        direction: 'newer',
        cursor: 'not-a-cursor',
      }),
    ).toBeUndefined();
  });

  it('returns a stable empty latest window', () => {
    expect(pageChannelTimeline('dm-ada', [])).toEqual({
      entries: [],
      olderCursor: null,
      newerCursor: null,
      hasOlder: false,
      hasNewer: false,
    });
  });
});
