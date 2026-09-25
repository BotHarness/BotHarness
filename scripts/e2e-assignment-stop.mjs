import { createRequire } from 'node:module';
import { mkdirSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3214';
const shots = process.env.BH_SCREENSHOT_DIR ?? '/tmp/bh194-stop-shots';
mkdirSync(shots, { recursive: true });
const name = 'StopAssignmentQA-' + Date.now();
const folder = '/tmp/bh194-stop-workspace-' + Date.now();
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
            rpcId: 'stop-e2e-' + Math.random(),
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
  const dm = channels.channels.find((c) => c.type === 'dm' && c.name === name);
  const slug = dm?.botSlug;
  if (!slug) throw new Error('Missing bot DM');
  const workspace = await rpc('workspace/create', { request: { path: folder } });
  const grant = (
    await rpc('botharness/grantCreate', { slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  const send = async (message) => {
    await rpc('botharness/channelSend', { channelId: dm.id, body: message });
  };
  await send(
    '请从当前有效工作区授权创建一个独立事项，让该事项使用 DSH 原生 bash 执行 pwd。Orchestrator 不要自己运行 bash；请在 Channel 告诉我事项 Session ID。',
  );
  await page.waitForFunction(
    async (slug) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-poll-' + Math.random(),
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.assignments?.some((item) => item.activity === 'working');
    },
    { timeout: 120000, polling: 700 },
    slug,
  );
  const assignments = (await rpc('botharness/assignments', { slug })).assignments;
  const assignment = assignments.find((item) => item.activity === 'working');
  if (!assignment) throw new Error('Missing working Assignment');
  await page.waitForSelector('.bh-tool-approval-card', { timeout: 90000 });
  await page.screenshot({ path: resolve(shots, '01-pending-approval.png'), fullPage: true });
  await send(
    '请立即使用 stop_assignment 停止刚创建的事项 Session ' +
      assignment.sessionId +
      '。停止完成后在本 Channel 告诉我结果。不要批准或运行待审批的 bash。',
  );
  await page.waitForFunction(
    async (slug, sessionId) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-poll-' + Math.random(),
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.assignments?.some(
        (item) => item.sessionId === sessionId && item.activity === 'stopped',
      );
    },
    { timeout: 120000, polling: 700 },
    slug,
    assignment.sessionId,
  );
  await page.waitForFunction(
    async (channelId, sessionId) => {
      const response = await fetch('/api/botharness/channelMessages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'stop-history-' + Math.random(),
          method: 'botharness/channelMessages',
          payload: { args: { channelId } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.messages?.some(
        (message) =>
          message.author?.kind === 'bot' &&
          message.body?.includes(sessionId) &&
          message.body.includes('stopped'),
      );
    },
    { timeout: 30000, polling: 500 },
    dm.id,
    assignment.sessionId,
  );
  const stopped = (await rpc('botharness/assignments', { slug })).assignments.find(
    (item) => item.sessionId === assignment.sessionId,
  );
  await page.waitForFunction(
    (botName) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(botName),
      ),
    { timeout: 10000 },
    name,
  );
  await page.evaluate(
    (botName) =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(botName))
        ?.click(),
    name,
  );
  await page.waitForFunction(
    (sessionId) =>
      document.body.innerText.includes(sessionId) &&
      !document.body.innerText.includes('Loading messages…'),
    { timeout: 10000 },
    assignment.sessionId,
  );
  await page.screenshot({ path: resolve(shots, '02-stopped.png'), fullPage: true });
  if (stopped?.activity !== 'stopped') throw new Error('Assignment not stopped');
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      name,
      slug,
      folder,
      grantId: grant.id,
      sessionId: assignment.sessionId,
      status: stopped.activity,
      shots,
    }),
  );
} finally {
  await browser.close();
}
