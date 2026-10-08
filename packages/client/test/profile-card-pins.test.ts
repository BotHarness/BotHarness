// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';

import { loadPinnedProfileCards } from '../src/client/profile-cards.js';

afterEach(() => window.localStorage.clear());

it('drops the retired Totals card from saved pins without an error', () => {
  window.localStorage.setItem(
    'botharness.profile-cards',
    JSON.stringify(['token-usage', 'totals', 'memory-activity']),
  );
  expect(loadPinnedProfileCards()).toEqual(['token-usage', 'memory-activity']);
});
