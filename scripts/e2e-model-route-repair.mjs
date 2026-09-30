import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
if (!origin || !home || !screenshot)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  resolve(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
  'utf8',
).split(';')[0];

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `repair-${Date.now()}-${Math.random()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const body = await response.json();
  if (response.status !== 200 || body.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(body.result?.error)}`);
  return body.result.value;
}

async function until(label, read, match, attempts = 120) {
  for (let index = 0; index < attempts; index += 1) {
    const value = await read();
    if (match(value)) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw new Error(`Timed out: ${label}`);
}

function usedBy(slug) {
  const directory = resolve(home, 'storages/session_projcache/sessions');
  if (!existsSync(directory)) return undefined;
  return readdirSync(directory)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(resolve(directory, file), 'utf8')).record)
    .find((record) => record.identity?.cwd?.replaceAll('\\', '/').includes(`/bots/${slug}/memory`))
    ?.rows?.modelSelection?.val?.lastUsed;
}

const models = (await rpc('modelCatalog')).models;
const selected = models.find((entry) => entry.efforts.some((effort) => effort.id === 'low'));
if (!selected) throw new Error('Live catalog lacks a low-effort route');
const stamp = Date.now();
const unique = (
  await rpc('create', {
    displayName: `Legacy migration QA ${stamp}`,
    model: selected.model,
    preset: 'standard',
  })
).bot;
await rpc('channelDm', { slug: unique.slug, displayName: unique.displayName });
const migrated = (await rpc('modelPlan', { slug: unique.slug })).plan;
if (migrated?.orchestrator.provider !== selected.provider || migrated?.revision !== 1)
  throw new Error('Unique legacy model did not migrate');
const uniqueRecord = (await rpc('get', { slug: unique.slug })).bot;
if (uniqueRecord.preset !== 'standard' || uniqueRecord.model !== undefined)
  throw new Error('Migration changed Agent preset or retained legacy override');

const name = `Model repair QA ${stamp}`;
const bot = (
  await rpc('create', { displayName: name, model: 'missing-legacy-qa', preset: 'standard' })
).bot;
await rpc('channelDm', { slug: bot.slug, displayName: name });
const broken = await rpc('modelPlan', { slug: bot.slug });
if (broken.repair?.code !== 'legacy-missing' || broken.plan !== undefined)
  throw new Error('Missing legacy model did not require Human selection');
await rpc('channelSend', {
  channelId: `dm-${bot.slug}`,
  body: 'Please reply with MODEL_ROUTE_SHOULD_NOT_RUN.',
});
const blocked = await until(
  'repairable failure in DM',
  () => rpc('channelMessages', { channelId: `dm-${bot.slug}` }),
  (value) => value.messages.some((message) => message.body.includes('select a Model Preset')),
);
if (
  usedBy(bot.slug) !== undefined ||
  blocked.messages.some(
    (message) => message.author?.kind === 'bot' && message.sessionFailure === undefined,
  )
)
  throw new Error('Unresolved legacy selection dispatched a model request');

mkdirSync(dirname(screenshot), { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });
  await page.setExtraHTTPHeaders({ cookie });
  const mode = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  async function enter() {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.goto(origin, { waitUntil: 'domcontentloaded' });
        await page.waitForSelector(mode, { timeout: 30000 });
        await page
          .waitForFunction(
            () =>
              Array.from(document.querySelectorAll('button')).some((button) =>
                ['Continue', '继续'].includes(button.textContent?.trim() ?? ''),
              ),
            { timeout: 3000 },
          )
          .catch(() => undefined);
        await page.evaluate(() =>
          Array.from(document.querySelectorAll('button'))
            .find((button) => ['Continue', '继续'].includes(button.textContent?.trim() ?? ''))
            ?.click(),
        );
        if (!(await page.$('.bh-root'))) await page.click(mode);
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
        await page.waitForSelector(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
        await page.click(`.bh-root [data-channel-id="dm-${bot.slug}"]`);
        return;
      } catch (failure) {
        if (attempt === 2) throw failure;
      }
    }
  }
  async function profile() {
    await page.waitForFunction(
      () =>
        document.querySelector('.bh-channel-island')?.getAttribute('aria-haspopup') === 'dialog',
    );
    await page.click('.bh-channel-island');
    await page.waitForSelector('.bh-profile-expand');
    await page.click('.bh-profile-expand');
    await page.waitForSelector('.bh-profile-view .bh-profile-policy-section');
    await page.evaluate(() =>
      document
        .querySelector('.bh-profile-view .bh-profile-policy-section')
        ?.scrollIntoView({ block: 'start' }),
    );
  }
  await enter();
  await profile();
  await page.waitForFunction(() =>
    document
      .querySelector('.bh-profile-view [role="alert"]')
      ?.textContent?.includes('missing-legacy-qa'),
  );
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-blocked.png') });
  await page.click('.bh-profile-view .bh-profile-policy-section summary');
  await page.waitForSelector('.bh-model-preset-form input');
  await page.type('.bh-model-preset-form input', `Repaired route ${stamp}`);
  const selects = await page.$$('.bh-model-preset-form select');
  await selects[0].select(String(models.indexOf(selected)));
  await page.waitForFunction(() =>
    document
      .querySelectorAll('.bh-model-preset-form select')[1]
      ?.querySelector('option[value="low"]'),
  );
  await selects[1].select('low');
  await selects[2].select(String(models.indexOf(selected)));
  await selects[3].select('low');
  await page.click('.bh-model-preset-form button');
  await page.waitForFunction(() =>
    document.querySelector('.bh-model-preset-effective')?.textContent?.includes('low'),
  );
  const repaired = await rpc('modelPlan', { slug: bot.slug });
  if (repaired.repair !== undefined || repaired.plan?.orchestrator.reasoningEffort !== 'low')
    throw new Error('Profile repair did not save valid snapshot');
  await page.evaluate(() =>
    document.querySelector('.bh-model-preset-effective')?.scrollIntoView({ block: 'center' }),
  );
  await page.screenshot({ path: screenshot });
  await rpc('channelSend', {
    channelId: `dm-${bot.slug}`,
    body: 'Call channel_send in this DM with exactly MODEL_ROUTE_REPAIRED. Do not do anything else.',
  });
  const messages = await until(
    'real repaired reply',
    () => rpc('channelMessages', { channelId: `dm-${bot.slug}` }),
    (value) =>
      value.messages.some(
        (message) =>
          message.author?.kind === 'bot' && message.body.includes('MODEL_ROUTE_REPAIRED'),
      ),
    180,
  );
  const actual = await until(
    'exact DSH route',
    async () => usedBy(bot.slug),
    (value) =>
      value?.provider === selected.provider &&
      value?.model === selected.model &&
      value?.reasoningEffort === 'low',
    30,
  );
  await enter();
  await page.waitForFunction(() => document.body.innerText.includes('MODEL_ROUTE_REPAIRED'));
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-reply.png') });
  await profile();
  await page.waitForFunction(() =>
    document.querySelector('.bh-profile-policy-section summary')?.textContent?.includes('low'),
  );
  if ((await rpc('modelPlan', { slug: bot.slug })).repair !== undefined)
    throw new Error('Refresh restored repair state');
  console.log(
    JSON.stringify({
      ok: true,
      bot: { slug: bot.slug, displayName: name },
      unique: { slug: unique.slug, plan: migrated, preset: uniqueRecord.preset },
      repaired: repaired.plan,
      actual,
      reply: messages.messages.find((message) => message.author?.kind === 'bot')?.body,
      screenshot,
    }),
  );
} catch (error) {
  const pages = await browser.pages();
  const page = pages.at(-1);
  if (page) {
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-debug.png') });
    console.log((await page.evaluate(() => document.body.innerText)).slice(-2500));
  }
  throw error;
} finally {
  await browser.close();
}
