import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const endpoint = `botharness/${method}`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(`${origin}/api/${endpoint}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `activity-${Math.random()}`,
          method: endpoint,
          payload: { args },
        }),
      });
      break;
    } catch (error) {
      if (
        !['list', 'channelMessages', 'modelCatalog', 'rosterGet'].includes(method) ||
        attempt === 2
      )
        throw error;
      await new Promise((done) => setTimeout(done, 200));
    }
  }
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
const models = (await rpc('modelCatalog')).models;
const model = models.find(
  (e) =>
    e.model.includes(process.env.BH_E2E_MODEL ?? 'flash') &&
    e.efforts.some((x) => x.id === (process.env.BH_E2E_EFFORT ?? 'low')),
);
assert.ok(model);
const route = {
  provider: model.provider,
  model: model.model,
  reasoningEffort: process.env.BH_E2E_EFFORT ?? 'low',
};
const bot = process.env.BH_E2E_RECONNECT_BOT
  ? (await rpc('list')).bots.find((bot) => bot.slug === process.env.BH_E2E_RECONNECT_BOT)
  : (
      await rpc('create', {
        displayName: process.env.BH_E2E_NAME ?? `Tool activity QA ${Date.now()}`,
      })
    ).bot;
assert.ok(bot);
const channelId = `dm-${bot.slug}`;
const layout = process.env.BH_E2E_LAYOUT ?? 'row';
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
if (!process.env.BH_E2E_RECONNECT_BOT) {
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
}
if (layout === 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: roster.pins.filter((id) => id !== channelId) });
}
if (layout !== 'row') {
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...roster.pins, channelId] });
}
const pnpm = resolve('node_modules/.pnpm'),
  pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
const wsdir = readdirSync(pnpm).find((e) => e.startsWith('ws@'));
const WebSocket = createRequire(resolve(pnpm, wsdir, 'node_modules/'))('ws');
async function nativeSnapshot(sessionId) {
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/remote.mux`, {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Native Session snapshot timeout')), 10000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'error') {
          clearTimeout(timer);
          reject(Error(JSON.stringify(frame.error)));
        }
        if (frame.type === 'item' && frame.value.type === 'snapshot') {
          clearTimeout(timer);
          done(frame.value);
        }
      });
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: 'session/follow',
          payload: {
            args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
          },
        }),
      );
    });
  } finally {
    socket.terminate();
  }
}

mkdirSync(evidence, { recursive: true });
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1180 });
await page.setExtraHTTPHeaders({ cookie });
async function screenshot(name) {
  await page.addStyleTag({
    content:
      '.bh-tool-approval-card > .bh-note:nth-child(3){font-size:0}.bh-tool-approval-card > .bh-note:nth-child(3)::after{content:"[machine-local QA directory redacted]";font-size:12px}',
  });
  await page.evaluate(() => {
    for (const pre of document.querySelectorAll('.bh-tool-approval-input')) {
      const input = JSON.parse(pre.textContent);
      if (input.workdir) input.workdir = '[machine-local QA directory redacted]';
      pre.textContent = JSON.stringify(input, null, 2);
    }
  });
  await page.screenshot({ path: resolve(evidence, name) });
}
const phase = process.env.BH_E2E_PHASE ?? 'after';
const snapshots = [];
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.eventSourceMessageReceived', (event) => {
  if (event.eventName !== 'activity/snapshot') return;
  const frame = JSON.parse(event.data);
  const item = frame.bots.find((b) => b.slug === bot.slug);
  if (item) snapshots.push({ generation: frame.generation, revision: frame.revision, ...item });
});
try {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await page.goto(origin, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            Array.from(document.querySelectorAll('button')).some((b) =>
              ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
            ),
          { timeout: 3000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      if (!(await page.$('.bh-composer-shell, .bh-main')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-main') ||
          Array.from(document.querySelectorAll('button')).some((b) =>
            ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
          ),
      );
      await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      await page.waitForSelector(`.bh-root [data-channel-id="${channelId}"]`);
      break;
    } catch (e) {
      if (attempt === 2) throw e;
    }
  }
  await page.click(`.bh-root [data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');

  const sent =
    process.env.BH_E2E_USE_PENDING === 'true'
      ? undefined
      : await rpc('channelSend', {
          channelId,
          body: 'Use the native Shell tool to run exactly node -e "setTimeout(() => {}, 2000)" once. This is a harmless two-second QA timer. Do not use any other tool except channel_send afterwards to send the exact phrase "Safe tool activity confirmed" in this DM. Do not delegate or modify any files.',
        });
  let pending;
  for (let i = 0; i < 1200; i++) {
    const list = (await rpc('channelMessages', { channelId })).messages;
    pending = list.find(
      (m) =>
        (sent === undefined || m.at >= sent.message.at) &&
        !list.some((decision) => decision.toolApprovalDecision?.requestMessageId === m.id) &&
        m.toolApprovalRequest &&
        JSON.parse(m.toolApprovalRequest.input).command === 'node -e "setTimeout(() => {}, 2000)"',
    );
    if (pending) break;
    await new Promise((done) => setTimeout(done, 200));
  }
  assert.ok(pending, 'Actual native Shell approval must be pending');
  await page.waitForFunction(
    (id) =>
      document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
      'working',
    {},
    channelId,
  );
  if (phase === 'after') {
    await page.waitForFunction(
      (id) =>
        document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.effect ===
          'executing' &&
        document.querySelector('.bh-composer-shell .bh-persona-avatar')?.dataset.effect ===
          'executing',
      {},
      channelId,
    );
  }
  const dom = await page.evaluate(
    (id) => ({
      sidebar: Array.from(
        document.querySelectorAll(`[data-channel-id="${id}"] .bh-persona-avatar`),
      ).map((e) => ({
        state: e.dataset.state,
        effect: e.dataset.effect,
        label: e.getAttribute('aria-label'),
      })),
      composer: Array.from(document.querySelectorAll('.bh-composer-shell .bh-persona-avatar')).map(
        (e) => ({
          state: e.dataset.state,
          effect: e.dataset.effect,
          label: e.getAttribute('aria-label'),
        }),
      ),
      summary: document.querySelector('.bh-composer-activity-summary')?.textContent,
    }),
    channelId,
  );
  await screenshot(`${phase}.png`);
  const layoutEvidence = [];
  const roster = await rpc('rosterGet');
  await rpc('pinsSet', { pins: [...new Set([...roster.pins, channelId])] });
  await page.waitForSelector(`.bh-pinned[data-channel-id="${channelId}"]`);
  await page.keyboard.press('Tab');
  await page.focus(`.bh-pinned[data-channel-id="${channelId}"]`);
  if (phase === 'after')
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll('[role="tooltip"]')).some((e) =>
        e.textContent.includes('bash'),
      ),
    );
  await screenshot(`${phase}-pinned.png`);
  layoutEvidence.push({
    layout: 'pinned',
    effect: await page.$eval(
      `.bh-pinned[data-channel-id="${channelId}"] .bh-persona-avatar`,
      (e) => e.dataset.effect,
    ),
  });
  await page.click('button[aria-label="收起侧边栏"],button[aria-label="Collapse sidebar"]');
  await page.waitForSelector('.bh-region-rail');
  const rail = `.bh-rail-channel[aria-label="${bot.displayName}"]`;
  await page.hover(rail);
  await page.waitForSelector('.bh-rail-preview');
  await screenshot(`${phase}-rail.png`);
  layoutEvidence.push({
    layout: 'rail',
    effect: await page.$eval(`${rail} .bh-persona-avatar`, (e) => e.dataset.effect),
  });
  await page.click('button[aria-label="打开侧边栏"],button[aria-label="Open sidebar"]');
  await page.waitForSelector('.bh-pinned');
  await rpc('pinsSet', { pins: roster.pins });
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.waitForFunction(() => document.documentElement.dataset.botharnessMotion === 'reduce');
  const motion = await page.$$eval('.bh-composer-activity-facepile .bh-avatar-media', (elements) =>
    elements.map((e) => getComputedStyle(e).animationName),
  );
  assert.ok(motion.length > 0 && motion.every((name) => name === 'none'));
  await screenshot(`${phase}-reduce.png`);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'no-preference' }]);
  if (phase === 'after') {
    const summary = await page.$('.bh-composer-activity-status summary');
    assert.ok(summary);
    await summary.focus();
    await page.keyboard.press('Enter');
    await page.waitForSelector('.bh-composer-activity-status[open]');
    await screenshot('details.png');
    const latest = snapshots.at(-1);
    assert.equal(latest.activity.toolKind, 'execute');
    assert.equal(latest.activity.effect, 'executing');
    assert.ok(
      !JSON.stringify(snapshots).includes('setTimeout'),
      'No raw command in Activity snapshots',
    );
    if (process.env.BH_E2E_HOLD !== 'true') {
      await rpc('toolApprovalDecide', {
        channelId,
        messageId: pending.id,
        outcome: 'allowed-once',
      });
      for (let i = 0; i < 1200; i++) {
        const messages = (await rpc('channelMessages', { channelId })).messages;
        const snapshot = await rpc('activitySnapshot');
        if (
          messages.some(
            (m) => m.author.kind === 'bot' && m.body.includes('Safe tool activity confirmed'),
          ) &&
          snapshot.bots.find((b) => b.slug === bot.slug)?.state === 'idle'
        )
          break;
        assert.ok(i < 1199, 'Real model reply must complete');
        await new Promise((done) => setTimeout(done, 200));
      }
      await page.waitForFunction(
        (id) =>
          document.querySelector(`[data-channel-id="${id}"] .bh-persona-avatar`)?.dataset.state ===
            'idle' && !document.querySelector('.bh-composer-activity-status'),
        {},
        channelId,
      );
      await screenshot('settled.png');
    }
  }
  const sessionId = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (session) => session.role === 'orchestrator',
  )?.sessionId;
  assert.ok(sessionId);
  const native = await nativeSnapshot(sessionId);
  const nativeEvents = native.records
    .filter((record) => ['tool/call', 'tool/result', 'turn/end'].includes(record.event.type))
    .map((record) => ({
      type: record.event.type,
      time: record.event.time,
      ...(record.event.type === 'tool/call' &&
      ['bash', 'channel_send'].includes(record.event.data.name)
        ? { name: record.event.data.name }
        : {}),
    }));
  assert.ok(nativeEvents.some((event) => event.type === 'tool/call' && event.name === 'bash'));
  if (phase === 'after' && process.env.BH_E2E_HOLD !== 'true') {
    assert.ok(nativeEvents.some((event) => event.type === 'tool/result'));
    assert.ok(nativeEvents.some((event) => event.type === 'turn/end'));
  }
  writeFileSync(
    resolve(evidence, `${phase}-proof.json`),
    JSON.stringify(
      {
        bot: { slug: bot.slug, displayName: bot.displayName },
        route,
        phase,
        snapshots,
        dom,
        nativeEvents,
        layoutEvidence,
        reduceMotion: motion,
        heldForHumanQA: process.env.BH_E2E_HOLD === 'true',
        actualNativeShellApproval: true,
        verdict: 'PASS',
      },
      null,
      2,
    ) + '\n',
  );
} finally {
  await browser.close();
}
