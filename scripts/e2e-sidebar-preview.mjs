import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const fixturePath = process.env.BH_E2E_FIXTURE;
const viewportWidth = Number.parseInt(process.env.BH_E2E_VIEWPORT_WIDTH ?? '1400', 10);
if (!origin || !home || !fixturePath)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME, and BH_E2E_FIXTURE');
if (!Number.isFinite(viewportWidth) || viewportWidth < 400)
  throw new Error('BH_E2E_VIEWPORT_WIDTH must be at least 400');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  '/tmp/dsh-' + basename(home).replace(/[^a-zA-Z0-9-]/gu, '-') + '.cookies',
  'utf8',
).split(';')[0];

async function waitForBotRoot(page) {
  try {
    await page.waitForSelector('.bh-root', { timeout: 15000 });
  } catch (error) {
    if (process.env.BH_E2E_DEBUG_SCREENSHOT)
      await page.screenshot({ path: process.env.BH_E2E_DEBUG_SCREENSHOT });
    throw error;
  }
}

async function rpc(method, args) {
  const response = await fetch(origin + '/api/botharness/' + method, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: 'sidebar-preview-' + method + '-' + Date.now(),
      method: 'botharness/' + method,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(method + ': ' + response.status + ' ' + JSON.stringify(envelope.result?.error));
  return envelope.result.value;
}

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: viewportWidth, height: 800 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  await page
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('button')).some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
      { timeout: 10000 },
    )
    .catch(() => undefined);
  const hadNotice = await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('button')).find((candidate) =>
      ['Continue', '继续'].includes(candidate.textContent?.trim() ?? ''),
    );
    button?.click();
    return button !== undefined;
  });
  if (hadNotice)
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll('button')).some((button) =>
          ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
        ),
    );
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await waitForBotRoot(page);

  let fixture;
  if (existsSync(fixturePath)) {
    fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
  } else {
    const bot = (await rpc('create', { displayName: 'Mira Preview QA' })).bot;
    const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
    const group = (await rpc('channelCreate', { name: 'Planning Preview QA', members: [] }))
      .channel;
    const avatar = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 64;
      const context = canvas.getContext('2d');
      context.fillStyle = '#6c78bd';
      context.fillRect(0, 0, 64, 64);
      context.fillStyle = '#ffffff';
      context.font = 'bold 34px sans-serif';
      context.textAlign = 'center';
      context.fillText('P', 32, 44);
      return canvas.toDataURL('image/webp');
    });
    await rpc('channelGroupAvatarSet', { channelId: group.id, avatar });
    await rpc('channelSend', { channelId: dm.id, body: 'Please review the latest outline.' });
    await rpc('channelSend', { channelId: group.id, body: 'Agenda and notes are ready.' });
    await rpc('pause', { slug: bot.slug });
    fixture = { dmId: dm.id, groupId: group.id };
    writeFileSync(fixturePath, JSON.stringify(fixture));
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector(botButton);
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await waitForBotRoot(page);
  }

  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  const dmSelector = '.bh-root [data-channel-id="' + fixture.dmId + '"]';
  const groupSelector = '.bh-root [data-channel-id="' + fixture.groupId + '"]';
  await page.waitForSelector(dmSelector);
  await page.waitForSelector(groupSelector);
  const rows = await page.evaluate(
    ({ dmSelector, groupSelector }) =>
      [dmSelector, groupSelector].map((selector) => {
        const row = document.querySelector(selector);
        return {
          name: row?.querySelector('.bh-name')?.textContent,
          preview: row?.querySelector('.bh-msg')?.textContent,
          groupAvatar: row?.querySelector('.bh-group-avatar-image') !== null,
          height: row?.getBoundingClientRect().height,
        };
      }),
    { dmSelector, groupSelector },
  );
  if (process.env.BH_E2E_EXPECT_PREVIEW === '1') {
    const channels = (await rpc('channels', {})).channels;
    const dmMessage = channels.find((channel) => channel.id === fixture.dmId)?.latestMessage;
    const dmBody = dmMessage?.body.replace(/\s+/gu, ' ').trim();
    assert.ok(dmBody, 'fixture DM must have a durable latest message');
    assert.ok(rows[0].preview?.includes(dmBody), 'DM preview must show the latest message');
    assert.match(rows[1].preview ?? '', /Agenda and notes are ready/u);
    assert.equal(rows[1].name, 'Planning Preview QA');
    assert.ok(rows[1].groupAvatar);
    assert.ok(Math.abs(rows[0].height - rows[1].height) <= 1);
  }
  if (process.env.BH_E2E_SCREENSHOT)
    await page.screenshot({
      path: process.env.BH_E2E_SCREENSHOT,
      clip: { x: 0, y: 0, width: 400, height: 800 },
    });
  if (process.env.BH_E2E_UNPIN_SCREENSHOT) {
    const originalPins = (await rpc('rosterGet', {})).pins;
    try {
      await rpc('pinsSet', { pins: [...new Set([...originalPins, fixture.dmId])] });
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.waitForSelector(botButton);
      if (!(await page.$('.bh-root'))) await page.click(botButton);
      await waitForBotRoot(page);
      const pinnedSelector = '.bh-pinned[data-channel-id="' + fixture.dmId + '"]';
      await page.waitForSelector(pinnedSelector);
      await page.evaluate((selector) => {
        const pinned = document.querySelector(selector);
        if (!pinned) throw new Error('Pinned DM row disappeared before drag');
        pinned.dispatchEvent(
          new DragEvent('dragstart', { bubbles: true, dataTransfer: new DataTransfer() }),
        );
      }, pinnedSelector);
      await page.waitForFunction(
        () => !document.querySelector('.bh-unpin-zone')?.classList.contains('bh-unpin-zone-hidden'),
      );
      await page.waitForFunction(
        () => document.querySelector('.bh-unpin-zone')?.getBoundingClientRect().height >= 72,
      );
      const dragStyles = await page.evaluate(() => {
        const zone = document.querySelector('.bh-unpin-zone');
        const hint = document.querySelector('.bh-unpin-zone-hint');
        const avatar = document.querySelector('.bh-pinned .bh-persona-avatar');
        return {
          paddingLeft: getComputedStyle(zone).paddingLeft,
          paddingRight: getComputedStyle(zone).paddingRight,
          textAlign: getComputedStyle(hint).textAlign,
          avatarOutline: getComputedStyle(avatar, '::before').content,
        };
      });
      assert.equal(dragStyles.paddingLeft, '20px');
      assert.equal(dragStyles.paddingRight, '20px');
      assert.equal(dragStyles.textAlign, 'center');
      assert.equal(dragStyles.avatarOutline, 'none');
      await page.screenshot({
        path: process.env.BH_E2E_UNPIN_SCREENSHOT,
        clip: { x: 0, y: 0, width: 400, height: 600 },
      });
      console.log(JSON.stringify({ dragStyles }));
    } finally {
      await rpc('pinsSet', { pins: originalPins });
    }
  }
  console.log(JSON.stringify({ rows }));
} finally {
  await browser.close();
}
