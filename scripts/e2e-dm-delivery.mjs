import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN,
  home = process.env.BH_E2E_HOME,
  evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(origin && home && evidence);
const mode = process.env.BH_E2E_DELIVERY ?? 'steer';
assert.ok(['steer', 'turn'].includes(mode));
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
      rpcId: crypto.randomUUID(),
      method: endpoint,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
async function until(read, check, message, timeout = 120000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (check(value)) return value;
    await new Promise((done) => setTimeout(done, 250));
  }
  throw Error(message);
}
const models = (await rpc('modelCatalog')).models;
const model = models.find(
  (e) => e.model.includes('flash') && e.efforts.some((e) => e.id === 'low'),
);
assert.ok(model);
const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
const bot = (await rpc('create', { displayName: `DM delivery ${mode} QA ${Date.now()}` })).bot;
const channelId = `dm-${bot.slug}`;
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
const preset = (
  await rpc('modelPresetCreate', {
    name: bot.displayName,
    orchestrator: route,
    assignmentDefault: route,
  })
).preset;
await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
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
  await page.screenshot({ path: resolve(evidence, name) });
}
async function clickText(texts, scope = 'button') {
  await page.waitForFunction(
    ({ texts, scope }) =>
      [...document.querySelectorAll(scope)].some((e) => texts.includes(e.textContent?.trim())),
    {},
    { texts, scope },
  );
  await page.evaluate(
    ({ texts, scope }) =>
      [...document.querySelectorAll(scope)]
        .find((e) => texts.includes(e.textContent?.trim()))
        ?.click(),
    { texts, scope },
  );
}
async function openProfile() {
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('.bh-channel-island[aria-haspopup="dialog"]')
        ?.textContent?.includes(name),
    {},
    bot.displayName,
  );
  await page.locator('.bh-channel-island[aria-haspopup="dialog"]').click();
  await clickText(['View details', '查看详细']);
  await page.waitForSelector('.bh-profile-view');
  await page
    .locator('.bh-profile-policy-section:has(.bh-source-policy-row) > details > summary')
    .click();
  await page.waitForSelector('.bh-source-policy-row button', { visible: true });
  await page.$eval('.bh-source-policy-row', (e) => e.scrollIntoView({ block: 'center' }));
}
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
      if (!(await page.$('.bh-root')))
        await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-root') ||
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
  await page.click(`[data-channel-id="${channelId}"]`);
  await page.waitForSelector('.bh-composer-shell');
  await openProfile();
  if (mode === 'turn') {
    await page.locator('.bh-source-policy-row button').click();
    await page.waitForSelector('[role="dialog"] select.bh-profile-policy-select');
    await page.select('[role="dialog"] select.bh-profile-policy-select', 'turn');
    await screenshot('edit-turn.png');
    await clickText(['Save', '保存'], '[role="dialog"] button');
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"] select.bh-profile-policy-select'),
      {
        timeout: 10000,
      },
    );
  }
  const policy = (await rpc('botSourcePolicies', { slug: bot.slug })).policies.find(
    (e) => e.sourceClass === 'human-dm',
  );
  assert.equal(policy.delivery, mode);
  await screenshot('policy.png');
  const profileText = await page.$eval('.bh-source-policy-row', (e) => e.textContent);
  assert.match(
    profileText,
    mode === 'turn' ? /独立回合|own turn|separate turn/i : /并入回合|folded.*turn/i,
  );
  await clickText(['Back to chat', '返回聊天']);
  const expectedCommand = 'node -e "setTimeout(() => {}, 2000)"';
  const first = (
    await rpc('channelSend', {
      channelId,
      body: `Use native Shell to run exactly ${expectedCommand} once and wait for approval. This is a harmless two-second timer. After it finishes, reply in this DM using channel_send with the exact phrase "Delivery first confirmed". Do not use other Shell commands, do not delegate.`,
    })
  ).message;
  const messages = () => rpc('channelMessages', { channelId }).then((r) => r.messages ?? []);
  const held = await until(
    messages,
    (rows) => rows.some((m) => m.toolApprovalRequest),
    'Real native Shell approval must hold the first Turn',
  );
  const approval = held.find((m) => m.toolApprovalRequest);
  assert.equal(approval.toolApprovalRequest.role, 'orchestrator');
  assert.equal(JSON.parse(approval.toolApprovalRequest.input).command, expectedCommand);
  const session = (await rpc('sessions', { slug: bot.slug })).sessions.find(
    (e) => e.role === 'orchestrator',
  );
  assert.ok(session);
  const before = await nativeSnapshot(session.sessionId);
  assert.equal(before.hasMore, false);
  const beforeEvents = before.records.map((e) => e.event);
  assert.equal(beforeEvents.filter((e) => e.type === 'turn/start').length, 1);
  assert.equal(beforeEvents.filter((e) => e.type === 'turn/end').length, 0);
  const second = (
    await rpc('channelSend', {
      channelId,
      body: 'Additional instruction: reply in this DM using channel_send with the exact phrase "Delivery second confirmed". If the existing timer is still running, wait for it to finish. Do not run any Shell command, do not repeat the timer, and do not delegate.',
    })
  ).message;
  const during = await until(
    messages,
    (rows) =>
      rows
        .find((m) => m.id === second.id)
        ?.deliveries?.some((d) =>
          mode === 'steer'
            ? d.state === 'running'
            : ['pending', 'observed', 'running'].includes(d.state),
        ),
    'Second message must show the correct active/queued receipt',
    10000,
  );
  await screenshot('held-second.png');
  const accepted = await rpc('toolApprovalDecide', {
    channelId,
    messageId: approval.id,
    outcome: 'allowed-once',
  });
  assert.equal(accepted.accepted, true);
  const approved = new Set([approval.id]);
  const settled = await until(
    async () => {
      const rows = await messages();
      for (const message of rows) {
        if (!message.toolApprovalRequest || approved.has(message.id)) continue;
        assert.ok(approved.size < 3, 'Unexpected repeated QA timer approvals');
        assert.equal(message.toolApprovalRequest.role, 'orchestrator');
        assert.equal(JSON.parse(message.toolApprovalRequest.input).command, expectedCommand);
        const decision = await rpc('toolApprovalDecide', {
          channelId,
          messageId: message.id,
          outcome: 'allowed-once',
        });
        assert.equal(decision.accepted, true);
        approved.add(message.id);
      }
      return { rows, bot: (await rpc('list')).bots.find((e) => e.slug === bot.slug) };
    },
    (value) =>
      value.bot?.aggregateState === 'idle' &&
      [first.id, second.id].every((id) =>
        value.rows.find((m) => m.id === id)?.deliveries?.some((d) => d.state === 'handled'),
      ) &&
      value.rows.some(
        (m) => m.author.kind === 'bot' && m.body.includes('Delivery second confirmed'),
      ),
    'Both messages must settle and the real model must confirm the new instruction',
  );
  const after = await nativeSnapshot(session.sessionId);
  assert.equal(after.hasMore, false);
  const events = after.records.map((e) => e.event);
  const starts = events.filter((e) => e.type === 'turn/start').map((e) => e.seq);
  const ends = events.filter((e) => e.type === 'turn/end').map((e) => e.seq);
  assert.equal(
    starts.length,
    mode === 'steer' ? 1 : 2,
    'Native Turn count must distinguish steering from queuing',
  );
  assert.equal(ends.length, starts.length);
  assert.ok(
    settled.rows.some(
      (m) => m.author.kind === 'bot' && m.body.includes('Delivery first confirmed'),
    ),
  );
  await screenshot('settled.png');
  await openProfile();
  await screenshot('final-policy.png');
  const proof = {
    bot: { slug: bot.slug, displayName: bot.displayName },
    route,
    mode,
    policy,
    sessionId: session.sessionId,
    firstMessageId: first.id,
    secondMessageId: second.id,
    whileHeld: {
      turnStarts: 1,
      turnEnds: 0,
      secondDelivery: during.find((m) => m.id === second.id).deliveries,
    },
    nativeTurns: { starts, ends },
    eventTypes: events.map((e) => ({ seq: e.seq, type: e.type })),
    replies: settled.rows
      .filter((m) => m.author.kind === 'bot')
      .map((m) => ({ id: m.id, body: m.body })),
    finalState: settled.bot.aggregateState,
  };
  writeFileSync(resolve(evidence, 'proof.json'), JSON.stringify(proof, null, 2) + '\n');
  console.log(
    JSON.stringify({ verdict: 'PASS', mode, bot: bot.displayName, turns: starts.length }),
  );
} catch (error) {
  await screenshot('failure.png').catch(() => undefined);
  console.error(error);
  process.exitCode = 1;
} finally {
  await Promise.race([
    browser.close().catch(() => undefined),
    new Promise((done) =>
      setTimeout(() => {
        browser.process()?.kill();
        done();
      }, 5000),
    ),
  ]);
  process.exit(process.exitCode ?? 0);
}
