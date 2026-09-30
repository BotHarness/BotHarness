import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';
import { DatabaseSync } from 'node:sqlite';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const screenshot = process.env.BH_E2E_SCREENSHOT;
if (!origin || !home || !screenshot)
  throw new Error('Set BH_E2E_ORIGIN, BH_E2E_HOME and BH_E2E_SCREENSHOT');
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const endpoint = method.includes('/') ? method : `botharness/${method}`;
  const response = await fetch(`${origin}/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `usage-${Date.now()}-${Math.random()}`,
      method: endpoint,
      payload: { args },
    }),
  });
  const result = await response.json();
  if (response.status !== 200 || result.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(result.result?.error)}`);
  return result.result.value;
}
const models = (await rpc('modelCatalog')).models;
const flash = models.find((entry) => entry.efforts.some((effort) => effort.id === 'low'));
const pro = models.find(
  (entry) => entry.model !== flash?.model && entry.efforts.some((effort) => effort.id === 'off'),
);
if (!flash || !pro) throw new Error('Two live model routes required');
const route = { provider: flash.provider, model: flash.model, reasoningEffort: 'low' };
const assignmentRoute = { provider: pro.provider, model: pro.model, reasoningEffort: 'off' };
const bot = process.env.BH_E2E_BOT_SLUG
  ? (await rpc('get', { slug: process.env.BH_E2E_BOT_SLUG })).bot
  : (await rpc('create', { displayName: `Execution usage QA ${Date.now()}` })).bot;
const channelId = `dm-${bot.slug}`;
let key;
if (process.env.BH_E2E_BOT_SLUG) {
  key = (await rpc('assignments', { slug: bot.slug })).assignments.find((item) =>
    item.continuityKey.startsWith('usage-role-'),
  )?.continuityKey;
  if (!key) throw new Error('The existing fixture has no usage Assignment');
} else {
  await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: assignmentRoute,
    })
  ).preset;
  const applied = (await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id })).plan;
  await rpc('modelPlanAssignmentsSet', {
    slug: bot.slug,
    expectedRevision: applied.revision,
    assignmentDefault: assignmentRoute,
    assignmentModels: [route, assignmentRoute].map((item) => ({
      provider: item.provider,
      model: item.model,
      allowedEfforts: [item.reasoningEffort],
      defaultEffort: item.reasoningEffort,
    })),
  });
  const workspacePath = resolve(tmpdir(), `bh503-workspace-${Date.now()}`);
  mkdirSync(workspacePath, { recursive: true });
  const workspace = await rpc('workspace/create', { request: { path: workspacePath } });
  const grant = (
    await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspace.workspaceId })
  ).grant;
  key = `usage-role-${Date.now()}`;
  await rpc('channelSend', {
    channelId,
    body: `Create one Assignment with grant ${grant.id}, continuity key ${key}, using the default model. The Assignment purpose is: call bot_subagent with run_in_background false, description 'Usage accounting check', provider '${route.provider}', model '${route.model}', reasoning_effort 'low', prompt 'Reply exactly USAGE_CHILD_REAL. Do not call tools.' Then report_to_orchestrator state completed, summary 'USAGE_ASSIGNMENT_REAL' followed by the actual child result. After creating it, channel_send here with USAGE_ROLES_CONFIRMED. Do not use shell or browser tools.`,
  });
}
let activity;
let assignment;
let confirmed = false;
for (let attempt = 0; attempt < 240; attempt += 1) {
  const messages = (await rpc('channelMessages', { channelId })).messages;
  const failed = messages.find((message) => message.sessionFailure);
  if (failed) throw new Error(`Real request failed: ${failed.sessionFailure.code}`);
  assignment = (await rpc('assignments', { slug: bot.slug })).assignments.find(
    (item) => item.continuityKey === key,
  );
  activity = await rpc('profileActivity', { channelId });
  const roles = new Set(
    activity.modelUsageRows.filter((row) => row.totalTokens > 0).map((row) => row.purpose),
  );
  if (
    ['orchestrator', 'assignment', 'subagent'].every((role) => roles.has(role)) &&
    assignment?.activity === 'idle' &&
    assignment.latestReport?.summary?.includes('USAGE_CHILD_REAL') &&
    messages.some(
      (message) => message.author?.kind === 'bot' && message.body.includes('USAGE_ROLES_CONFIRMED'),
    )
  ) {
    confirmed = true;
    break;
  }
  await new Promise((done) => setTimeout(done, 1000));
}
if (!confirmed) throw new Error('Real Orchestrator, Assignment and child calls did not settle');
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((done) => setTimeout(done, 1000));
  const next = await rpc('profileActivity', { channelId });
  const idle = (await rpc('get', { slug: bot.slug })).bot.state;
  if (
    JSON.stringify(next.modelUsageRows) === JSON.stringify(activity.modelUsageRows) &&
    idle !== 'running'
  ) {
    activity = next;
    break;
  }
  activity = next;
}
const rows = activity.modelUsageRows;
for (const [purpose, expected] of [
  ['orchestrator', route],
  ['assignment', assignmentRoute],
  ['subagent', route],
]) {
  if (
    !rows.some(
      (row) =>
        row.purpose === purpose &&
        row.provider === expected.provider &&
        row.model === expected.model &&
        row.totalTokens > 0,
    )
  )
    throw new Error(`Wrong actual route for ${purpose}`);
}
if (rows.some((row) => row.provider === 'mixed' || row.model === 'mixed'))
  throw new Error('Mixed route bucket remains');
const localDay = (time) => {
  const date = new Date(time);
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`;
};
const sinceDay = localDay(activity.since);
const groupKey = (row) => JSON.stringify([row.day, row.purpose, row.provider, row.model]);
const tokenKeys = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];
function aggregate(target, row) {
  const key = groupKey(row);
  const total = target.get(key) ?? {
    day: row.day,
    purpose: row.purpose,
    provider: row.provider,
    model: row.model,
    ...Object.fromEntries([...tokenKeys, 'totalTokens'].map((key) => [key, 0])),
  };
  for (const key of [...tokenKeys, 'totalTokens']) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0)
      throw new Error('The live fixture has an unknown token bucket');
    total[key] += row[key];
  }
  target.set(key, total);
}
const expected = new Map();
for (const row of rows) aggregate(expected, row);
const database = new DatabaseSync(resolve(home, 'botharness/botharness.db'), { readOnly: true });
let owned;
try {
  owned = new Map(
    database
      .prepare('SELECT session_id, root_role, provenance FROM session_ownership WHERE bot_slug = ?')
      .all(bot.slug)
      .map((item) => [
        item.session_id,
        item.provenance === 'subagent' ? 'subagent' : item.root_role,
      ]),
  );
} finally {
  database.close();
}
function sessionFiles(path) {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const child = resolve(path, entry.name);
    return entry.isDirectory()
      ? sessionFiles(child)
      : entry.name === 'session.v4.jsonl.zstd'
        ? [child]
        : [];
  });
}
function nativeGroups() {
  const groups = new Map();
  for (const file of sessionFiles(resolve(home, 'sessions'))) {
    let bytes = readFileSync(file);
    const chunks = [];
    while (bytes.length > 0) {
      const frame = zstdDecompressSync(bytes, { info: true });
      if (!(frame.engine.bytesWritten > 0)) throw new Error('Invalid native Session log frame');
      chunks.push(frame.buffer);
      bytes = bytes.subarray(frame.engine.bytesWritten);
    }
    const events = Buffer.concat(chunks).toString('utf8').trim().split('\n').map(JSON.parse);
    const purpose = owned.get(events[0]?.id);
    if (!purpose) continue;
    const seen = new Set();
    let dispatch;
    for (const event of events.slice(1)) {
      if (event.type === 'request/header') dispatch = event.data.header.config;
      if (event.type === 'request/context') dispatch = event.data;
      if (!['assistant/message', 'assistant/attempt'].includes(event.type)) continue;
      if (event.surfaceOp !== undefined && event.surfaceOp !== 'append') continue;
      if (seen.has(event.seq)) continue;
      seen.add(event.seq);
      const day = localDay(event.time);
      if (day < sinceDay) continue;
      const actual = event.data.message?.source ?? dispatch;
      const report =
        event.data.usage ??
        event.data.stream?.findLast((entry) => entry.chunk?.type === 'usage')?.chunk.usage;
      if (!actual?.provider || !actual.model || !report)
        throw new Error('The live fixture has an unknown native route or usage');
      const buckets = Object.fromEntries(tokenKeys.map((key) => [key, report[key]]));
      aggregate(groups, {
        day,
        purpose,
        provider: actual.provider,
        model: actual.model,
        ...buckets,
        totalTokens: report.totalTokens ?? tokenKeys.reduce((sum, key) => sum + buckets[key], 0),
      });
    }
  }
  return groups;
}
let native;
let matched = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  const actual = nativeGroups();
  native = [...actual.values()];
  if (
    actual.size === expected.size &&
    [...expected].every(([key, row]) =>
      [...tokenKeys, 'totalTokens'].every((bucket) => actual.get(key)?.[bucket] === row[bucket]),
    )
  ) {
    matched = true;
    break;
  }
  await new Promise((done) => setTimeout(done, 1000));
}
if (!matched) throw new Error('Native daily role/provider/model usage differs from Profile');
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!pdir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
mkdirSync(dirname(screenshot), { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1050 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.setExtraHTTPHeaders({ cookie });
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
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
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"], button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') ||
          Array.from(document.querySelectorAll('button')).some((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          ),
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((button) =>
            ['Configure later', '稍后配置'].includes(button.textContent?.trim() ?? ''),
          )
          ?.click(),
      );
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      break;
    } catch (failure) {
      if (attempt === 2) throw failure;
    }
  }
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-channel-island[aria-haspopup="dialog"]');
  await page.click('.bh-channel-island');
  await page.waitForSelector('.bh-profile-expand');
  await page.$eval('.bh-profile-expand', (button) => button.click());
  await page.waitForSelector('.bh-profile-view');
  await page.waitForFunction(
    (name) =>
      document.querySelector('.bh-profile-view .bh-model-usage')?.textContent?.includes(name),
    {},
    route.model,
  );
  const text = await page.$eval(
    '.bh-profile-view .bh-model-usage',
    (element) => element.textContent,
  );
  if (
    !text.includes(assignmentRoute.model) ||
    !text.includes('Orchestrator') ||
    !text.includes('Assignment') ||
    !/DSH (子代理|Subagent)/u.test(text)
  )
    throw new Error('Profile role and model breakdown not rendered');
  await page.evaluate(() =>
    document.querySelector('.bh-model-usage')?.scrollIntoView({ block: 'center' }),
  );
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await page.screenshot({ path: screenshot });
  const measured = await page.$eval('.bh-profile-view', (element) => ({
    width: element.getBoundingClientRect().width,
    padding: getComputedStyle(element).paddingInline,
  }));
  const light = await page.$eval('.bh-model-usage', (element) => getComputedStyle(element).color);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  );
  const dark = await page.$eval('.bh-model-usage', (element) => getComputedStyle(element).color);
  if (dark === light) throw new Error('Native theme did not change');
  await page.screenshot({ path: screenshot.replace(/\.png$/u, '-dark.png') });
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const refreshed = await rpc('profileActivity', { channelId });
  if (JSON.stringify(refreshed.modelUsageRows) !== JSON.stringify(activity.modelUsageRows))
    throw new Error('Refresh changed observed usage');
  console.log(
    JSON.stringify({
      ok: true,
      bot: { slug: bot.slug, displayName: bot.displayName },
      rows,
      native,
      measured,
      screenshot,
    }),
  );
} catch (error) {
  const page = (await browser.pages()).at(-1);
  if (page) {
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-failure.png') });
  }
  throw error;
} finally {
  await browser.close();
}
