import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
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
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `model-preset-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true) {
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  }
  return envelope.result.value;
}

const catalog = (await rpc('modelCatalog')).models;
const orchestrator = catalog.find((entry) => entry.efforts.some((effort) => effort.id === 'low'));
const assignment = catalog.find((entry) => entry.model !== orchestrator?.model) ?? orchestrator;
if (!orchestrator || !assignment) throw new Error('No suitable live model route');

const stamp = Date.now();
const name = `Model route QA ${stamp}`;
const bot = (await rpc('create', { displayName: name })).bot;
await rpc('channelDm', { slug: bot.slug, displayName: name });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('Browser console error:', message.text());
  });
  await page.setViewport({ width: 1500, height: 1050 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-root') !== null ||
      Array.from(document.querySelectorAll('button')).some((button) =>
        ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
      ),
    { timeout: 60000 },
  );
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''))
      ?.click(),
  );
  await page.waitForSelector('.bh-root', { timeout: 60000 });
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  console.log(
    'Visible channels:',
    await page.$$eval('[data-channel-id]', (items) =>
      items.map((item) => item.getAttribute('data-channel-id')),
    ),
  );
  await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForSelector('.bh-channel-island');
  await page.waitForFunction(
    () => document.querySelector('.bh-channel-island')?.getAttribute('aria-haspopup') === 'dialog',
  );
  await page.click('.bh-channel-island');
  await page.waitForSelector('.bh-profile-expand');
  await page.click('.bh-profile-expand');
  await page.waitForSelector('.bh-profile-view .bh-profile-policy-section details');
  await page.evaluate(() =>
    document.querySelector('.bh-profile-view .bh-profile-policy-section summary')?.click(),
  );
  await page.waitForSelector('.bh-model-preset-form input');
  await page.type('.bh-model-preset-form input', `QA route ${stamp}`);
  const selects = await page.$$('.bh-model-preset-form select');
  if (selects.length !== 4) throw new Error(`Expected four route selectors, got ${selects.length}`);
  await selects[0].select(String(catalog.indexOf(orchestrator)));
  await selects[1].select('low');
  await selects[2].select(String(catalog.indexOf(assignment)));
  const desiredAssignmentEffort =
    assignment.efforts.find((effort) => effort.id === 'off')?.id ?? '';
  await selects[3].select(desiredAssignmentEffort);
  await page.evaluate(() => document.querySelector('.bh-model-preset-form button')?.click());
  await page.waitForFunction(
    () => document.querySelector('.bh-model-preset-effective')?.textContent?.includes('low'),
    { timeout: 30000 },
  );
  const plan = (await rpc('modelPlan', { slug: bot.slug })).plan;
  if (
    plan?.orchestrator.provider !== orchestrator.provider ||
    plan.orchestrator.model !== orchestrator.model ||
    plan.orchestrator.reasoningEffort !== 'low' ||
    plan.assignmentDefault.model !== assignment.model ||
    plan.assignmentDefault.reasoningEffort !== desiredAssignmentEffort
  ) {
    throw new Error(`Unexpected saved plan: ${JSON.stringify(plan)}`);
  }
  await page.click('.bh-profile-view .bh-profile-policy-section summary');
  const collapsedScreenshot = screenshot.replace(/\.png$/u, '-collapsed.png');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-profile-view .bh-profile-policy-section details')?.open ===
        false &&
      document
        .querySelector('.bh-profile-view .bh-profile-policy-section summary')
        ?.textContent?.includes('Revision 1'),
  );
  await page.waitForFunction(
    () => !document.body.textContent?.includes('Unable to create default workspace'),
    { timeout: 15000 },
  );
  await page.screenshot({ path: collapsedScreenshot, fullPage: true });
  await page.click('.bh-profile-view .bh-profile-policy-section summary');
  await page.waitForSelector('.bh-model-preset-form input');
  await page.waitForFunction(
    (presetId) => document.querySelector('.bh-model-preset-apply select')?.value === presetId,
    { timeout: 30000 },
    plan.sourcePresetId,
  );
  await page.screenshot({ path: screenshot, fullPage: true });
  await rpc('channelSend', {
    channelId: `dm-${bot.slug}`,
    body: 'Call channel_send in this DM to reply with exactly this phrase: model route confirmed',
  });
  await page.waitForFunction(
    async (channelId) => {
      const response = await fetch('/api/botharness/channelMessages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `model-preset-reply-${Math.random()}`,
          method: 'botharness/channelMessages',
          payload: { args: { channelId } },
        }),
      });
      const envelope = await response.json();
      return envelope.result?.value?.messages?.some(
        (message) => message.author?.kind === 'bot' && message.body?.length > 0,
      );
    },
    { timeout: 180000, polling: 1000 },
    `dm-${bot.slug}`,
  );
  const reply = (await rpc('channelMessages', { channelId: `dm-${bot.slug}` })).messages.find(
    (message) => message.author?.kind === 'bot',
  );
  const projections = resolve(home, 'storages/session_projcache/sessions');
  let lastUsed;
  for (let attempt = 0; attempt < 30 && !lastUsed; attempt += 1) {
    const session = readdirSync(projections)
      .map((file) => JSON.parse(readFileSync(resolve(projections, file), 'utf8')).record)
      .find((record) => record.identity?.cwd?.includes(`/bots/${bot.slug}/memory`));
    lastUsed = session?.rows?.modelSelection?.val?.lastUsed;
    if (!lastUsed) await new Promise((done) => setTimeout(done, 1000));
  }
  if (
    lastUsed?.provider !== plan.orchestrator.provider ||
    lastUsed.model !== plan.orchestrator.model ||
    lastUsed.reasoningEffort !== plan.orchestrator.reasoningEffort
  ) {
    throw new Error(`DSH last-used model differs from the Bot plan: ${JSON.stringify(lastUsed)}`);
  }
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');
  await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(() => document.body.textContent?.includes('model route confirmed'), {
    timeout: 30000,
  });
  const replyScreenshot = screenshot.replace(/\.png$/u, '-reply.png');
  await page.screenshot({ path: replyScreenshot, fullPage: true });
  console.log(
    JSON.stringify({
      ok: true,
      bot: { slug: bot.slug, displayName: name },
      plan,
      reply: reply?.body,
      dshLastUsed: lastUsed,
      screenshot,
      collapsedScreenshot,
      replyScreenshot,
    }),
  );
} finally {
  await browser.close();
}
