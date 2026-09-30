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
let settled = false;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await new Promise((done) => setTimeout(done, 1000));
  const next = await rpc('profileActivity', { channelId });
  const idle = (await rpc('list')).bots.find((item) => item.slug === bot.slug)?.aggregateState;
  if (
    JSON.stringify(next.modelUsageRows) === JSON.stringify(activity.modelUsageRows) &&
    idle === 'idle'
  ) {
    activity = next;
    settled = true;
    break;
  }
  activity = next;
}
if (!settled) throw new Error('Bot did not become idle with stable reported usage');
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
  await page.setViewport({ width: 1500, height: 1280 });
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
  const coordinated = await page.$('.bh-usage-details');
  if (process.env.BH_E2E_EXPECT_COORDINATED && !coordinated)
    throw new Error('Coordinated charts not rendered');
  let presentation;
  const modelBuckets = new Map();
  if (coordinated) {
    const modelTotals = new Map();
    const [year, month, day] = activity.today.split('-').map(Number);
    const weekStartDate = new Date(year, month - 1, day - 6);
    const weekStart = `${weekStartDate.getFullYear()}-${`${weekStartDate.getMonth() + 1}`.padStart(2, '0')}-${`${weekStartDate.getDate()}`.padStart(2, '0')}`;
    for (const row of rows.filter((row) => row.day >= weekStart && row.day <= activity.today)) {
      const name = row.model;
      modelTotals.set(name, (modelTotals.get(name) ?? 0) + row.totalTokens);
      const aggregate = modelBuckets.get(name) ?? { input: 0, cache: 0, output: 0, total: 0 };
      aggregate.input += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
      aggregate.cache += row.cacheReadTokens;
      aggregate.output += row.outputTokens;
      aggregate.total += row.totalTokens;
      modelBuckets.set(name, aggregate);
    }
    presentation = await page.$eval('.bh-model-usage', (element) => ({
      collapsed: !element.querySelector('details').open,
      charts: element.querySelectorAll('.bh-profile-bar-chart').length,
      preset: element.querySelector('select').value,
      grouping: element.querySelector('.bh-usage-grouping [aria-pressed="true"]').dataset.group,
      models: [...element.querySelectorAll('.bh-usage-model-label')].map((row) => ({
        label: row.querySelector('span').getAttribute('title'),
        total: row.querySelector('strong').textContent,
        hasMeasures: row.querySelector('.bh-usage-measures') !== null,
        height: row.getBoundingClientRect().height,
        oneLine:
          Math.abs(
            row.querySelector('span').getBoundingClientRect().top -
              row.querySelector('strong').getBoundingClientRect().top,
          ) < 4,
      })),
      caches: [...element.querySelectorAll('.bh-usage-cache-label')].map((row) => ({
        label: row.querySelector('span').getAttribute('title'),
        ratio: row.querySelector('strong').textContent,
      })),
      hasRoles: /Orchestrator|Assignment|DSH (子代理|Subagent)/u.test(element.textContent),
    }));
    if (
      !presentation.collapsed ||
      presentation.charts !== 3 ||
      presentation.preset !== '7' ||
      presentation.grouping !== 'model' ||
      presentation.hasRoles
    )
      throw new Error('The default usage overview does not hide execution details');
    if (
      presentation.models.length !== modelTotals.size ||
      presentation.models.some(
        (row) => row.total.replace(/[^0-9]/gu, '') !== String(modelTotals.get(row.label.trim())),
      )
    )
      throw new Error('Overview model totals do not merge execution roles correctly');
    for (const row of presentation.models) {
      const reported = modelBuckets.get(row.label);
      const percent = (part, total) =>
        `${((part / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
      if (row.hasMeasures || !row.oneLine || row.height > 40)
        throw new Error('Model usage rows are not compact single-line summaries');
      if (
        presentation.caches.find((entry) => entry.label === row.label)?.ratio !==
        percent(reported.cache, reported.input)
      )
        throw new Error('Cache ratio does not agree with the model usage chart');
    }
    presentation.compactRows = true;
    await page.$eval('.bh-usage-details summary', (element) => element.focus());
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-model-usage-route');
  }
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
  if (coordinated) {
    await page.$eval('.bh-usage-details summary', (element) => element.click());
    await page.waitForFunction(() => !document.querySelector('.bh-usage-details').open);
  }
  await page.evaluate(() => {
    document.activeElement?.blur();
    document.body.removeAttribute('data-ds-dark-theme');
    document
      .querySelector('.bh-model-usage')
      ?.closest('.bh-profile-card')
      ?.scrollIntoView({ block: 'center' });
  });
  await page.screenshot({ path: screenshot });
  if (coordinated) {
    await page.evaluate(() =>
      document.querySelector('.bh-usage-cache')?.scrollIntoView({ block: 'center' }),
    );
    const points = await page.$$('.bh-usage-cache svg circle');
    if (points.length !== presentation.models.length)
      throw new Error('Cache-ratio points not rendered');
    for (const [index, model] of presentation.models.entries()) {
      const value = modelBuckets.get(model.label);
      const percent = (part, total) =>
        `${((part / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
      await points[index].hover();
      const expected = [
        value.input.toLocaleString(),
        `${value.cache.toLocaleString()} · ${percent(value.cache, value.input)}`,
        `${value.output.toLocaleString()} · ${percent(value.output, value.total)}`,
      ];
      await page.waitForFunction(
        (label, expected) => {
          const tip = document.querySelector('.bh-profile-chart-tip');
          return (
            tip?.querySelector('strong')?.textContent === label &&
            JSON.stringify(
              [...tip.querySelectorAll('.bh-usage-measures dd')].map((item) => item.textContent),
            ) === JSON.stringify(expected)
          );
        },
        {},
        model.label,
        expected,
      );
    }
    await points[0].hover();
    await page.waitForFunction(
      (label) => document.querySelector('.bh-profile-chart-tip strong')?.textContent === label,
      {},
      presentation.models[0].label,
    );
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-cache.png') });
    presentation.perModelShares = true;
    await page.mouse.move(0, 0);
    await page.evaluate(() =>
      document
        .querySelector('.bh-model-usage')
        ?.closest('.bh-profile-card')
        ?.scrollIntoView({ block: 'center' }),
    );
    const bars = await page.$$('.bh-usage-models svg rect');
    let hoveredModel = false;
    for (const bar of bars) {
      const bounds = await bar.boundingBox();
      if (!bounds || bounds.width < 2 || bounds.height < 2) continue;
      await bar.hover();
      const label = presentation.models[0].label;
      await page.waitForFunction(
        (label) => document.querySelector('.bh-profile-chart-tip strong')?.textContent === label,
        {},
        label,
      );
      const value = modelBuckets.get(label);
      const measures = await page.$$eval('.bh-profile-chart-tip .bh-usage-measures dd', (items) =>
        items.map((item) => item.textContent),
      );
      const percent = (part, total) =>
        `${((part / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
      const expected = [
        value.input.toLocaleString(),
        `${value.cache.toLocaleString()} · ${percent(value.cache, value.input)}`,
        `${value.output.toLocaleString()} · ${percent(value.output, value.total)}`,
      ];
      if (JSON.stringify(measures) !== JSON.stringify(expected))
        throw new Error('Model bar hover differs from actual usage');
      await page.screenshot({ path: screenshot.replace(/\.png$/u, '-tooltip.png') });
      await page.mouse.move(0, 0);
      hoveredModel = true;
      break;
    }
    if (!hoveredModel) throw new Error('Model usage bars are not hoverable');
    presentation.modelTooltip = true;
    presentation.cacheTooltip = true;
    await page.$eval('.bh-usage-grouping [data-group="provider"]', (element) => element.focus());
    await page.keyboard.press('Space');
    await page.waitForFunction(
      () =>
        document
          .querySelector('.bh-usage-grouping [data-group="provider"]')
          .getAttribute('aria-pressed') === 'true',
    );
    const providers = await page.$$eval('.bh-usage-model-label', (labels) =>
      labels.map((element) => ({
        label: element.querySelector('span').getAttribute('title'),
        total: element.querySelector('strong').textContent,
        hasMeasures: element.querySelector('.bh-usage-measures') !== null,
        height: element.getBoundingClientRect().height,
      })),
    );
    const expectedProviders = new Map();
    const [year, month, day] = activity.today.split('-').map(Number);
    const week = new Date(year, month - 1, day - 6);
    const start = `${week.getFullYear()}-${`${week.getMonth() + 1}`.padStart(2, '0')}-${`${week.getDate()}`.padStart(2, '0')}`;
    for (const row of rows.filter((row) => row.day >= start && row.day <= activity.today)) {
      const value = expectedProviders.get(row.provider) ?? {
        total: 0,
        input: 0,
        cache: 0,
        output: 0,
      };
      value.total += row.totalTokens;
      value.input += row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
      value.cache += row.cacheReadTokens;
      value.output += row.outputTokens;
      expectedProviders.set(row.provider, value);
    }
    if (providers.length !== expectedProviders.size)
      throw new Error('Provider grouping did not merge its models');
    for (const row of providers) {
      const value = expectedProviders.get(row.label);
      if (
        row.total.replace(/[^0-9]/gu, '') !== String(value.total) ||
        row.hasMeasures ||
        row.height > 40
      )
        throw new Error(
          'Provider totals or weighted percentages differ from the same actual calls',
        );
    }
    const providerText = await page.$eval('.bh-model-usage', (element) => element.textContent);
    if (presentation.models.some((entry) => providerText.includes(entry.label)))
      throw new Error('Provider view nests individual model labels');
    await page.evaluate(() => {
      document.activeElement?.blur();
      document
        .querySelector('.bh-model-usage')
        ?.closest('.bh-profile-card')
        ?.scrollIntoView({ block: 'center' });
    });
    const providerPoint = await page.$('.bh-usage-cache svg circle');
    if (!providerPoint) throw new Error('Provider cache point is missing');
    await providerPoint.hover();
    const providerValue = expectedProviders.get(providers[0].label);
    const percent = (part, total) =>
      `${((part / total) * 100).toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    const providerMeasures = [
      providerValue.input.toLocaleString(),
      `${providerValue.cache.toLocaleString()} · ${percent(providerValue.cache, providerValue.input)}`,
      `${providerValue.output.toLocaleString()} · ${percent(providerValue.output, providerValue.total)}`,
    ];
    await page.waitForFunction(
      (label, expected) => {
        const tip = document.querySelector('.bh-profile-chart-tip');
        return (
          tip?.querySelector('strong')?.textContent === label &&
          JSON.stringify(
            [...tip.querySelectorAll('.bh-usage-measures dd')].map((item) => item.textContent),
          ) === JSON.stringify(expected)
        );
      },
      {},
      providers[0].label,
      providerMeasures,
    );
    presentation.providerTooltip = true;
    await page.mouse.move(0, 0);
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-provider.png') });
    await page.$eval('.bh-usage-grouping [data-group="model"]', (element) => element.click());
    await page.waitForFunction(
      () =>
        document
          .querySelector('.bh-usage-grouping [data-group="model"]')
          .getAttribute('aria-pressed') === 'true',
    );
    await page.evaluate(() => document.activeElement?.blur());
    presentation.providers = providers;
    presentation.groupSwitch = true;
  }
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
  if (coordinated) {
    await page.$eval('.bh-usage-details summary', (element) => element.click());
    await page.waitForSelector('.bh-model-usage-route');
    await page.evaluate(() =>
      document
        .querySelector('.bh-model-usage')
        ?.closest('.bh-profile-card')
        ?.scrollIntoView({ block: 'start' }),
    );
    await page.evaluate(() => {
      const view = document.querySelector('.bh-profile-view');
      view.scrollTop = Math.max(0, view.scrollTop - 80);
    });
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-details.png') });
    await page.select('.bh-model-usage select', '1');
    const todayTotal = await page.$eval(
      '.bh-model-usage .bh-profile-card-total',
      (element) => element.textContent,
    );
    if (
      !todayTotal.includes(
        rows
          .filter((row) => row.day === activity.today)
          .reduce((sum, row) => sum + row.totalTokens, 0)
          .toLocaleString(),
      )
    )
      throw new Error('Today did not preserve the real fixture total');
    await page.select('.bh-model-usage select', 'custom');
    const recordedDays = new Set(rows.map((row) => row.day));
    let emptyDay = await page.$eval('.bh-model-usage-range input', (element) => element.min);
    while (recordedDays.has(emptyDay) && emptyDay <= activity.today) {
      const [year, month, day] = emptyDay.split('-').map(Number);
      const next = new Date(year, month - 1, day + 1);
      emptyDay = `${next.getFullYear()}-${`${next.getMonth() + 1}`.padStart(2, '0')}-${`${next.getDate()}`.padStart(2, '0')}`;
    }
    if (emptyDay <= activity.today) {
      await page.$$eval(
        '.bh-model-usage-range input',
        (inputs, day) => {
          for (const input of inputs) {
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(
              input,
              day,
            );
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
        },
        emptyDay,
      );
      await page.waitForSelector('.bh-model-usage .bh-profile-empty');
      if (await page.$('.bh-model-usage .bh-profile-bar-chart'))
        throw new Error('Empty range left stale charts');
      await page.screenshot({ path: screenshot.replace(/\.png$/u, '-empty.png') });
      presentation.emptyRange = true;
    }
    await page.select('.bh-model-usage select', '182');
    await page.waitForSelector('.bh-usage-model-label');
    await page.select('.bh-model-usage select', '7');
    await page.setViewport({ width: 1040, height: 1280 });
    await page.evaluate(() =>
      document
        .querySelector('.bh-model-usage')
        ?.closest('.bh-profile-card')
        ?.scrollIntoView({ block: 'start' }),
    );
    await page.evaluate(() => {
      const view = document.querySelector('.bh-profile-view');
      view.scrollTop = Math.max(0, view.scrollTop - 80);
    });
    await page.screenshot({ path: screenshot.replace(/\.png$/u, '-narrow.png') });
    const overflow = await page.$eval(
      '.bh-model-usage',
      (element) => element.scrollWidth > element.clientWidth + 1,
    );
    if (overflow) throw new Error('The narrow Profile overflows');
    presentation.rangeSwitch = true;
    presentation.keyboardDetails = true;
    presentation.narrowNoOverflow = true;
  }
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
      presentation,
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
