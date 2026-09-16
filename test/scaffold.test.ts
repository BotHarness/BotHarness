import { describe, expect, it } from 'vitest';

import { PLUGIN_NAME, describe as describePlugin } from '../src/index.js';

describe('scaffold', () => {
  it('exposes the plugin name', () => {
    expect(PLUGIN_NAME).toBe('deepseekbot');
  });

  it('describes itself', () => {
    expect(describePlugin()).toContain('deepseekbot@');
  });
});
