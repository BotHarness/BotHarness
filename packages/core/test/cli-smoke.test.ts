import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';

describe('headless CLI smoke isolation', () => {
  it('refuses missing Host or authentication before creating any profile data', async () => {
    const { runCliSmoke } = await import(pathToFileURL(resolve('scripts/cli-smoke.mjs')).href);
    const home = createTempRoot('botharness-smoke-isolation-');
    for (const env of [
      { DSH_HOME: home },
      { DSH_HOME: home, DEEPSEEKBOT_HOST: 'http://127.0.0.1:1' },
    ]) {
      const result = runCliSmoke({ env, provider: 'deepseek-official', model: 'deepseek-flash' });
      expect(result.ok).toBe(false);
      expect(result.owned).toEqual({ bots: [], presets: [] });
      expect(readdirSync(home)).toEqual([]);
    }
  });
});
