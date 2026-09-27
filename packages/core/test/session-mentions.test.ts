import { describe, expect, it } from 'vitest';

import { sessionMentionText } from '../src/runtime/session-mentions.js';

describe('Session rendering of selected PersonaBot mentions', () => {
  it('keeps selected labels visible while preventing native file-reference projection', () => {
    const body = '@Ada ask @Bea';
    expect(
      sessionMentionText(body, [
        { botSlug: 'ada', label: 'Ada', start: 0, end: 4 },
        { botSlug: 'bea', label: 'Bea', start: 9, end: 13 },
      ]),
    ).toBe('\u2060@Ada ask \u2060@Bea');
  });

  it('ignores stale mention ranges and leaves unselected text alone', () => {
    expect(
      sessionMentionText('@Ada @Other', [{ botSlug: 'ada', label: 'Changed', start: 0, end: 4 }]),
    ).toBe('@Ada @Other');
  });
});
