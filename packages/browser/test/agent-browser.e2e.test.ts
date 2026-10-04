import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { createAgentBrowserRuntime } from '../src/runtime/agent-browser.js';
import {
  createBotBrowserRuntime,
  connectCdp,
  SNAPSHOT_SCRIPT,
  waitForBrowserReady,
} from '../src/runtime/browser.js';

const enabled = process.env['BROWSER_AGENT_E2E'] === '1';

describe.skipIf(!enabled)(
  'Local driver contract against actual Chrome and native candidate',
  () => {
    it.each([
      ['current', createBotBrowserRuntime],
      ['agent-browser', createAgentBrowserRuntime],
    ] as const)(
      '%s preserves exact tab/ref identity, uploads and owned cleanup',
      async (_driver, create) => {
        const saves: string[] = [];
        const server = createServer((req, res) => {
          if (req.method === 'POST') {
            let body = '';
            req.on('data', (chunk) => {
              body += String(chunk);
            });
            req.on('end', () => {
              saves.push(new URLSearchParams(body).get('note') ?? '');
              res.end('Saved');
            });
            return;
          }
          res.setHeader('Content-Type', 'text/html');
          res.end(`<title>Local driver QA</title><body><h1>Local driver QA</h1>
          <label for="note">Note</label><input id="note" aria-label="Note" value="initial">
          <button id="save" onclick="fetch('/save',{method:'POST',body:new URLSearchParams({note:note.value})})">Save</button>
          <label for="file">Attachment</label><input type="file" id="file" aria-label="Attachment" onchange="document.querySelector('#result').textContent='uploaded:'+this.files[0].name">
          <p id="result">idle</p>
          <input aria-label="Disabled" value="do not clear" disabled>
          <input aria-label="Read only" value="do not clear" readonly>
          <textarea aria-label="Multiline note">first
- paragraph
- button "literal" [ref=e2]</textarea>
          <input type="password" value="never-share-password">
          <input aria-label="Long value" value="${'x'.repeat(300)}">
          <input aria-label="Checked" type="checkbox" checked>
          <button aria-label="Expanded" aria-expanded="false">Expand</button>
          <div role="checkbox" aria-label="Mixed" aria-checked="mixed">Mixed</div>
          <div role="option" aria-label="Selected" aria-selected="true">Selected</div>
          <input type="hidden" value="never-share-hidden">
          <button onclick="this.disabled=true">Noneditable</button><a href="/other">Next page</a></body>`);
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const address = server.address();
        if (address === null || typeof address === 'string')
          throw new Error('Fixture did not bind');
        const url = `http://127.0.0.1:${address.port}`;
        const dir = await mkdtemp(join(tmpdir(), 'bh767-contract-'));
        const runtime = create({
          userDataDir: join(dir, 'profile'),
          headless: true,
          ...(process.env['BROWSER_E2E_PATH'] === undefined
            ? {}
            : { browserPath: process.env['BROWSER_E2E_PATH'] }),
        });
        try {
          const a = await runtime.open(url);
          const initialFields = await runtime.observe(a.tabId);
          expect(initialFields.elements.find((el) => el.name === 'Note')).toMatchObject({
            value: 'initial',
          });
          expect(initialFields.elements.find((el) => el.name === 'Disabled')).toMatchObject({
            value: 'do not clear',
            disabled: true,
          });
          expect(initialFields.elements.find((el) => el.name === 'Read only')).toMatchObject({
            value: 'do not clear',
            readOnly: true,
          });
          expect(initialFields.elements.find((el) => el.name === 'Long value')).toMatchObject({
            value: 'x'.repeat(256),
            valueTruncated: true,
          });
          expect(initialFields.elements.find((el) => el.name === 'Checked')).toMatchObject({
            checked: true,
          });
          expect(initialFields.elements.find((el) => el.name === 'Expanded')).toMatchObject({
            expanded: false,
          });
          expect(initialFields.elements.find((el) => el.name === 'Mixed')).toMatchObject({
            checked: 'mixed',
          });
          expect(initialFields.elements.find((el) => el.name === 'Selected')).toMatchObject({
            selected: true,
          });
          expect(
            initialFields.elements.find((el) => el.name === 'Attachment')?.value,
          ).toBeUndefined();
          expect(JSON.stringify(initialFields)).not.toMatch(
            /never-share-password|never-share-hidden/,
          );

          const b = await runtime.createTab(`${url}/other`);
          for (const name of ['Disabled', 'Read only', 'Noneditable']) {
            const initial = await runtime.observe(a.tabId);
            await runtime.type(
              a.tabId,
              initial.elements.find((element) => element.name === 'Note')!.ref,
              'Human retained',
            );
            const fields = await runtime.observe(a.tabId);
            const forbidden = fields.elements.find((element) => element.name === name)!;
            expect(forbidden).toBeDefined();
            await expect(
              runtime.type(a.tabId, forbidden.ref, 'must not enter another field'),
            ).rejects.toThrow(/editable|disabled|readonly/);
            const afterRefusal = await runtime.observe(a.tabId);
            await runtime.click(
              a.tabId,
              afterRefusal.elements.find((element) => element.name === 'Save')!.ref,
            );
            await expect.poll(() => saves.at(-1)).toBe('Human retained');
          }
          const aObservation = await runtime.observe(a.tabId);
          const input = aObservation.elements.find((item) => item.name === 'Note')!;
          expect(input).toBeDefined();
          await runtime.observe(b.tabId);
          await runtime.type(a.tabId, input.ref, 'owned-A');
          const typed = await runtime.observe(a.tabId);
          expect(typed.elements.find((el) => el.name === 'Note')?.value).toBe('owned-A');
          const save = typed.elements.find((item) => item.name === 'Save')!;
          await expect(runtime.click(b.tabId, save.ref)).rejects.toThrow(/stale/);
          await runtime.click(a.tabId, save.ref);
          await expect
            .poll(() => saves)
            .toEqual(['Human retained', 'Human retained', 'Human retained', 'owned-A']);
          const observation = await runtime.observe(a.tabId);
          const stale = observation.elements.find((item) => item.name === 'Save')!;
          await runtime.observe(a.tabId);
          await expect(runtime.click(a.tabId, stale.ref)).rejects.toThrow(/stale/);
          const file = join(dir, 'fixture.txt');
          await writeFile(file, 'synthetic');
          const ready = await runtime.observe(a.tabId);
          await runtime.uploadFile(a.tabId, {
            ref: ready.elements.find((item) => item.name === 'Attachment')!.ref,
            path: file,
          });
          expect((await runtime.observe(a.tabId)).text).toContain('uploaded:fixture.txt');
          const screenshot = await runtime.captureScreenshot(a.tabId);
          expect(screenshot?.mimeType).toBe('image/jpeg');
          expect(screenshot?.data.length).toBeGreaterThan(100);
          const evidence = process.env['BROWSER_E2E_EVIDENCE'];
          if (evidence !== undefined && screenshot !== undefined) {
            await mkdir(evidence, { recursive: true });
            await writeFile(
              join(evidence, `${_driver}-functional.jpg`),
              Buffer.from(screenshot.data, 'base64'),
            );
          }
          await runtime.closeTab(a.tabId);
          await expect(runtime.observe(a.tabId)).rejects.toThrow();
          expect((await runtime.tabInfo(b.tabId)).url).toBe(`${url}/other`);
        } finally {
          await runtime.stop();
          expect(runtime.isRunning()).toBe(false);
          await rm(dir, { recursive: true, force: true });
          await new Promise<void>((resolve) => server.close(() => resolve()));
        }
      },
      90_000,
    );
    it('rechecks a queued action and closes owned Chrome on Session cancellation', async () => {
      const dir = await mkdtemp(join(tmpdir(), 'bh767-cancellation-'));
      const runtime = createAgentBrowserRuntime({
        userDataDir: join(dir, 'profile'),
        headless: true,
        ...(process.env['BROWSER_E2E_PATH'] === undefined
          ? {}
          : { browserPath: process.env['BROWSER_E2E_PATH'] }),
      });
      try {
        await runtime.open('about:blank');
        let release!: () => void;
        let started!: () => void;
        const entered = new Promise<void>((resolve) => {
          started = resolve;
        });
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const controller = new AbortController();
        const active = runtime.runWithSignal!(controller.signal, async () => {
          started();
          await held;
        });
        await entered;
        let executed = false;
        const queued = runtime.runWithSignal!(
          new AbortController().signal,
          () =>
            runtime.open('about:blank').then(() => {
              executed = true;
            }),
          () => {
            throw new Error('Browser paused while queued');
          },
        );
        controller.abort(new Error('Synthetic Session cancellation'));
        await expect.poll(() => runtime.isRunning()).toBe(false);
        const refused = expect(queued).rejects.toThrow('Browser paused while queued');
        const cancelled = expect(active).rejects.toThrow('Synthetic Session cancellation');
        release();
        await cancelled;
        await refused;
        expect(executed).toBe(false);
        expect(runtime.isRunning()).toBe(false);
      } finally {
        await runtime.stop();
        await rm(dir, { recursive: true, force: true });
      }
    }, 90_000);
  },
);
it.skipIf(!enabled)(
  'refuses mixed snapshots when the same URL reloads between AX and DOM reads',
  async () => {
    const server = createServer((_req, res) => {
      res.setHeader('Content-Type', 'text/html');
      res.end('<title>Document QA</title><button>Save</button>');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Fixture did not bind');
    const dir = await mkdtemp(join(tmpdir(), 'bh767-document-'));
    let reloadBetweenReads = false;
    const runtime = createAgentBrowserRuntime({
      userDataDir: join(dir, 'profile'),
      headless: true,
      ...(process.env['BROWSER_E2E_PATH'] === undefined
        ? {}
        : { browserPath: process.env['BROWSER_E2E_PATH'] }),
      connect: async (endpoint) => {
        const cdp = await connectCdp(endpoint);
        return {
          close: () => cdp.close(),
          subscribe: (...args) => cdp.subscribe(...args),
          send: async (method, params, sessionId) => {
            if (
              method === 'Runtime.evaluate' &&
              params?.['expression'] === SNAPSHOT_SCRIPT &&
              reloadBetweenReads
            ) {
              reloadBetweenReads = false;
              await cdp.send('Page.reload', {}, sessionId);
              await waitForBrowserReady(async () => {
                const state = await cdp.send(
                  'Runtime.evaluate',
                  { expression: 'document.readyState', returnByValue: true },
                  sessionId,
                );
                return (state['result'] as { value?: unknown } | undefined)?.value;
              });
            }
            return cdp.send(method, params, sessionId);
          },
        };
      },
    });
    try {
      const page = await runtime.open(`http://127.0.0.1:${address.port}`);
      const previous = await runtime.observe(page.tabId);
      reloadBetweenReads = true;
      await expect(runtime.observe(page.tabId)).rejects.toThrow(
        'document changed during observation',
      );
      await expect(runtime.click(page.tabId, previous.elements[0]!.ref)).rejects.toThrow('stale');
      expect((await runtime.observe(page.tabId)).elements[0]?.name).toBe('Save');
    } finally {
      await runtime.stop();
      await rm(dir, { recursive: true, force: true });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  },
  90_000,
);
