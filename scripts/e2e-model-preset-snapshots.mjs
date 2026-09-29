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
      rpcId: `model-snapshots-${method}-${Date.now()}`,
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

if (process.env.BH_E2E_VERIFY_SLUG) {
  const slug = process.env.BH_E2E_VERIFY_SLUG;
  const firstSlug = process.env.BH_E2E_VERIFY_FIRST_SLUG;
  const presetId = process.env.BH_E2E_VERIFY_PRESET_ID;
  if (!firstSlug || !presetId) throw new Error('Set both verify slugs and preset ID');
  const [custom, first, saved] = await Promise.all([
    rpc('modelPlan', { slug }),
    rpc('modelPlan', { slug: firstSlug }),
    rpc('modelPresets'),
  ]);
  const preset = saved.presets.find((item) => item.id === presetId);
  if (
    custom.plan?.revision !== 3 ||
    custom.plan?.sourcePresetId !== '' ||
    custom.plan?.orchestrator.reasoningEffort !== 'high' ||
    first.plan?.revision !== 1 ||
    first.plan?.orchestrator.reasoningEffort !== 'high' ||
    preset?.revision !== 2 ||
    preset.orchestrator.reasoningEffort !== 'low'
  ) {
    throw new Error(
      `Snapshot data changed after restart: ${JSON.stringify({ custom, first, preset })}`,
    );
  }
  console.log(
    JSON.stringify({ ok: true, afterRestart: { custom: custom.plan, first: first.plan, preset } }),
  );
  process.exit(0);
}

async function waitForReply(channelId, count) {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const messages = (await rpc('channelMessages', { channelId })).messages;
    const replies = messages.filter((message) => message.author?.kind === 'bot');
    if (replies.length >= count) return replies;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out waiting for ${count} Bot replies in ${channelId}`);
}

async function waitForLastUsed(slug, effort) {
  const projections = resolve(home, 'storages/session_projcache/sessions');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const session = readdirSync(projections)
      .map((file) => JSON.parse(readFileSync(resolve(projections, file), 'utf8')).record)
      .find((record) => record.identity?.cwd?.includes(`/bots/${slug}/memory`));
    const lastUsed = session?.rows?.modelSelection?.val?.lastUsed;
    if (lastUsed?.reasoningEffort === effort) return lastUsed;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`DSH Session did not record effort ${effort} for ${slug}`);
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
if (!flash || !pro) throw new Error('Live DSH catalog lacks the required test routes');
const high = { provider: flash.provider, model: flash.model, reasoningEffort: 'high' };
const low = { provider: flash.provider, model: flash.model, reasoningEffort: 'low' };
const assignment = { provider: pro.provider, model: pro.model, reasoningEffort: 'off' };
const stamp = Date.now();
const highPreset = (
  await rpc('modelPresetCreate', {
    name: `High QA ${stamp}`,
    orchestrator: high,
    assignmentDefault: assignment,
  })
).preset;
const economyPreset = (
  await rpc('modelPresetCreate', {
    name: `Economy QA ${stamp}`,
    orchestrator: low,
    assignmentDefault: assignment,
  })
).preset;
const first = (await rpc('create', { displayName: `Snapshot first QA ${stamp}` })).bot;
const second = (await rpc('create', { displayName: `Snapshot second QA ${stamp}` })).bot;
for (const bot of [first, second]) {
  await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
}
await rpc('modelPresetApply', { slug: first.slug, presetId: highPreset.id });
await rpc('modelPresetApply', { slug: second.slug, presetId: economyPreset.id });

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error') console.log('Browser console error:', message.text());
  });
  await page.setViewport({ width: 1500, height: 1050 });
  await page.setExtraHTTPHeaders({ cookie });
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
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
      if (attempt === 2) throw error;
    }
  }

  async function capture(selector, suffix) {
    if (selector) {
      await page.$eval(selector, (element) => element.scrollIntoView({ block: 'center' }));
    }
    await page.waitForFunction(
      () => !document.body.textContent?.includes('Unable to create default workspace'),
      { timeout: 30000 },
    );
    const path = screenshot.replace(/\.png$/u, `-${suffix}.png`);
    await page.screenshot({ path });
    return path;
  }

  async function openProfile(slug) {
    const openSidebar = await page.$('button[aria-label="Open sidebar"]');
    if (openSidebar) await openSidebar.click();
    await page.waitForSelector(`.bh-root [data-channel-id="dm-${slug}"]`);
    await page.click(`.bh-root [data-channel-id="dm-${slug}"]`);
    await page.waitForFunction(
      () =>
        document.querySelector('.bh-channel-island')?.getAttribute('aria-haspopup') === 'dialog',
    );
    await page.click('.bh-channel-island');
    await page.waitForSelector('.bh-profile-expand');
    await page.click('.bh-profile-expand');
    await page.waitForSelector('.bh-model-preset-quick select');
  }

  async function expandModelDetails() {
    await page.click('.bh-profile-view [aria-label="Model preset"] summary');
    await page.waitForSelector('.bh-model-preset-form input');
  }

  await openProfile(first.slug);
  await expandModelDetails();
  await page.click('.bh-model-preset-edit-preset button');
  await page.waitForFunction(() =>
    document.querySelector('.bh-model-preset-form input')?.value?.startsWith('High QA'),
  );
  const formSelects = await page.$$('.bh-model-preset-form select');
  await formSelects[1].select('low');
  await page.click('.bh-model-preset-form button');
  await page.waitForFunction(() =>
    document.body.textContent?.includes('existing Bot snapshots are unchanged'),
  );
  const edited = (await rpc('modelPresets')).presets.find((preset) => preset.id === highPreset.id);
  const firstPlan = (await rpc('modelPlan', { slug: first.slug })).plan;
  if (
    edited?.revision !== 2 ||
    edited.orchestrator.reasoningEffort !== 'low' ||
    firstPlan?.revision !== 1 ||
    firstPlan.orchestrator.reasoningEffort !== 'high'
  ) {
    throw new Error(
      `Template edit changed an existing snapshot: ${JSON.stringify({ edited, firstPlan })}`,
    );
  }
  const templateScreenshot = await capture('.bh-model-preset-edit-preset', 'template');

  await openProfile(second.slug);
  await page.select('.bh-model-preset-quick select', highPreset.id);
  await page.click('.bh-model-preset-quick button');
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Model preset"] summary')
      ?.textContent?.includes('Revision 2'),
  );
  const switched = (await rpc('modelPlan', { slug: second.slug })).plan;
  if (
    switched?.sourcePresetId !== highPreset.id ||
    switched.revision !== 2 ||
    switched.orchestrator.reasoningEffort !== 'low'
  ) {
    throw new Error(`Quick switch used the wrong template revision: ${JSON.stringify(switched)}`);
  }
  const switchedScreenshot = await capture('.bh-model-preset-quick', 'switched');
  await page.click('.bh-profile-back');
  await rpc('channelSend', {
    channelId: `dm-${second.slug}`,
    body: 'Call channel_send in this DM to reply with exactly: first route confirmed',
  });
  await waitForReply(`dm-${second.slug}`, 1);
  const lowLastUsed = await waitForLastUsed(second.slug, 'low');

  await openProfile(second.slug);
  await expandModelDetails();
  const customSelects = await page.$$('.bh-model-preset-custom select');
  await customSelects[1].select('high');
  await page.click('.bh-model-preset-custom button');
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Model preset"] summary')
      ?.textContent?.includes('Custom snapshot'),
  );
  const custom = (await rpc('modelPlan', { slug: second.slug })).plan;
  if (
    custom?.sourcePresetId !== '' ||
    custom.revision !== 3 ||
    custom.orchestrator.reasoningEffort !== 'high' ||
    custom.assignmentDefault.model !== assignment.model ||
    (await rpc('modelPresets')).presets.find((preset) => preset.id === highPreset.id)?.orchestrator
      .reasoningEffort !== 'low'
  ) {
    throw new Error(
      `Custom edit changed the template or Assignment default: ${JSON.stringify(custom)}`,
    );
  }
  const customScreenshot = await capture('.bh-model-preset-custom', 'custom');
  await page.click('.bh-profile-back');
  await rpc('channelSend', {
    channelId: `dm-${second.slug}`,
    body: 'Call channel_send in this DM to reply with exactly: second route confirmed',
  });
  const replies = await waitForReply(`dm-${second.slug}`, 2);
  const highLastUsed = await waitForLastUsed(second.slug, 'high');
  const replyScreenshot = await capture(null, 'replies');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');
  await openProfile(second.slug);
  await page.waitForFunction(() =>
    document
      .querySelector('[aria-label="Model preset"] summary')
      ?.textContent?.includes('Revision 3'),
  );
  const refreshedScreenshot = await capture('.bh-model-preset-quick', 'refreshed');
  console.log(
    JSON.stringify({
      ok: true,
      first: { slug: first.slug, displayName: first.displayName, plan: firstPlan },
      second: { slug: second.slug, displayName: second.displayName, switched, custom },
      template: edited,
      replies: replies.map((reply) => reply.body),
      lowLastUsed,
      highLastUsed,
      screenshots: {
        templateScreenshot,
        switchedScreenshot,
        customScreenshot,
        replyScreenshot,
        refreshedScreenshot,
      },
    }),
  );
} finally {
  await browser.close();
}
