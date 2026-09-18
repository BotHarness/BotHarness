import { describe, expect, it } from 'vitest';

import { apply, name } from '../src/index.js';

describe('@botharness/client host half', () => {
  it('exposes the plugin identity', () => {
    expect(name).toBe('botharness-client');
    expect(apply).toBeTypeOf('function');
  });
});
