import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(origin + '/?token=' + encodeURIComponent(token), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  if (process.env.BH_E2E_DARK === '1') {
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  }
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForFunction(
    () =>
      document.querySelector('button[aria-label="新建"], button[aria-label="New"]') !== null ||
      Array.from(document.querySelectorAll('button')).some(
        (button) => button.textContent?.trim() === 'Configure later',
      ),
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
    document.querySelector('button[aria-label="新建"], button[aria-label="New"]')?.click();
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('PersonaBot'))
      ?.click();
  });
  await page.type(
    'input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]',
    'ComposerLayout-' + Date.now(),
  );
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['创建', 'Create'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  const selector = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForSelector(selector, { timeout: 10000 });

  const measure = () =>
    page.evaluate(() => {
      const composer = document.querySelector('.bh-composer');
      const input = document.querySelector('.bh-composer-input');
      const add = document.querySelector('.bh-composer-add-file');
      const send = document.querySelector('.bh-send-btn');
      if (!composer || !input || !add || !send) throw new Error('Composer controls missing');
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          centerY: rect.top + rect.height / 2,
        };
      };
      return {
        layout: composer.getAttribute('data-layout'),
        footer: composer.classList.contains('bh-composer-with-footer'),
        composer: box(composer),
        input: box(input),
        add: box(add),
        send: box(send),
      };
    });

  const compact = await measure();
  assert.equal(compact.layout, 'compact');
  assert.equal(compact.footer, false);
  assert.ok(Math.abs(compact.add.centerY - compact.send.centerY) < 2);

  await page.type(selector, 'first line');
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.type(selector, 'second line');
  await page.waitForFunction(
    () => document.querySelector('.bh-composer')?.classList.contains('bh-composer-with-footer'),
    { timeout: 3000 },
  );
  await page.waitForFunction(
    () => {
      const input = document.querySelector('.bh-composer-input');
      const add = document.querySelector('.bh-composer-add-file');
      const send = document.querySelector('.bh-send-btn');
      if (!input || !add || !send) return false;
      const inputBox = input.getBoundingClientRect();
      const addBox = add.getBoundingClientRect();
      const sendBox = send.getBoundingClientRect();
      return addBox.top > inputBox.bottom && sendBox.top > inputBox.bottom;
    },
    { timeout: 3000 },
  );
  const expanded = await measure();
  assert.equal(expanded.layout, 'expanded');
  assert.equal(expanded.footer, true);
  assert.ok(Math.abs(expanded.add.centerY - expanded.send.centerY) < 2);
  assert.ok(expanded.add.top > expanded.input.bottom);
  assert.ok(expanded.send.top > expanded.input.bottom);
  assert.ok(Math.abs(expanded.input.left - compact.input.left) < 2);

  if (process.env.BH_E2E_SCREENSHOT) {
    await page.screenshot({
      path: process.env.BH_E2E_SCREENSHOT,
      clip: {
        x: expanded.composer.left - 12,
        y: expanded.composer.top - 12,
        width: expanded.composer.right - expanded.composer.left + 24,
        height: expanded.composer.bottom - expanded.composer.top + 24,
      },
    });
  }
  await page.setViewport({ width: 720, height: 900 });
  await page.waitForFunction(
    () => window.innerWidth === 720 && document.querySelector('.bh-composer')?.clientWidth > 0,
    { timeout: 3000 },
  );
  const narrow = await measure();
  assert.ok(Math.abs(narrow.add.centerY - narrow.send.centerY) < 2);
  assert.ok(narrow.add.top > narrow.input.bottom);

  console.log(
    JSON.stringify({
      verdict: 'PASS',
      compactCentersApart: Math.abs(compact.add.centerY - compact.send.centerY),
      expandedCentersApart: Math.abs(expanded.add.centerY - expanded.send.centerY),
      narrowCentersApart: Math.abs(narrow.add.centerY - narrow.send.centerY),
      expandedFooterClearance: expanded.add.top - expanded.input.bottom,
    }),
  );
} catch (error) {
  console.error(String(error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
