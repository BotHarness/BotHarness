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
  const botName = 'ComposerLayout-' + Date.now();
  await page.type('input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]', botName);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['创建', 'Create'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  const selector = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForFunction(
    (name) =>
      document.querySelector('.bh-composer-input')?.getAttribute('placeholder')?.includes(name) ??
      false,
    { timeout: 10000 },
    botName,
  );
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
  await page.evaluate(() => {
    const composer = document.querySelector('.bh-composer');
    const body = document.querySelector('.bh-composer-body');
    const add = document.querySelector('.bh-composer-add-file');
    const send = document.querySelector('.bh-send-btn');
    if (!composer || !body || !add || !send) throw new Error('Composer motion targets missing');
    const samples = [];
    window.__bhComposerMotionSamples = samples;
    const observer = new MutationObserver(() => {
      if (composer.getAttribute('data-layout') !== 'expanded') return;
      observer.disconnect();
      let frames = 0;
      const sample = () => {
        const centerY = (element) => {
          const rect = element.getBoundingClientRect();
          return rect.top + rect.height / 2;
        };
        samples.push({
          addY: centerY(add),
          sendY: centerY(send),
          bodyHeight: body.getBoundingClientRect().height,
        });
        if (++frames < 18) requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    observer.observe(composer, { attributes: true, attributeFilter: ['data-layout'] });
  });
  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.type(selector, 'second line');
  await page.waitForFunction(
    () => document.querySelector('.bh-composer')?.classList.contains('bh-composer-with-footer'),
    { timeout: 10000 },
  );
  await page
    .waitForFunction(
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
      { timeout: 10000 },
    )
    .catch(async (error) => {
      console.error(
        JSON.stringify({
          phase: 'footer-clearance',
          geometry: await measure(),
          draft: await page.$eval(selector, (element) => element.value),
          activeElement: await page.evaluate(() => document.activeElement?.tagName),
        }),
      );
      throw error;
    });
  await page.waitForFunction(() => window.__bhComposerMotionSamples?.length === 18);
  const expanded = await measure();
  assert.equal(expanded.layout, 'expanded');
  assert.equal(expanded.footer, true);
  assert.ok(Math.abs(expanded.add.centerY - expanded.send.centerY) < 2);
  assert.ok(expanded.add.top > expanded.input.bottom);
  assert.ok(expanded.send.top > expanded.input.bottom);
  assert.ok(compact.input.left - compact.composer.left > 40);
  assert.ok(compact.composer.right - compact.input.right > 50);
  assert.ok(expanded.input.left - expanded.composer.left < 20);
  assert.ok(expanded.composer.right - expanded.input.right < 20);
  assert.ok(expanded.add.left < expanded.input.left);
  const firstExpand = await page.evaluate(() => {
    const samples = window.__bhComposerMotionSamples;
    const body = document.querySelector('.bh-composer-body');
    return {
      samples,
      duration: getComputedStyle(body).transitionDuration,
    };
  });
  const spread = (values) => Math.max(...values) - Math.min(...values);
  assert.equal(firstExpand.duration, '0.22s');
  assert.ok(
    spread(firstExpand.samples.map((sample) => sample.bodyHeight)) > 15,
    'the first line-to-multiline expansion should animate',
  );
  assert.ok(
    spread(firstExpand.samples.map((sample) => sample.addY)) < 2,
    'the add button must not bounce during expansion',
  );
  assert.ok(
    spread(firstExpand.samples.map((sample) => sample.sendY)) < 2,
    'the send button must not bounce during expansion',
  );

  await page.keyboard.down('Shift');
  await page.keyboard.press('Enter');
  await page.keyboard.up('Shift');
  await page.type(selector, 'third line');
  const laterGrowth = await page.evaluate(() => {
    const composer = document.querySelector('.bh-composer');
    const body = document.querySelector('.bh-composer-body');
    return {
      oneTimeClassPresent: composer.classList.contains('bh-composer-first-expand'),
      duration: getComputedStyle(body).transitionDuration,
      renderedHeight: body.getBoundingClientRect().height,
      targetHeight: Number.parseFloat(composer.style.getPropertyValue('--bh-composer-body-height')),
    };
  });
  assert.equal(laterGrowth.oneTimeClassPresent, false);
  assert.equal(laterGrowth.duration, '0s');
  assert.ok(Math.abs(laterGrowth.renderedHeight - laterGrowth.targetHeight) < 1);

  if (process.env.BH_E2E_SCREENSHOT) {
    const captured = await measure();
    await page.screenshot({
      path: process.env.BH_E2E_SCREENSHOT,
      clip: {
        x: captured.composer.left - 12,
        y: captured.composer.top - 12,
        width: captured.composer.right - captured.composer.left + 24,
        height: captured.composer.bottom - captured.composer.top + 24,
      },
    });
  }
  await page.setViewport({ width: 720, height: 900 });
  await page.waitForFunction(
    () => window.innerWidth === 720 && document.querySelector('.bh-composer')?.clientWidth > 0,
    { timeout: 10000 },
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
      firstExpandHeightChange: spread(firstExpand.samples.map((sample) => sample.bodyHeight)),
      addButtonVerticalDrift: spread(firstExpand.samples.map((sample) => sample.addY)),
      sendButtonVerticalDrift: spread(firstExpand.samples.map((sample) => sample.sendY)),
    }),
  );
} catch (error) {
  console.error(String(error.stack ?? error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
