import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { createBotBrowserRuntime, PINNED_CHROMIUM_VERSION } from '../src/runtime/browser.js';

const enabled = process.env['BROWSER_FALLBACK_E2E'] === '1';
describe.skipIf(!enabled)('pinned fallback acceptance with real Chrome for Testing', () => {
  it('downloads or reuses the pinned build and reads a real page when system discovery is empty', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-fallback-qa-'));
    const server = createServer((_request, response) =>
      response.end('<!doctype html><title>Pinned fallback QA</title><h1>Real fallback page</h1>'),
    );
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw Error('Fixture address unavailable');
    const runtime = createBotBrowserRuntime({
      userDataDir: join(dir, 'profile'),
      installDir: process.env['BROWSER_FALLBACK_CACHE'] ?? join(dir, 'cache'),
      headless: true,
      fileExists: () => false,
    });
    try {
      expect(runtime.isRunning()).toBe(false);
      const tab = await runtime.open(`http://127.0.0.1:${address.port}/`);
      expect(runtime.binaryPath()).toContain(PINNED_CHROMIUM_VERSION);
      expect(runtime.isRunning()).toBe(true);
      const page = await runtime.observe(tab.tabId);
      expect(page.title).toBe('Pinned fallback QA');
      expect(page.text).toContain('Real fallback page');
      await runtime.stop();
      expect(runtime.isRunning()).toBe(false);
      await runtime.ensure();
      expect(runtime.isRunning()).toBe(true);
    } finally {
      await runtime.stop();
      server.close();
      await once(server, 'close');
      rmSync(dir, { recursive: true, force: true });
    }
  }, 300000);
});
