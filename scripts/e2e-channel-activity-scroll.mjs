// Live DSH regression for #120. Set BH_E2E_ORIGIN and either BH_E2E_TOKEN or
// BH_E2E_COOKIE_FILE (a private local cookie jar created by dev-instance).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const dir = readdirSync(pnpm).find((x) => x.startsWith('puppeteer@'));
if (!dir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, dir, 'node_modules/'))('puppeteer');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const cookieFile = process.env.BH_E2E_COOKIE_FILE;
const token = process.env.BH_E2E_TOKEN;
if (!cookieFile && !token) throw new Error('Set BH_E2E_TOKEN or BH_E2E_COOKIE_FILE');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const measure = (page) =>
  page.evaluate(() => {
    const body = document.querySelector('.bh-chat-body');
    const entries = [...document.querySelectorAll('.bh-chat-body [data-message-id]')];
    const last = entries.at(-1),
      footer = document.querySelector('.bh-composer-activity-status');
    if (!body) return null;
    const b = body.getBoundingClientRect(),
      m = last?.getBoundingClientRect(),
      f = footer?.getBoundingClientRect();
    return {
      scrollTop: body.scrollTop,
      scrollHeight: body.scrollHeight,
      clientHeight: body.clientHeight,
      bottomGap: body.scrollHeight - body.scrollTop - body.clientHeight,
      messageCount: entries.length,
      lastMessageBottom: m?.bottom,
      viewportBottom: b.bottom,
      footerTop: f?.top,
      footerHeight: f?.height,
      visible: last ? m.bottom <= b.bottom - 2 : null,
    };
  });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  if (cookieFile) {
    const cookie = readFileSync(cookieFile, 'utf8').split(';')[0];
    const sep = cookie.indexOf('=');
    await page.setCookie({ name: cookie.slice(0, sep), value: cookie.slice(sep + 1), url: origin });
  }
  await page.goto(token ? origin + '/?token=' + encodeURIComponent(token) : origin, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  if (process.env.BH_E2E_DARK === '1') {
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  }
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Continue')
      ?.click();
    [...document.querySelectorAll('button')]
      .find((b) => ['BOT 模式', 'Bot mode'].includes(b.textContent?.trim() ?? ''))
      ?.click();
  });
  await sleep(700);
  await page.evaluate(() => {
    [...document.querySelectorAll('button')]
      .find((b) => b.textContent?.trim() === 'Configure later')
      ?.click();
    document.querySelector('button[aria-label="新建"], button[aria-label="New"]')?.click();
  });
  await page.evaluate(() =>
    [...document.querySelectorAll('[role="menuitem"]')]
      .find((x) => x.textContent?.includes('PersonaBot'))
      ?.click(),
  );
  const botName = 'ActivityScroll-' + Date.now();
  await page.type('input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]', botName);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((b) => ['创建', 'Create'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  const input = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForSelector(input, { timeout: 15000 });
  const rpc = (method, args = {}) =>
    page.evaluate(
      async (method, args) => {
        const response = await fetch('/api/botharness/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'activity-scroll-' + method,
            method: 'botharness/' + method,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true) throw new Error(method + ' failed');
        return envelope.result.value;
      },
      method,
      args,
    );
  const bot = (await rpc('list')).bots.find((item) => item.displayName === botName);
  assert.ok(bot, 'Created PersonaBot is missing from Host list');
  await rpc('pinsSet', { pins: ['dm-' + bot.slug] });
  await page.setViewport({ width: 1440, height: 390 });
  const before = await measure(page);
  assert.equal(before?.footerHeight, undefined, 'Activity footer should start collapsed');
  const prompt =
    '请先使用 shell 工具执行 sleep 15，然后回复“滚动测试完成”。' +
    '这是用于滚动布局的测试文字。'.repeat(45);
  await page.type(input, prompt, { delay: 0 });
  await page.evaluate(() =>
    document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click(),
  );
  let atFooter = null;
  for (let i = 0; i < 70; i++) {
    await sleep(200);
    const m = await measure(page);
    if (m?.footerHeight > 0 && m.messageCount > 0) {
      atFooter = m;
      break;
    }
  }
  assert.ok(atFooter, 'Activity footer and Human message did not appear');
  assert.ok(atFooter.footerHeight >= 39, 'Activity footer did not expand');
  assert.equal(atFooter.visible, true, 'New Human message is clipped by activity footer');
  assert.ok(atFooter.bottomGap <= 3, 'Following timeline did not stay at the bottom');
  await page.waitForSelector('.bh-pinned .bh-persona-avatar[data-active="true"]', {
    timeout: 8000,
  });
  const frames = await page.evaluate(() => {
    const result = {};
    for (const [name, selector] of Object.entries({
      pinned: '.bh-pinned .bh-persona-avatar[data-active="true"]',
      row: '.bh-contact .bh-persona-avatar[data-active="true"]',
      rail: '.bh-region-rail .bh-persona-avatar[data-active="true"]',
      header: '.bh-channel-island .bh-persona-avatar[data-active="true"]',
      composer: '.bh-composer-activity-status .bh-persona-avatar[data-active="true"]',
    })) {
      const element = document.querySelector(selector);
      if (!element) {
        if (name === 'row' || name === 'rail') continue; // These surfaces may be unmounted.
        throw new Error(name + ' active avatar missing');
      }
      const pseudo = getComputedStyle(element, '::before');
      result[name] = { content: pseudo.content, borderWidth: pseudo.borderTopWidth };
    }
    return result;
  });
  for (const [surface, frame] of Object.entries(frames)) {
    assert.equal(frame.borderWidth, '0px', surface + ' has a redundant outer border');
    assert.equal(frame.content, 'none', surface + ' has a redundant outer pseudo frame');
  }
  if (process.env.BH_E2E_SCREENSHOT) {
    await page.screenshot({ path: process.env.BH_E2E_SCREENSHOT });
  }
  await page.evaluate(() => {
    const b = document.querySelector('.bh-chat-body');
    if (b) b.scrollTop = 0;
  });
  await sleep(300);
  const historyBefore = await measure(page);
  assert.ok(
    historyBefore.scrollHeight > historyBefore.clientHeight + 80,
    'History fixture did not overflow',
  );
  await page.type(input, '第二条测试消息。');
  await page.evaluate(() =>
    document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click(),
  );
  let historyAfter = null;
  for (let i = 0; i < 50; i++) {
    await sleep(200);
    const m = await measure(page);
    if (m?.messageCount >= 2) {
      historyAfter = m;
      break;
    }
  }
  assert.ok(historyAfter, 'Second Human message was not committed');
  assert.ok(
    historyAfter.scrollTop <= historyBefore.scrollTop + 5,
    'History reading jumped after send',
  );
  console.log(
    JSON.stringify({
      footerHeight: atFooter.footerHeight,
      bottomGap: atFooter.bottomGap,
      newMessageVisible: atFooter.visible,
      frames,
      historyBefore: historyBefore.scrollTop,
      historyAfter: historyAfter.scrollTop,
    }),
  );
} finally {
  await browser.close();
}
