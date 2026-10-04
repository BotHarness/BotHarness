import assert from 'node:assert/strict';
import { assertAssignmentHarvest } from './e2e-assignment-harvest-proof.mjs';
import { assertAssignmentReportReply } from './e2e-assignment-report-proof.mjs';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const phase = process.argv[2] ?? 'prepare';
assert.ok(origin && home && evidence);
assert.ok(['prepare', 'complete', 'verify', 'capture'].includes(phase));
assert.ok(
  new URL(origin).protocol === 'http:' &&
    ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(origin).hostname),
);
const privateDir = resolve('.humanlayer/tasks/194-report-harvest');
mkdirSync(privateDir, { recursive: true });
mkdirSync(evidence, { recursive: true });
const statePath = resolve(privateDir, 'qa-state.json');
const cookie = readFileSync(resolve(tmpdir(), 'dsh-' + basename(home) + '.cookies'), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}, namespace = 'botharness') {
  const response = await fetch(origin + '/api/' + namespace + '/' + method, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: namespace + '/' + method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, method + ': ' + JSON.stringify(result?.error));
  return result.value;
}
async function waitFor(test, label) {
  for (let n = 0; n < 180; n++) {
    const result = await test();
    if (result) return result;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error('Timed out: ' + label);
}
let scene;
const assignmentRows = async () => (await rpc('assignments', { slug: scene.bot.slug })).assignments;
const messages = async () => (await rpc('channelMessages', { channelId: scene.dm })).messages;
const pending = async (sessionId) => {
  const rows = await messages();
  const resolved = new Set(
    rows.flatMap((m) => (m.toolApprovalDecision ? [m.toolApprovalDecision.requestMessageId] : [])),
  );
  return rows.findLast(
    (m) => m.toolApprovalRequest?.sessionId === sessionId && !resolved.has(m.id),
  );
};
const writeState = () => writeFileSync(statePath, JSON.stringify(scene, null, 2));
const writeProof = (name, proof) =>
  writeFileSync(resolve(evidence, name), JSON.stringify(proof, null, 2) + '\n');
const modules = resolve('node_modules/.pnpm');
const installed = (name) =>
  createRequire(
    resolve(
      modules,
      readdirSync(modules).find((d) => d.startsWith(name + '@')),
      'node_modules/',
    ),
  )(name);
const WebSocket = installed('ws');
async function nativeSnapshot(sessionId) {
  const socket = new WebSocket(origin.replace(/^http/, 'ws') + '/api/remote.mux', {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timeout = setTimeout(() => reject(Error('native snapshot timeout')), 20000);
      socket.once('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      socket.on('message', (raw) => {
        const f = JSON.parse(String(raw));
        if (f.type === 'error') {
          clearTimeout(timeout);
          reject(Error(JSON.stringify(f.error)));
        }
        if (f.type === 'item' && f.value.type === 'snapshot') {
          clearTimeout(timeout);
          if (f.value.hasMore !== false) reject(Error('Incomplete native Session snapshot'));
          else done(f.value);
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

const reports = async () =>
  (await rpc('botAttention', { slug: scene.bot.slug, limit: 100 })).items.filter(
    (item) =>
      item.assignmentSessionId === scene.sessionId && item.sourceKind === 'assignment-report',
  );
const orchestrator = async () =>
  (await rpc('sessions', { slug: scene.bot.slug })).sessions.find(
    (session) => session.role === 'orchestrator',
  );
const nativeEvents = async () =>
  (await nativeSnapshot((await orchestrator()).sessionId)).records.map((record) => record.event);
if (phase === 'prepare') {
  const stamp = Date.now();
  const model = (await rpc('modelCatalog')).models.find(
    (m) => m.model.includes('flash') && m.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: 'Report harvest QA ' + stamp,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await rpc('create', {
      displayName: 'Report harvest QA ' + stamp,
      persona:
        'Follow the Human exactly. Use only the requested single Assignment. Never use Shell in the Orchestrator, approve tools, modify files or create subagents. After creation send only REPORT_BATCH_CREATED via channel_send and end. When the completed Assignment Report arrives send only REPORT_BATCH_DONE via channel_send, then end. Do not send progress summaries to the Channel, and do not send completion before the completed Report.',
    })
  ).bot;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  const folder = resolve(home, 'qa-workspace');
  mkdirSync(folder, { recursive: true });
  const workspace = (await rpc('create', { request: { path: folder } }, 'workspace')).workspace;
  const grant = (await rpc('grantCreate', { slug: bot.slug, workspaceId: workspace.workspaceId }))
    .grant;
  scene = {
    stamp,
    bot: { slug: bot.slug, name: bot.displayName },
    dm: dm.id,
    grantId: grant.id,
    route,
  };
  writeState();
  await rpc('channelSend', {
    channelId: scene.dm,
    body:
      'Create exactly one Assignment using grant_id ' +
      grant.id +
      ' with purpose: Report harvest acceptance. Assignment must first call report_to_orchestrator state progress summary REPORT_PROGRESS_ONE, then call it again state progress summary REPORT_PROGRESS_TWO; next invoke native Shell exactly once with command node -e "setTimeout(() => {}, 1000)" and description "Report harvest QA timer", awaiting Human approval; ONLY after the timer succeeds call report_to_orchestrator state completed summary REPORT_BATCH_DONE. No files, subagents or extra Reports. After creation you must send only REPORT_BATCH_CREATED via channel_send and end. Wait for the completed Report before sending REPORT_BATCH_DONE. Never approve tools or use Shell yourself.',
  });
  scene.sessionId = (
    await waitFor(async () => (await assignmentRows())[0], 'owned Assignment')
  ).sessionId;
  writeState();
  const card = await waitFor(() => pending(scene.sessionId), 'pending timer after progress');
  scene.approvalId = card.id;
  scene.lastPhase = 'pending';
  writeState();
  assert.equal(
    JSON.parse(card.toolApprovalRequest.input).command,
    'node -e "setTimeout(() => {}, 1000)"',
  );
  assert.ok(['pwsh', 'bash'].includes(card.toolApprovalRequest.toolName));
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 1,
    'initial Orchestrator Turn settled',
  );
  const items = await reports();
  assert.equal(items.length, 2);
  assert.ok(
    items.every(
      (item) =>
        item.state === 'pending' &&
        item.assignmentReportState === 'progress' &&
        item.sourceAvailable,
    ),
  );
  assert.deepEqual(items.map((item) => item.summary).sort(), [
    'REPORT_PROGRESS_ONE',
    'REPORT_PROGRESS_TWO',
  ]);
  assert.equal((await assignmentRows()).length, 1);
  assert.equal(
    (await nativeEvents()).filter((e) => e.type === 'turn/start').length,
    1,
    'progress must not wake another Turn',
  );
  scene.progressIds = items.map((item) => item.id);
  writeState();
  writeProof('01-pending-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorTurns: 1,
    progress: items.map(({ id, state, assignmentReportState, sourceAvailable, summary }) => ({
      id,
      state,
      assignmentReportState,
      sourceAvailable,
      summary,
    })),
    timerPending: true,
  });
} else {
  scene = JSON.parse(readFileSync(statePath, 'utf8'));
}
if (phase === 'complete') {
  if (
    (await rpc('toolApprovalStatus', { channelId: scene.dm, messageId: scene.approvalId }))
      .status === 'pending'
  )
    await rpc('toolApprovalDecide', {
      channelId: scene.dm,
      messageId: scene.approvalId,
      outcome: 'allowed-once',
    });
  await waitFor(
    async () =>
      (await messages()).some(
        (message) => message.author.kind === 'bot' && message.body === 'REPORT_BATCH_DONE',
      ),
    'real Report completion DM',
  );
  scene.lastPhase = 'completed';
  writeState();
}
if (phase === 'complete' || phase === 'verify') {
  await waitFor(
    async () => (await nativeEvents()).filter((e) => e.type === 'turn/end').length === 2,
    'harvest Orchestrator Turn settled',
  );
  const events = await nativeEvents();
  const items = await reports();
  const native = await nativeSnapshot(scene.sessionId);
  const calls = native.records.filter(
    ({ event }) => event.type === 'tool/call' && event.data.name === 'report_to_orchestrator',
  );
  assert.equal(calls.length, 3, 'exactly three actual Assignment Report calls');
  const successful = calls.map(({ event: call }) => {
    const result = native.records.find(
      ({ event }) =>
        event.type === 'tool/result' && event.data.message.toolCallId === call.data.callId,
    )?.event;
    assert.equal(result?.data.message.isError, false, 'each actual Report succeeded');
    const args = JSON.parse(call.data.arguments);
    return { state: args.state, summary: args.summary, callAt: call.time, resultAt: result.time };
  });
  const batch = assertAssignmentHarvest(events, items, scene.sessionId, scene.progressIds);
  const reportDelivery = assertAssignmentReportReply(
    native.records,
    await messages(),
    'REPORT_BATCH_DONE',
  );
  writeProof('02-harvest-proof.json', {
    bot: scene.bot.name,
    assignmentSessionId: scene.sessionId,
    orchestratorSessionId: (await orchestrator()).sessionId,
    orchestratorTurns: 2,
    ...batch,
    reports: items.map(
      ({ id, state, assignmentReportState, sourceAvailable, summary, observedAt, handledAt }) => ({
        id,
        state,
        assignmentReportState,
        sourceAvailable,
        summary,
        observedAt,
        handledAt,
      }),
    ),
    successfulReports: successful,
    reportDelivery,
  });
}
if (phase === 'prepare' || phase === 'capture' || phase === 'complete' || phase === 'verify') {
  const puppeteer = installed('puppeteer');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const split = cookie.indexOf('=');
    await browser.setCookie({
      name: cookie.slice(0, split),
      value: cookie.slice(split + 1),
      domain: new URL(origin).hostname,
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewport({ width: 1500, height: 1000 });
    const navigation = [];
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable');
    cdp.on('Network.webSocketFrameSent', ({ response }) => {
      try {
        const frame = JSON.parse(response.payloadData);
        if (frame.type === 'open' && frame.endpoint === 'session/follow')
          navigation.push(frame.payload?.args?.request?.address?.sessionId);
      } catch {}
    });
    await page.goto(origin, { waitUntil: 'domcontentloaded' });
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some((b) =>
            ['Continue', '继续'].includes(b.textContent?.trim() ?? ''),
          ),
        { timeout: 10000 },
      )
      .catch(() => undefined);
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['Continue', '继续'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    for (let n = 0; n < 3 && !(await page.$('.bh-main')); n++) {
      await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page
        .waitForFunction(
          () =>
            [...document.querySelectorAll('button')].some((b) =>
              ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''),
            ) || document.querySelector('.bh-main'),
          { timeout: 5000 },
        )
        .catch(() => undefined);
      await page.evaluate(() =>
        [...document.querySelectorAll('button')]
          .find((b) => ['Configure later', '稍后配置'].includes(b.textContent?.trim() ?? ''))
          ?.click(),
      );
      await page.waitForSelector('.bh-main', { timeout: 10000 }).catch(() => undefined);
    }
    await page.waitForSelector('[data-channel-id="' + scene.dm + '"]');
    await page.click('[data-channel-id="' + scene.dm + '"]');
    await page.waitForSelector('.bh-channel-island[aria-haspopup="dialog"]');
    await page.click('.bh-channel-island[aria-haspopup="dialog"]');
    await page.waitForFunction(() =>
      [...document.querySelectorAll('button')].some((b) =>
        ['View details', '查看详情', '查看详细'].includes(b.textContent?.trim() ?? ''),
      ),
    );
    await page.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((b) => ['View details', '查看详情', '查看详细'].includes(b.textContent?.trim() ?? ''))
        ?.click(),
    );
    await page.waitForSelector('.bh-profile-view');
    await page.evaluate(() => {
      for (const e of document.querySelectorAll('.bh-channel-sidebar-entry-head'))
        if (
          /Bot Inbox|Bot 收件箱/.test(e.textContent ?? '') &&
          e.getAttribute('aria-expanded') !== 'true'
        )
          e.click();
    });
    await page.waitForSelector('.bh-inbox-group');
    await page.evaluate(() => {
      for (const e of document.querySelectorAll(
        '.bh-inbox-group > summary,.bh-inbox-history > summary',
      ))
        if (!e.parentElement.open) e.click();
    });
    await page.waitForSelector('.bh-inbox-item');
    await page.evaluate(() => {
      for (const group of document.querySelectorAll('.bh-inbox-group')) {
        const keep = group
          .querySelector('.bh-inbox-group-head')
          ?.textContent.includes('Report harvest acceptance');
        if (group.open !== keep) group.querySelector('summary').click();
      }
    });
    await page.waitForFunction(
      () =>
        !document.querySelector('.bh-profile-view')?.textContent.includes('正在刷新用量') &&
        !document.querySelector('.bh-profile-view')?.textContent.includes('Refreshing usage'),
      { timeout: 15000 },
    );
    for (const theme of ['light', 'dark']) {
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }]);
      await page.screenshot({
        path: resolve(evidence, scene.lastPhase + '-inbox-' + theme + '.png'),
      });
    }
    const beforeItems = await reports();
    await page.evaluate(() =>
      [...document.querySelectorAll('button.bh-inbox-item')]
        .find(
          (e) => e.querySelector('.bh-inbox-item-summary')?.textContent === 'REPORT_PROGRESS_ONE',
        )
        ?.click(),
    );
    await waitFor(
      () => navigation.includes(scene.sessionId),
      'native Source navigation to owned Assignment',
    );
    assert.deepEqual(
      (await reports()).map(({ id, state, observedAt }) => ({ id, state, observedAt })),
      beforeItems.map(({ id, state, observedAt }) => ({ id, state, observedAt })),
      'Human viewing must not observe Reports',
    );
    assert.equal(
      (await nativeEvents()).filter((e) => e.type === 'turn/start').length,
      scene.lastPhase === 'pending' ? 1 : 2,
      'source viewing must not wake Orchestrator',
    );
    writeProof('source-navigation-' + scene.lastPhase + '.json', {
      assignmentSessionId: scene.sessionId,
      nativeEndpoint: 'session/follow',
      sourceNavigation: true,
      humanViewingDidNotObserve: true,
      humanViewingDidNotWake: true,
    });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
}
console.log(JSON.stringify({ phase, bot: scene.bot.name, passed: true }));
