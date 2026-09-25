import { describe, expect, it } from 'vitest';

import { saveHmrView, takeHmrView } from '../src/client/hmr-view.js';

describe('Client HMR view handoff', () => {
  it('restores the selected DM once while the page remains open', () => {
    const page: Record<string, unknown> = {};
    saveHmrView(page, { kind: 'bot', slug: 'qa' }, 1_000);

    expect(takeHmrView(page, 1_001)).toEqual({ selection: { kind: 'bot', slug: 'qa' } });
    expect(takeHmrView(page, 1_002)).toBeUndefined();
  });

  it('does not restore stale navigation from a later plugin activation', () => {
    const page: Record<string, unknown> = {};
    saveHmrView(page, { kind: 'channel', channelId: 'group' }, 1_000);

    expect(takeHmrView(page, 31_001)).toBeUndefined();
  });
});
