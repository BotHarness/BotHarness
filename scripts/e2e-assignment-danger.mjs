// Live #116 danger-mode tracer: one Bot opts into unrestricted new Assignments.
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
const name = 'DangerAccessE2E-' + Date.now();
const folder = '/tmp/dsh-bh116-danger-' + Date.now();
mkdirSync(folder, { recursive: true });
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
            rpcId: 'danger-e2e-' + Math.random(),
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
  const workspace = await rpc('workspace/create', { request: { path: folder } });
  const grant = (
    await rpc('botharness/grantCreate', { slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((b) => ['工作区授权', 'Workspace Grants'].includes(b.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector('.bh-assignment-access-row', { timeout: 10000 });
  await page.evaluate(() =>
    document.querySelector('.bh-assignment-access-row [role="switch"]')?.click(),
  );
  await page.waitForSelector('.bh-access-warning[role="group"]', { timeout: 5000 });
  await page.screenshot({ path: resolve(shots, '06-danger-confirm.png'), fullPage: true });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('.bh-access-warning[role="group"] button'))
      .find((b) =>
        ['我了解风险，开启', 'I understand, enable'].includes(b.textContent?.trim() ?? ''),
      )
      ?.click(),
  );
  await page.waitForFunction(
    () =>
      document
        .querySelector('.bh-assignment-access-row [role="switch"]')
        ?.getAttribute('aria-checked') === 'true',
    { timeout: 10000 },
  );
  await page.screenshot({ path: resolve(shots, '07-danger-enabled.png'), fullPage: true });
  const preset = (await rpc('botharness/assignmentAccessGet', { slug })).preset;
  if (preset.mode !== 'danger-full-access') throw new Error('Danger preset was not persisted');
  await page.type(
    composer,
    '请用当前有效工作区授权创建一个独立事项，让该事项使用 DSH 原生 bash 执行 pwd 并向你汇报实际输出，再把结果告诉我。Orchestrator 不要自己执行 bash。',
  );
  await page.evaluate(() =>
    document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click(),
  );
  await page.waitForFunction(
    async (slug) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'danger-report-' + Math.random(),
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.assignments?.some(
        (item) =>
          item.activity === 'error' ||
          (item.latestReport?.state === 'completed' && item.latestReport.summary.includes('/tmp/')),
      );
    },
    { timeout: 90000, polling: 500 },
    slug,
  );
  const assignments = (await rpc('botharness/assignments', { slug })).assignments;
  const completed = assignments.find((item) => item.latestReport?.state === 'completed');
  if (!completed)
    throw new Error('Assignment stopped before a completed report: ' + JSON.stringify(assignments));
  if (
    completed.permission?.mode !== 'danger-full-access' ||
    completed.permission?.approval !== 'never'
  )
    throw new Error(
      'Assignment snapshot is not dangerous: ' + JSON.stringify(completed.permission),
    );
  if (await page.$('.bh-tool-approval-card'))
    throw new Error('Danger Assignment unexpectedly requested opaque-tool approval');
  await page.screenshot({
    path: resolve(shots, '08-danger-assignment-complete.png'),
    fullPage: true,
  });
  await rpc('botharness/assignmentAccessSet', {
    slug,
    mode: 'workspace-write',
    acknowledgeRisk: false,
  });
  const safe = (await rpc('botharness/assignmentAccessGet', { slug })).preset;
  if (safe.mode !== 'workspace-write') throw new Error('Could not restore safe default');
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      name,
      slug,
      grantId: grant.id,
      permission: completed.permission,
      report: completed.latestReport,
      screenshots: shots,
    }),
  );
} finally {
  await browser.close();
}
