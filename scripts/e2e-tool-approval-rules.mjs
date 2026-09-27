// Live #116 rule tracer: an approval card persists an opaque-tool rule, then revocation restores asking.
import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3197';
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh116-rule-shots';
mkdirSync(shots, { recursive: true });
const name = 'ApprovalRulesE2E-' + Date.now();
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  await page.goto(origin + '/?token=' + encodeURIComponent(token), {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((b) => b.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((b) => ['BOT 模式', 'Bot mode'].includes(b.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForSelector('button[aria-label="新建"], button[aria-label="New"]', {
    timeout: 10000,
  });
  await page.click('button[aria-label="新建"], button[aria-label="New"]');
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((b) => b.textContent?.includes('PersonaBot'))
      ?.click(),
  );
  await page.type('input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]', name);
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => ['创建', 'Create'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  const composer = 'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]';
  await page.waitForSelector(composer, { timeout: 10000 });
  const rpc = async (method, args) =>
    page.evaluate(
      async (method, args) => {
        const response = await fetch('/api/' + method, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: 'rules-e2e-' + Math.random(),
            method,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true)
          throw new Error(method + ': ' + JSON.stringify(envelope.result ?? envelope));
        return envelope.result.value;
      },
      method,
      args,
    );
  const channels = await rpc('botharness/channels', {});
  const slug = channels.channels.find((c) => c.type === 'dm' && c.name === name)?.botSlug;
  if (!slug) throw new Error('Missing bot DM');
  const send = async (prompt) => {
    await page.type(composer, prompt);
    await page.evaluate(() =>
      document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click(),
    );
  };
  const cardCount = async () => page.$$eval('.bh-tool-approval-card', (cards) => cards.length);
  const bubbleCount = async () =>
    page.$$eval(
      '.bh-message-group:not(.bh-message-group-me) .bh-bubble-body',
      (nodes) => nodes.length,
    );
  const prompt = '请使用 DSH 原生 bash 工具执行 pwd，然后告诉我实际输出。';
  await send(prompt);
  await page.waitForSelector('.bh-tool-approval-card', { timeout: 90000 });
  await page.screenshot({ path: resolve(shots, '01-approval-card.png'), fullPage: true });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-tool-approval-card button'))
      .find((b) =>
        ['始终允许此范围全部不透明工具', 'Always allow all opaque tools in this scope'].includes(
          b.textContent?.trim() ?? '',
        ),
      )
      ?.click(),
  );
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.bh-tool-approval-confirm button')).some((b) =>
      ['确认始终允许', 'Confirm always allow'].includes(b.textContent?.trim() ?? ''),
    ),
  );
  await page.screenshot({ path: resolve(shots, '02-allow-all-confirm.png'), fullPage: true });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-tool-approval-confirm button'))
      .find((b) => ['确认始终允许', 'Confirm always allow'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-tool-approval-card')?.textContent?.includes('规则') ||
      document.querySelector('.bh-tool-approval-card')?.textContent?.includes('rule saved'),
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll('.bh-message-group:not(.bh-message-group-me) .bh-bubble-body'),
      ).some((b) => b.textContent?.includes('/tmp/')),
    { timeout: 90000 },
  );
  await page.screenshot({ path: resolve(shots, '03-rule-saved.png'), fullPage: true });
  const rules = (await rpc('botharness/toolApprovalRules', { slug })).rules;
  const rule = rules.find((r) => r.kind === 'all-opaque' && !r.revokedAt);
  if (!rule) throw new Error('Broad rule not persisted');
  const beforeCards = await cardCount();
  const beforeBubbles = await bubbleCount();
  await send('请再次使用 DSH 原生 bash 工具执行 pwd，报告工具实际输出。');
  await page.waitForFunction(
    (count) =>
      document.querySelectorAll('.bh-message-group:not(.bh-message-group-me) .bh-bubble-body')
        .length > count,
    { timeout: 90000 },
    beforeBubbles,
  );
  if ((await cardCount()) !== beforeCards) throw new Error('Saved broad rule did not auto approve');
  await page.screenshot({ path: resolve(shots, '04-auto-approved.png'), fullPage: true });
  await rpc('botharness/toolApprovalRuleRevoke', { slug, id: rule.id });
  const afterRevoke = (await rpc('botharness/toolApprovalRules', { slug })).rules.find(
    (r) => r.id === rule.id,
  );
  if (!afterRevoke?.revokedAt) throw new Error('Rule was not revoked');
  await send('请第三次使用 DSH 原生 bash 工具执行 pwd，报告工具实际输出。');
  await page.waitForFunction(
    (count) => document.querySelectorAll('.bh-tool-approval-card').length > count,
    { timeout: 90000 },
    beforeCards,
  );
  await page.screenshot({ path: resolve(shots, '05-revoked-asks-again.png'), fullPage: true });
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      botName: name,
      slug,
      ruleId: rule.id,
      screenshots: shots,
      cardsBefore: beforeCards,
      cardsAfterRevoke: await cardCount(),
    }),
  );
} finally {
  await browser.close();
}
