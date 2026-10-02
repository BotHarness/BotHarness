import { describe, expect, it, vi } from 'vitest';
import { createLocalCuaDriver } from '../src/tool/local-driver.js';

const dir = process.env['BH_LOCAL_DRIVER_CONTRACT_DIR'];

describe.skipIf(dir === undefined || process.platform !== 'darwin')(
  'verified macOS Local driver MCP contract',
  () => {
    it('serves the curated observation and token-action descriptors without installing or granting OS access', async () => {
      const run = vi.fn(async () => ({ code: 0, stdout: '', stderr: '' }));
      const driver = createLocalCuaDriver({ dir, runner: { run } });
      try {
        await expect(driver.ensure()).resolves.toMatchObject({ status: 'present' });
        const tools = await driver.tools();
        for (const name of [
          'list_windows',
          'get_window_state',
          'click',
          'type_text',
          'check_permissions',
        ])
          expect(
            tools.some((tool) => tool.name === name),
            name,
          ).toBe(true);
        const observe = tools.find((tool) => tool.name === 'get_window_state');
        expect(observe?.inputSchema['required']).toEqual(['pid', 'window_id']);
        const click = tools.find((tool) => tool.name === 'click');
        expect(click?.inputSchema['properties']).toHaveProperty('element_token');
        expect(click?.inputSchema['properties']).toHaveProperty('capture_id');
        expect(click?.inputSchema['properties']).not.toHaveProperty('element_index');
        expect(run).not.toHaveBeenCalled();
      } finally {
        await driver.close();
      }
    }, 30000);
  },
);
