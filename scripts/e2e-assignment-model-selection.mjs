import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
if (!origin || !home || !screenshot) {
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];

async function rpc(method, args = {}) {
  const endpoint = method.includes('/') ? method : `botharness/${method}`;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `assignment-model-${Date.now()}-${Math.random()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const body = await response.text();
  let envelope;
  try {
    envelope = JSON.parse(body);
  } catch {
    throw new Error(`${endpoint}: ${response.status} ${body.slice(0, 300)}`);
  }
  if (response.status !== 200 || envelope.result?.ok !== true) {
    throw new Error(`${endpoint}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  }
  return envelope.result.value;
}

async function waitForAssignment(slug, key) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const assignments = (await rpc('assignments', { slug })).assignments;
    const selected = assignments.find((item) => item.continuityKey === key);
    if (selected) return selected;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out waiting for Assignment ${key}`);
}

async function waitForReply(channelId, count) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    const replies = messages.filter((message) => message.author?.kind === 'bot');
    if (replies.length >= count) return replies;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out waiting for ${count} Bot replies`);
}

async function waitForSessionRoute(sessionId, route) {
  const projections = resolve(home, 'storages/session_projcache/sessions');
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const path = resolve(projections, `${sessionId}.json`);
    const session = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')).record : undefined;
    const used = session?.rows?.modelSelection?.val?.lastUsed;
    if (
      used?.provider === route.provider &&
      used?.model === route.model &&
      used?.reasoningEffort === route.reasoningEffort
    )
      return used;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`DSH Session ${sessionId} did not record ${JSON.stringify(route)}`);
}

async function approvePwdCalls(slug, sessionIds, workspacePath) {
  const pending = new Set(sessionIds);
  for (let attempt = 0; attempt < 120 && pending.size > 0; attempt += 1) {
    const messages = (await rpc('channelMessages', { channelId: `dm-${slug}` })).messages;
    for (const message of messages) {
      const request = message.toolApprovalRequest;
      if (request === undefined || !pending.has(request.sessionId)) continue;
      if (
        request.role !== 'assignment' ||
        request.toolName !== 'bash' ||
        request.cwd !== workspacePath ||
        JSON.parse(request.input).command !== 'pwd'
      )
        throw new Error(`Unexpected QA tool approval: ${message.id}`);
      const result = await rpc('toolApprovalDecide', {
        channelId: `dm-${slug}`,
        messageId: message.id,
        outcome: 'allowed-once',
      });
      if (result.accepted !== true) throw new Error(`QA tool approval was not accepted`);
      pending.delete(request.sessionId);
    }
    if (pending.size > 0) await new Promise((done) => setTimeout(done, 1000));
  }
  if (pending.size > 0) throw new Error(`Timed out waiting for QA pwd approval requests`);
}

async function waitForCompletedAssignments(slug, sessionIds, workspacePath) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const assignments = (await rpc('assignments', { slug })).assignments;
    const completed = sessionIds.map((id) => assignments.find((item) => item.sessionId === id));
    if (
      completed.every(
        (item) =>
          item?.activity === 'idle' &&
          item.latestReport?.state === 'completed' &&
          item.latestReport.summary.includes(workspacePath),
      )
    )
      return completed;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out waiting for real Assignment reports`);
}

const models = (await rpc('modelCatalog')).models;
const flash = models.find(
  (entry) =>
    entry.efforts.some((effort) => effort.id === 'high') &&
    entry.efforts.some((effort) => effort.id === 'low'),
);
const pro = models.find(
  (entry) => entry.model !== flash?.model && entry.efforts.some((effort) => effort.id === 'off'),
);
if (!flash || !pro) throw new Error('Live DSH catalog lacks the required routes');
const flashRoute = { provider: flash.provider, model: flash.model, reasoningEffort: 'low' };
const proRoute = { provider: pro.provider, model: pro.model, reasoningEffort: 'off' };
const stamp = Date.now();
const name = `Assignment model QA ${stamp}`;
const preset = (
  await rpc('modelPresetCreate', {
    name: `Assignment models ${stamp}`,
    orchestrator: flashRoute,
    assignmentDefault: proRoute,
  })
).preset;
const bot = (await rpc('create', { displayName: name })).bot;
await rpc('channelDm', { slug: bot.slug, displayName: name });
await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
const plan = (
  await rpc('modelPlanAssignmentsSet', {
    slug: bot.slug,
    expectedRevision: 1,
    assignmentDefault: proRoute,
    assignmentModels: [
      { provider: pro.provider, model: pro.model, allowedEfforts: ['off'], defaultEffort: 'off' },
      {
        provider: flash.provider,
        model: flash.model,
        allowedEfforts: ['low', 'high'],
        defaultEffort: 'low',
      },
    ],
  })
).plan;
if (plan.revision !== 2 || plan.assignmentModels?.length !== 2) {
  throw new Error(`Assignment model plan was not saved: ${JSON.stringify(plan)}`);
}
const workspacePath = `/tmp/bh504-workspace-${stamp}`;
mkdirSync(workspacePath, { recursive: true });
const workspace = await rpc('workspace/create', { request: { path: workspacePath } });
const grant = (
  await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
).grant;

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('Browser console:', message.text());
  });
  page.on('pageerror', (error) => console.log('Browser page error:', String(error)));
  await page.setViewport({ width: 1500, height: 1050 });
  await page.setExtraHTTPHeaders({ cookie });
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector(botButton, { timeout: 30000 });
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
        ?.click(),
    );
    try {
      await page.waitForSelector(botButton, { timeout: 30000 });
      if (!(await page.$('.bh-root'))) await page.click(botButton);
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') !== null ||
          Array.from(document.querySelectorAll('button')).some((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          ),
        { timeout: 30000 },
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          )
          ?.click(),
      );
      await page.waitForSelector('.bh-root', { timeout: 30000 });
      break;
    } catch (error) {
      await page.screenshot({ path: screenshot.replace(/\.png$/u, '-debug.png') });
      console.log(
        'Browser state:',
        (await page.evaluate(() => document.body.innerText)).slice(0, 1200),
      );
      console.log('Browser URL:', page.url());
      if (attempt === 2) throw error;
    }
  }
  await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(
    () => document.querySelector('.bh-channel-island')?.getAttribute('aria-haspopup') === 'dialog',
  );
  await page.click('.bh-channel-island');
  await page.waitForSelector('.bh-profile-expand');
  await page.click('.bh-profile-expand');
  await page.click('.bh-profile-view [aria-label="Model preset"] summary');
  await page.waitForSelector('.bh-model-preset-assignment');
  await page.$eval('.bh-model-preset-assignment', (element) =>
    element.scrollIntoView({ block: 'center' }),
  );
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-plan.png') });

  await page.click('.bh-profile-back');
  await rpc('channelSend', {
    channelId: `dm-${bot.slug}`,
    body: `For this QA, call list_workspace_grants and list_assignment_models. Then create_assignment using active grant ${grant.id}, continuity key qa-default-${stamp}, and OMIT provider, model, reasoning_effort so the Assignment uses the Human default. Its purpose: run pwd in its workspace, then report_to_orchestrator the exact path. After creating it, call channel_send here with the new Session id.`,
  });
  const first = await waitForAssignment(bot.slug, `qa-default-${stamp}`);
  if (JSON.stringify(first.modelRoute) !== JSON.stringify(proRoute)) {
    throw new Error(`Default Assignment route mismatch: ${JSON.stringify(first)}`);
  }
  const firstUsed = await waitForSessionRoute(first.sessionId, proRoute);
  await waitForReply(`dm-${bot.slug}`, 1);

  await rpc('channelSend', {
    channelId: `dm-${bot.slug}`,
    body: `For the second independent QA Assignment, call list_assignment_models, then create_assignment with active grant ${grant.id}, continuity key qa-explicit-${stamp}, exact provider ${flash.provider}, exact model ${flash.model}, and reasoning_effort low. Its purpose: run pwd in its workspace, then report_to_orchestrator the exact path. After creating it, call channel_send here with its Session id.`,
  });
  const second = await waitForAssignment(bot.slug, `qa-explicit-${stamp}`);
  if (JSON.stringify(second.modelRoute) !== JSON.stringify(flashRoute)) {
    throw new Error(`Explicit Assignment route mismatch: ${JSON.stringify(second)}`);
  }
  const secondUsed = await waitForSessionRoute(second.sessionId, flashRoute);
  await waitForReply(`dm-${bot.slug}`, 2);
  await approvePwdCalls(bot.slug, [first.sessionId, second.sessionId], workspacePath);
  const completed = await waitForCompletedAssignments(
    bot.slug,
    [first.sessionId, second.sessionId],
    workspacePath,
  );
  let finalBody = '';
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const messages = (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages;
    const reports = messages.filter(
      (message) =>
        message.author?.kind === 'bot' &&
        message.body.includes(workspacePath) &&
        /reported|completed|QA result/iu.test(message.body) &&
        !/not reported|outstanding/iu.test(message.body),
    );
    const visible = completed.map((item) =>
      reports.find(
        (message) =>
          Date.parse(message.at) >= Date.parse(item.latestReport.at) &&
          message.body.includes(item.sessionId),
      ),
    );
    if (visible.every((message) => message !== undefined)) {
      finalBody = visible.sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0].body;
      break;
    }
    if (attempt === 119) throw new Error('Timed out waiting for the Orchestrator to relay reports');
    await new Promise((done) => setTimeout(done, 1000));
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForSelector('.bh-message-group', { timeout: 30000 });
  await page.waitForFunction(
    (body) => document.body.innerText.includes(body.slice(0, 40)),
    { timeout: 30000 },
    finalBody,
  );
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-assignments.png') });
  console.log(
    JSON.stringify({
      ok: true,
      name,
      slug: bot.slug,
      plan,
      grantId: grant.id,
      assignments: completed,
      dshLastUsed: [firstUsed, secondUsed],
      screenshots: [
        screenshot.replace(/\.png$/u, '-plan.png'),
        screenshot.replace(/\.png$/u, '-assignments.png'),
      ],
    }),
  );
} finally {
  await browser.close();
}
