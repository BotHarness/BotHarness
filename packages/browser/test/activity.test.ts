import { describe, expect, it } from 'vitest';

import { createActivityTracker } from '../src/activity.js';

describe('browser activity tracker', () => {
  it('expires only after the idle window passes, and touch resets it', () => {
    let now = 1000;
    const activity = createActivityTracker(() => now);
    expect(activity.isIdle(30)).toBe(false);
    now = 1030;
    expect(activity.isIdle(30)).toBe(true);
    activity.touch();
    expect(activity.isIdle(30)).toBe(false);
    now = 1059;
    expect(activity.isIdle(30)).toBe(false);
    now = 1060;
    expect(activity.isIdle(30)).toBe(true);
  });
});
