import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN;
assert.ok(origin && process.env.BH_E2E_HOME, 'Set BH_E2E_ORIGIN and BH_E2E_HOME');
const home = process.env.BH_E2E_HOME;
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
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
const bot = process.env.BH_E2E_BOT_SLUG
  ? (await rpc('list')).bots.find((e) => e.slug === process.env.BH_E2E_BOT_SLUG)
  : (await rpc('create', { displayName: `Compact policy QA ${Date.now()}` })).bot;
assert.ok(bot);
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ cookie });
const evidence = process.env.BH_E2E_EVIDENCE ?? '.humanlayer/tasks/source-policy-compact/e2e';
mkdirSync(evidence, { recursive: true });
async function clickText(texts, scope = 'button') {
  await page.waitForFunction(
    ({ texts, scope }) =>
      [...document.querySelectorAll(scope)].some((e) => texts.includes(e.textContent?.trim())),
    {},
    { texts, scope },
  );
  await page.evaluate(
    ({ texts, scope }) =>
      [...document.querySelectorAll(scope)]
        .find((e) => texts.includes(e.textContent?.trim()))
        ?.click(),
    { texts, scope },
  );
}
async function open() {
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((e) =>
          ['Continue', '继续'].includes(e.textContent?.trim()),
        ),
      { timeout: 3000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => ['Continue', '继续'].includes(e.textContent?.trim()))
      ?.click(),
  );
  if (!(await page.$('.bh-root')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-root') ||
      [...document.querySelectorAll('button')].some((e) =>
        ['Configure later', '稍后配置'].includes(e.textContent?.trim()),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => ['Configure later', '稍后配置'].includes(e.textContent?.trim()))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="dm-${bot.slug}"]`);
  await page.click(`[data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('.bh-channel-island[aria-haspopup="dialog"]')
        ?.textContent?.includes(name),
    {},
    bot.displayName,
  );
  await page.click('.bh-channel-island[aria-haspopup="dialog"]');
  await clickText(['View details', '查看详细']);
  await page.waitForSelector('.bh-profile-view');
  await page.waitForSelector(
    '.bh-profile-policy-section:has(.bh-source-policy-row) > details > summary',
  );
  await page.$eval(
    '.bh-profile-policy-section:has(.bh-source-policy-row) > details > summary',
    (e) => {
      if (!e.parentElement.open) e.click();
      e.scrollIntoView({ block: 'start' });
      if (!document.querySelector('.bh-source-policy-table'))
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (
            p.scrollHeight > p.clientHeight &&
            ['auto', 'scroll'].includes(getComputedStyle(p).overflowY)
          ) {
            p.scrollTop = Math.max(0, p.scrollTop - 72);
            break;
          }
        }
    },
  );
  await page.waitForSelector('.bh-source-policy-row button', { visible: true });
}
try {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await open();
  assert.equal(await page.$$eval('.bh-source-policy-row', (e) => e.length), 9);
  assert.equal(
    await page.$$eval(
      '.bh-source-policy-actions button[aria-label^="修改"],.bh-source-policy-actions button[aria-label^="Edit"]',
      (e) => e.length,
    ),
    5,
  );
  assert.equal(await page.$$eval('.bh-source-policy-read-only', (e) => e.length), 4);
  const row = '.bh-source-policy-row[data-source-class="human-dm"]';
  const policies = () => rpc('botSourcePolicies', { slug: bot.slug }).then((r) => r.policies);
  const before = (await policies()).find((e) => e.sourceClass === 'human-dm');
  await page.$eval(`${row} button`, (e) => e.focus());
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForSelector('[role="dialog"] .bh-source-policy-audit');
  assert.ok(
    (await page.$eval('.bh-source-policy-audit', (e) => e.textContent)).includes(
      String(before.revision),
    ),
  );
  await page.screenshot({ path: resolve(evidence, 'audit.png') });
  await page.keyboard.press('Escape');
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"] .bh-source-policy-audit'),
  );
  await page.locator(`${row} button`).click();
  await page.waitForSelector('[role="dialog"] select.bh-profile-policy-select');
  await page.select('[role="dialog"] select.bh-profile-policy-select', 'turn');
  await page.screenshot({ path: resolve(evidence, 'edit.png') });
  await clickText(['Save', '保存'], '[role="dialog"] button');
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"] select.bh-profile-policy-select'),
  );
  const saved = (await policies()).find((e) => e.sourceClass === 'human-dm');
  assert.equal(saved.delivery, 'turn');
  assert.equal(saved.revision, before.revision + 1);
  assert.equal(saved.lastActor.kind, 'human');
  await page.waitForFunction(
    (selector) => /独立回合|own turn/.test(document.querySelector(selector)?.textContent ?? ''),
    {},
    row,
  );
  await page.locator(`${row} button`).click();
  await clickText(['Restore default', '恢复默认'], '[role="dialog"] button');
  await page.waitForFunction(
    () => !document.querySelector('[role="dialog"] select.bh-profile-policy-select'),
  );
  const restored = (await policies()).find((e) => e.sourceClass === 'human-dm');
  assert.equal(restored.delivery, 'steer');
  assert.equal(restored.revision, saved.revision + 1);
  assert.equal(restored.overrideActive, false);
  await open();
  await page.waitForFunction(
    (selector) =>
      /并入回合|folded into the turn/.test(document.querySelector(selector)?.textContent ?? ''),
    {},
    row,
  );
  await page.$eval(`${row} button`, (e) => e.focus());
  await page.keyboard.press('Tab');
  await page.keyboard.press('Enter');
  await page.waitForSelector('.bh-source-policy-audit');
  const audit = await page.$eval('.bh-source-policy-audit', (e) => e.textContent);
  assert.ok(audit.includes(String(restored.revision)) && /已恢复|restored/.test(audit));
  await page.screenshot({ path: resolve(evidence, 'restored-audit.png') });
  await page.keyboard.press('Escape');
  await page.locator('.bh-source-policy-row[data-source-class="group-ordinary"] button').click();
  await page.waitForSelector('[role="dialog"] select.bh-profile-policy-select');
  assert.equal(
    await page.$eval('[role="dialog"] select.bh-profile-policy-select', (e) => e.value),
    'digest',
  );
  assert.equal(await page.$eval('[role="dialog"] input[type="number"]', (e) => e.value), '5');
  await page.keyboard.press('Escape');
  await page.$eval(
    '.bh-source-policy-row[data-source-class="group-ordinary"] button[aria-label^="查看"],.bh-source-policy-row[data-source-class="group-ordinary"] button[aria-label^="View"]',
    (e) => e.click(),
  );
  await page.waitForSelector('.bh-source-policy-audit');
  assert.match(
    await page.$eval('.bh-source-policy-audit', (e) => e.textContent),
    /群聊可覆盖|Group override may replace/,
  );
  await page.keyboard.press('Escape');
  const geometry = await page.evaluate(() => ({
    viewport: innerWidth,
    body: document.documentElement.scrollWidth,
    rows: document.querySelectorAll('.bh-source-policy-row').length,
  }));
  assert.ok(geometry.body <= geometry.viewport);
  writeFileSync(
    resolve(evidence, 'interaction-proof.json'),
    JSON.stringify(
      {
        bot: { slug: bot.slug, displayName: bot.displayName },
        before,
        saved,
        restored,
        geometry,
        keyboardAudit: true,
        refreshRetained: true,
        groupDigestAndOverridePreserved: true,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      bot: bot.displayName,
      savedRevision: saved.revision,
      restoredRevision: restored.revision,
    }),
  );
} catch (error) {
  console.error(error);
  await page.screenshot({ path: resolve(evidence, 'failure.png') }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((done) =>
      setTimeout(() => {
        browser.process()?.kill();
        done();
      }, 5000),
    ),
  ]);
  process.exit(process.exitCode ?? 0);
}
