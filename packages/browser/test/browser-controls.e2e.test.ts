import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { createBotBrowserRuntime } from '../src/runtime/browser.js';

const enabled = process.env['BROWSER_E2E'] === '1';
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe.skipIf(!enabled)('browser controls E2E with real Chrome', () => {
  it('lists a role-less toolbar icon, clicks it, uploads a file, and guards coordinates', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'browser-e2e-'));
    const pagePath = join(dir, 'index.html');
    writeFileSync(
      pagePath,
      `<!doctype html><html><head><title>E2E</title><style>#icon{cursor:pointer;width:48px;height:48px;background:#eee;display:inline-block}</style></head>
<body>
<div id="wrapper" style="cursor:pointer;width:120px;height:40px"></div>
<div contenteditable="true"><div id="icon">image-icon</div></div>
<p id="state">idle</p>
<script>
const icon = document.getElementById('icon');
icon.addEventListener('click', () => {
  document.getElementById('state').textContent = 'clicked';
  if (!document.querySelector('input[type=file]')) {
    const input = document.createElement('input');
    input.type = 'file';
    input.id = 'picker';
    input.addEventListener('change', () => {
      document.getElementById('state').textContent = 'uploaded:' + input.files.length;
    });
    document.body.appendChild(input);
  }
  document.getElementById('picker').click();
});
</script>
</body></html>`,
    );
    const uploadPath = join(dir, 'shot.jpg');
    writeFileSync(uploadPath, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

    const runtime = createBotBrowserRuntime({ userDataDir: join(dir, 'profile'), headless: true });
    try {
      await runtime.ensure();
      const tab = await runtime.open(`file://${pagePath}`);
      const observation = await runtime.observe(tab.tabId);
      const icon = observation.elements.find(
        (element) => element.role === 'clickable' && element.name.includes('image-icon'),
      );
      expect(icon).toBeDefined();
      const positionNamed = observation.elements.find(
        (element) => element.role === 'clickable' && /^div @\d+,\d+$/u.test(element.name),
      );
      expect(positionNamed).toBeDefined();

      await runtime.uploadFile(tab.tabId, { ref: icon!.ref, path: uploadPath });
      const uploaded = await runtime.observe(tab.tabId);
      expect(uploaded.text).toContain('uploaded:1');

      await expect(runtime.clickAt(tab.tabId, 5000, 10)).rejects.toThrow(/outside the viewport/);

      const shot = await runtime.captureScreenshot(tab.tabId);
      expect(shot?.viewport?.width ?? 0).toBeGreaterThan(0);
      expect(shot?.image).toEqual(shot?.viewport);
      await expect(runtime.clickAt(tab.tabId, shot!.viewport!.width, 0)).rejects.toThrow(
        /outside the viewport/,
      );
      const assets = join(repoRoot, 'docs', 'assets', 'pr', '530-bilibili-controls');
      mkdirSync(assets, { recursive: true });
      writeFileSync(join(assets, 'e2e-clickable-upload.jpg'), Buffer.from(shot!.data, 'base64'));
    } finally {
      await runtime.stop();
      rmSync(dir, { recursive: true, force: true });
    }
  }, 90_000);
});
