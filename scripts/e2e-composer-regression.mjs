/** Installed DSH regression: one Shift+Enter line and stable wrapped draft. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  '/tmp/dsh-' + basename(home).replace(/[^a-zA-Z0-9-]/gu, '-') + '.cookies',
  'utf8',
).split(';')[0];

async function rpc(method, args) {
  const response = await fetch(origin + '/api/botharness/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'composer-regression-' + method + '-' + Date.now(),
      method: 'botharness/' + method,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(method + ': ' + response.status + ' ' + JSON.stringify(envelope.result?.error));
  return envelope.result.value;
}

let groupId = process.env.BH_E2E_CHANNEL_ID;
if (groupId === undefined) {
  const bot = (await rpc('create', { displayName: 'Composer fixture ' + Date.now() })).bot;
  groupId = (
    await rpc('channelCreate', {
      name: 'Composer regression ' + Date.now(),
      members: [bot.slug],
    })
  ).channel.id;
}
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 800 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
  });
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');
  if (process.env.BH_E2E_DARK === '1') {
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  }
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  await page.waitForSelector('.bh-root [data-channel-id="' + groupId + '"]');
  await page.click('.bh-root [data-channel-id="' + groupId + '"]');
  await page.waitForSelector('.bh-composer-rich-input', { timeout: 8000 });
  const editor = '.bh-composer-rich-input';
  await page.click(editor);
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await new Promise((done) => setTimeout(done, 350));
  const newline = await page.evaluate(() => {
    const input = document.querySelector('.bh-composer-rich-input');
    const style = getComputedStyle(input);
    return {
      value: input.textContent,
      height: input.clientHeight,
      expectedHeight:
        Number.parseFloat(style.lineHeight) * 2 +
        Number.parseFloat(style.paddingTop) +
        Number.parseFloat(style.paddingBottom),
      layout: document.querySelector('.bh-composer')?.getAttribute('data-layout'),
    };
  });
  if (process.env.BH_E2E_SCREENSHOT_PREFIX)
    await page.screenshot({ path: process.env.BH_E2E_SCREENSHOT_PREFIX + '-newline.png' });

  await page.setViewport({ width: 600, height: 800 });
  await page.keyboard.down('Control');
  await page.keyboard.press('A');
  await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await page.evaluate(() => {
    const composer = document.querySelector('.bh-composer');
    window.__composerLayoutStates = [composer?.getAttribute('data-layout')];
    window.__composerLayoutObserver = new MutationObserver(() =>
      window.__composerLayoutStates.push(composer?.getAttribute('data-layout')),
    );
    window.__composerLayoutObserver.observe(composer, {
      attributes: true,
      attributeFilter: ['data-layout'],
    });
  });
  await page.keyboard.type('W'.repeat(34));
  await new Promise((done) => setTimeout(done, 700));
  const wrapped = await page.evaluate(() => {
    window.__composerLayoutObserver.disconnect();
    const input = document.querySelector('.bh-composer-rich-input');
    return {
      states: window.__composerLayoutStates,
      height: input.clientHeight,
      scrollHeight: input.scrollHeight,
    };
  });
  if (process.env.BH_E2E_SCREENSHOT_PREFIX)
    await page.screenshot({ path: process.env.BH_E2E_SCREENSHOT_PREFIX + '-wrapped.png' });
  console.log(JSON.stringify({ newline, wrapped }));
  assert.equal(newline.value, '\n');
  assert.ok(newline.height >= newline.expectedHeight - 1, 'one Shift+Enter must display two lines');
  assert.ok(wrapped.states.length <= 3, 'single-line wrap must not oscillate');
} finally {
  await browser.close();
}
