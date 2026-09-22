// Live DSH regression for #206: a rejected send stays visible until the Human restores and resends it.
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
const nonce = Date.now();
const name = `FailureE2E-${nonce}`;
const body = `failed-send-${nonce}`;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForSelector('button[aria-label="新建"], button[aria-label="New"]', {
    timeout: 10000,
  });
  await page.evaluate(async (channelName) => {
    const response = await fetch('/api/botharness/channelCreate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `failure-e2e-${Math.random()}`,
        method: 'botharness/channelCreate',
        payload: { args: { name: channelName, members: [] } },
      }),
    });
    const envelope = await response.json();
    if (envelope.result?.ok !== true) throw new Error(JSON.stringify(envelope.result));
  }, name);
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForFunction(
    (channelName) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(channelName),
      ),
    { timeout: 10000 },
    name,
  );
  await page.evaluate((channelName) => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(channelName))
      ?.click();
  }, name);
  const input = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForSelector(input, { timeout: 10000 });

  let sendAttempts = 0;
  let rejectSend = true;
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/api/botharness/channelSend')) {
      sendAttempts += 1;
      if (rejectSend) {
        void request.abort('failed');
        return;
      }
    }
    void request.continue();
  });

  await page.type(input, body);
  await page.keyboard.press('Enter');
  await page.waitForSelector('.bh-bubble-failed-action', { timeout: 10000 });
  assert.equal(await page.$eval(input, (element) => element.value), '');
  assert.equal(sendAttempts, 1);
  assert.equal((await page.$$('.bh-bubble-failed')).length, 1);

  await page.type(input, 'existing draft');
  await page.click('.bh-bubble-failed-action');
  assert.equal(await page.$eval(input, (element) => element.value), 'existing draft');
  assert.equal((await page.$$('.bh-bubble-failed')).length, 1);
  await page.waitForSelector('[role="alert"]', { timeout: 3000 });
  await page.$eval(input, (element) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(element, '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('textarea')?.value === '', {
    timeout: 3000,
  });
  await page.click('.bh-bubble-failed-action');
  assert.equal(await page.$eval(input, (element) => element.value), body);
  assert.equal((await page.$$('.bh-bubble-failed')).length, 0);
  assert.equal(sendAttempts, 1);

  rejectSend = false;
  await page.waitForFunction(
    (expected) => {
      const textarea = document.querySelector('textarea');
      return document.activeElement === textarea && textarea?.value === expected;
    },
    { timeout: 3000 },
    body,
  );
  await page.keyboard.press('Enter');
  await page.waitForFunction(
    (expected) =>
      Array.from(document.querySelectorAll('.bh-bubble-wrap')).some(
        (wrap) =>
          wrap.textContent?.includes(expected) &&
          !wrap.querySelector('.bh-bubble-pending, .bh-bubble-failed'),
      ),
    { timeout: 10000 },
    body,
  );
  assert.equal(sendAttempts, 2);
  console.log(JSON.stringify({ verdict: 'PASS', sendAttempts, draftProtected: true }));
} catch (error) {
  console.error(String(error?.stack ?? error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
