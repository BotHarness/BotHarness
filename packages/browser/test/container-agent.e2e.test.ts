import { createServer } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAgentBrowserRuntime } from '../src/runtime/agent-browser.js';
import { createBotBrowserRuntime } from '../src/runtime/browser.js';
import { createContainerBrowserExecution } from '../src/runtime/container.js';

describe.skipIf(process.env['BROWSER_CONTAINER_E2E'] !== '1')(
  'owned Container driver contract',
  () => {
    it.each([
      ['current', createBotBrowserRuntime],
      ['agent-browser', createAgentBrowserRuntime],
    ] as const)(
      '%s preserves Viewer, upload bounds, exact targets and profile restart',
      async (_driver, create) => {
        const server = createServer((_req, res) => {
          res.setHeader('content-type', 'text/html');
          res.end(`<title>Container contract</title><h1>Container contract</h1>
        <input aria-label="Note" value="initial"><input aria-label="Attachment" type="file"
        onchange="document.querySelector('p').textContent='uploaded:'+this.files[0].name"><p>idle</p>
        <button onclick="localStorage.setItem('retained','owned-profile');document.querySelector('p').textContent='retained:'+localStorage.getItem('retained')">Retain</button>
        <button onclick="document.querySelector('p').textContent='retained:'+localStorage.getItem('retained')">Read retained</button>`);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (!address || typeof address === 'string') throw new Error('No fixture port');
        const url = `http://${process.env['BROWSER_CONTAINER_FIXTURE_HOST'] ?? 'host.docker.internal'}:${address.port}`;
        const dir = await mkdtemp(join(tmpdir(), 'bh768-contract-'));
        let registered = false;
        const runtime = create({
          userDataDir: join(dir, 'profile'),
          execution: createContainerBrowserExecution({
            profileDirectory: join(dir, 'profile'),
            onViewer: () => {
              registered = true;
              return () => {
                registered = false;
              };
            },
          }),
        });
        try {
          const a = await runtime.open(url);
          const b = await runtime.createTab(`${url}/reference`);
          const initial = await runtime.observe(a.tabId);
          expect(initial.title).toBe('Container contract');
          expect(initial.elements.find((el) => el.name === 'Note')?.value).toBe('initial');
          expect(runtime.viewerUrl?.()).toMatch(/^\/botharness-browser\/viewer\/[a-f0-9]+\/$/);
          expect(registered).toBe(true);
          await runtime.type(
            a.tabId,
            initial.elements.find((el) => el.name === 'Note')!.ref,
            'container QA',
          );
          await expect(
            runtime.click(b.tabId, initial.elements.find((el) => el.name === 'Retain')!.ref),
          ).rejects.toThrow(/stale|observe/);
          const attachment = join(dir, 'fixture.txt');
          await writeFile(attachment, 'Synthetic QA only');
          const fresh = await runtime.observe(a.tabId);
          await runtime.uploadFile(a.tabId, {
            path: attachment,
            ref: fresh.elements.find((el) => el.name === 'Attachment')!.ref,
          });
          expect((await runtime.observe(a.tabId)).text).toContain('uploaded:fixture.txt');
          expect(await runtime.captureScreenshot(a.tabId)).toMatchObject({
            mimeType: 'image/jpeg',
          });
          const ready = await runtime.observe(a.tabId);
          await runtime.click(a.tabId, ready.elements.find((el) => el.name === 'Retain')!.ref);
          expect((await runtime.observe(a.tabId)).text).toContain('retained:owned-profile');
          await runtime.stop();
          expect(registered).toBe(false);
          expect(runtime.viewerUrl?.()).toBeUndefined();
          expect(runtime.isRunning()).toBe(false);
          const reopened = await runtime.open(url);
          const restored = await runtime.observe(reopened.tabId);
          await runtime.click(
            reopened.tabId,
            restored.elements.find((el) => el.name === 'Read retained')!.ref,
          );
          expect((await runtime.observe(reopened.tabId)).text).toContain('retained:owned-profile');
          await expect(
            runtime.click(reopened.tabId, initial.elements.find((el) => el.name === 'Retain')!.ref),
          ).rejects.toThrow(/stale|observe/);
        } finally {
          await runtime.stop();
          await new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          );
          await rm(dir, { recursive: true, force: true });
        }
      },
      180_000,
    );
  },
);
