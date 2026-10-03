import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const channelId = process.env.BH_E2E_CHANNEL_ID;
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(
  origin && home && channelId && evidence,
  'set BH_E2E_ORIGIN, HOME, CHANNEL_ID and EVIDENCE',
);
mkdirSync(evidence, { recursive: true });
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `botharness/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert.ok(response.ok, `HTTP request failed for ${method}`);
  const envelope = (await response.json()).result;
  assert.equal(envelope?.ok, true, `RPC failed for ${method}`);
  return envelope.value;
}
const pnpm = resolve('node_modules/.pnpm');
const directory = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
assert.ok(directory, 'install workspace Puppeteer');
const puppeteer = createRequire(resolve(pnpm, directory, 'node_modules/'))('puppeteer');
const originalPins = (await rpc('rosterGet')).pins;
const hostBot = (await rpc('activitySnapshot')).bots.find(
  (row) => row.attention?.approvalCount > 0 && channelId === `dm-${row.slug}`,
);
assert.ok(hostBot, 'use a real PersonaBot DM with a pending native Tool approval');
const proof = { nativeHostCount: hostBot.attention.approvalCount, cases: [], pinsRestored: false };
let pinsChanged = false;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1180 });
const cookieSeparator = cookie.indexOf('=');
assert.ok(cookieSeparator > 0, 'launcher cookie jar must contain a named cookie');
await browser.setCookie({
  name: cookie.slice(0, cookieSeparator),
  value: cookie.slice(cookieSeparator + 1),
  domain: new URL(origin).hostname,
  path: '/',
  secure: new URL(origin).protocol === 'https:',
  httpOnly: true,
  sameSite: 'Lax',
});
async function openOnce() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
      { timeout: 2500 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  if (!(await page.$('.bh-main')))
    await page.locator('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]').click();
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-main') ||
      [...document.querySelectorAll('button')].some((button) =>
        ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((button) => ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="${channelId}"]`);
  await page.locator(`[data-channel-id="${channelId}"]`).click();
  await page.waitForSelector('.bh-composer-shell');
}
async function open() {
  for (let attempt = 0; attempt < 1; attempt++) {
    try {
      await openOnce();
      return;
    } catch (error) {
      if (attempt === 0) throw error;
    }
  }
}

const measure = () =>
  page.evaluate((id) => {
    const badge = document.querySelector(
      `[data-channel-id="${id}"].bh-rail-channel .bh-avatar-attention`,
    );
    if (!badge) throw Error('real pending approval badge missing');
    const rect = badge.getBoundingClientRect();
    const ancestors = [];
    let clipped = false;
    for (let node = badge.parentElement; node; node = node.parentElement) {
      const cs = getComputedStyle(node),
        r = node.getBoundingClientRect();
      const clipX = ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowX);
      const clipY = ['auto', 'scroll', 'hidden', 'clip'].includes(cs.overflowY);
      const failsX = clipX && (rect.left < r.left || rect.right > r.right);
      const failsY = clipY && (rect.top < r.top || rect.bottom > r.bottom);
      if (failsX || failsY) clipped = true;
      if (
        clipX ||
        clipY ||
        node.classList.contains('bh-persona-avatar') ||
        node.classList.contains('bh-rail-channel')
      )
        ancestors.push({
          className: node.className,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          overflowX: cs.overflowX,
          overflowY: cs.overflowY,
          failsX,
          failsY,
        });
    }
    return {
      badge: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      clipped,
      ancestors,
    };
  }, channelId);

try {
  for (const pinned of [false, true]) {
    pinsChanged = true;
    await rpc('pinsSet', {
      pins: pinned
        ? [channelId, ...originalPins.filter((id) => id !== channelId)]
        : originalPins.filter((id) => id !== channelId),
    });
    for (const theme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await open();
      if (!(await page.$('.bh-region-rail')))
        await page
          .locator('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]')
          .click();
      await page.waitForSelector(
        `[data-channel-id="${channelId}"].bh-rail-channel .bh-avatar-attention`,
      );
      const badge = await page.$(
        `[data-channel-id="${channelId}"].bh-rail-channel .bh-avatar-attention`,
      );
      const count = await badge.evaluate((node) => Number(node.dataset.approvalCount));
      assert.equal(
        count,
        proof.nativeHostCount,
        'Client badge must match live Host approval count',
      );
      const geometry = await measure();
      const entry = await page.$(`[data-channel-id="${channelId}"].bh-rail-channel`);
      const firstInGroup = await entry.evaluate(
        (node) => node.closest('.bh-rail-group').querySelector('.bh-rail-channel') === node,
      );
      assert.equal(firstInGroup, true, 'verify the group first row at the vertical clipping edge');
      proof.cases.push({ pinned, theme, firstInGroup, ...geometry });
      await page.screenshot({
        path: resolve(evidence, `rail-${pinned ? 'pinned' : 'ordinary'}-${theme}.png`),
        clip: { x: 0, y: 170, width: 75, height: 160 },
      });
      writeFileSync(resolve(evidence, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
      assert.equal(geometry.clipped, false, 'Rail numeric badge crosses a clipping ancestor');
      const originalText = await badge.evaluate((node) => node.textContent);
      for (const text of ['12', '99+']) {
        await badge.evaluate((node, value) => (node.textContent = value), text);
        assert.equal(
          (await measure()).clipped,
          false,
          `badge text-width stress ${text} is clipped`,
        );
      }
      await badge.evaluate((node, value) => (node.textContent = value), originalText);
    }
  }
  console.log(
    'Real Rail badge fits all clipping ancestors in light/dark, ordinary/pinned first rows; text-width stress also passes.',
  );
} finally {
  try {
    if (pinsChanged) await rpc('pinsSet', { pins: originalPins });
    proof.pinsRestored =
      JSON.stringify((await rpc('rosterGet')).pins) === JSON.stringify(originalPins);
    writeFileSync(resolve(evidence, 'proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
  } finally {
    await browser.close();
  }
}
assert.equal(proof.pinsRestored, true, 'restore the pre-test pin preferences');
