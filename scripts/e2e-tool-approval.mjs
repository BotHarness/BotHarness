// Live #116 tracer: a real model requests a native command, the Channel card
// approves this exact call, and the original Agent turn resumes.
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
if (!token) throw new Error('Set BH_E2E_TOKEN to the isolated DSH web token');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3196';
const assignment = process.argv.includes('--assignment');
const name = `ToolApprovalE2E-${Date.now()}`;
const folder = `/tmp/dsh-bh116-approval-assignment-${Date.now()}`;
if (assignment) mkdirSync(folder, { recursive: true });
const prompt = assignment
  ? '请用现有的有效工作区授权创建一个独立 Assignment 事项，要求该事项使用 DSH 原生 bash 工具执行 pwd 并向你汇报实际输出，再把结果回复我。请不要由 Orchestrator 自己执行 bash。'
  : '请使用 DSH 原生 bash 工具执行 pwd，然后告诉我工具实际输出的工作目录。请不要猜测路径。';
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
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
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="新建"], button[aria-label="New"]'),
    { timeout: 10000 },
  );
  await page.evaluate(() => {
    document.querySelector('button[aria-label="新建"], button[aria-label="New"]')?.click();
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('PersonaBot'))
      ?.click();
  });
  await page.type('input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]', name);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['创建', 'Create'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForSelector(
    'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]',
    { timeout: 10000 },
  );
  let assignmentSlug;
  if (assignment) {
    assignmentSlug = await page.evaluate(
      async (botName, path) => {
        const rpc = async (method, args) => {
          const response = await fetch(`/api/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: `approval-e2e-${Math.random()}`,
              method,
              payload: { args },
            }),
          });
          const envelope = await response.json();
          if (envelope.result?.ok !== true)
            throw new Error(`${method}: ${JSON.stringify(envelope.result ?? envelope)}`);
          return envelope.result.value;
        };
        const channels = await rpc('botharness/channels', {});
        const dm = channels.channels.find(
          (channel) => channel.type === 'dm' && channel.name === botName,
        );
        if (!dm?.botSlug) throw new Error('Bot DM missing');
        const workspace = await rpc('workspace/create', { request: { path } });
        await rpc('botharness/grantCreate', {
          slug: dm.botSlug,
          workspaceId: workspace.workspace.workspaceId,
        });
        return dm.botSlug;
      },
      name,
      folder,
    );
  }
  await page.type('textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]', prompt);
  await page.evaluate(() => {
    document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click();
  });
  await page.waitForSelector('.bh-tool-approval-card', { timeout: 90000 });
  const before = await page.$eval('.bh-tool-approval-card', (card) => ({
    text: card.textContent ?? '',
    input: card.querySelector('.bh-tool-approval-input')?.textContent ?? '',
    buttons: Array.from(card.querySelectorAll('button')).map((button) =>
      button.textContent?.trim(),
    ),
  }));
  if (assignment && !before.text.includes('Assignment') && !before.text.includes('事项')) {
    throw new Error('Expected Assignment approval, got: ' + before.text);
  }
  if (!before.buttons.some((button) => button === '仅批准这一次' || button === 'Allow once')) {
    throw new Error('Approval card has no live one-time button: ' + JSON.stringify(before));
  }
  await page.evaluate(() => {
    const card = document.querySelector('.bh-tool-approval-card');
    Array.from(card?.querySelectorAll('button') ?? [])
      .find((button) => ['仅批准这一次', 'Allow once'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.bh-tool-approval-card')).some((card) =>
        ['已批准这一次调用', 'This call was approved'].some((label) =>
          card.textContent?.includes(label),
        ),
      ),
    { timeout: 30000 },
  );
  await page.waitForFunction(
    () =>
      Array.from(
        document.querySelectorAll('.bh-message-group:not(.bh-message-group-me) .bh-bubble-body'),
      ).some((body) => body.textContent?.includes('/')),
    { timeout: 90000 },
  );
  const reply = await page.$eval(
    '.bh-message-group:not(.bh-message-group-me) .bh-bubble-body',
    (body) => body.textContent ?? '',
  );
  let assignmentReport;
  if (assignment) {
    await page.waitForFunction(
      async (slug) => {
        const response = await fetch('/api/botharness/assignments', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `approval-report-${Math.random()}`,
            method: 'botharness/assignments',
            payload: { args: { slug } },
          }),
        });
        const envelope = await response.json();
        return envelope.result?.value?.assignments?.some(
          (item) =>
            item.latestReport?.state === 'completed' && item.latestReport.summary.includes('/tmp/'),
        );
      },
      { timeout: 90000, polling: 500 },
      assignmentSlug,
    );
    assignmentReport = await page.evaluate(async (slug) => {
      const response = await fetch('/api/botharness/assignments', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: 'approval-report-final',
          method: 'botharness/assignments',
          payload: { args: { slug } },
        }),
      });
      const envelope = await response.json();
      return envelope.result.value.assignments.find(
        (item) => item.latestReport?.state === 'completed',
      )?.latestReport;
    }, assignmentSlug);
  }
  console.log(
    JSON.stringify({
      verdict: 'PASS',
      botName: name,
      assignment,
      toolInput: before.input,
      approvalButtons: before.buttons,
      reply,
      assignmentReport,
    }),
  );
} finally {
  await browser.close();
}
