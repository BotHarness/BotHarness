import { describe, expect, it } from 'vitest';

import { activeMentionQuery, rebaseMentions, selectMention } from '../src/client/mentions.js';

describe('selected Channel mentions', () => {
  it('keeps stable identities through unrelated edits and drops an edited token', () => {
    const first = selectMention('@Al', [], { start: 0, end: 3, query: 'Al' }, 'ada', 'Alex');
    expect(first).toEqual({
      value: '@Alex ',
      mentions: [{ botSlug: 'ada', label: 'Alex', start: 0, end: 5 }],
      caret: 6,
    });
    const second = selectMention(
      '@Alex @Al',
      first.mentions,
      { start: 6, end: 9, query: 'Al' },
      'bea',
      'Alex',
    );
    expect(second.mentions.map((item) => item.botSlug)).toEqual(['ada', 'bea']);
    expect(rebaseMentions(second.value, 'Please ' + second.value, second.mentions)).toEqual(
      second.mentions.map((item) => ({
        ...item,
        start: item.start + 7,
        end: item.end + 7,
      })),
    );
    expect(rebaseMentions(second.value, '@Aex @Alex ', second.mentions)).toEqual([
      { ...second.mentions[1]!, start: 5, end: 10 },
    ]);
  });

  it('does not turn typed or pasted names into selected identities', () => {
    expect(activeMentionQuery('@Ada', 4, [])).toEqual({ start: 0, end: 4, query: 'Ada' });
    expect(
      activeMentionQuery('@Ada ', 5, [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }]),
    ).toBeUndefined();
    expect(rebaseMentions('', '@Ada', [])).toEqual([]);
  });
});
