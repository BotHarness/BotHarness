import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.BH_E2E_ORIGIN;
assert.ok(origin && process.env.BH_E2E_HOME, 'Set BH_E2E_ORIGIN and BH_E2E_HOME');
const home = process.env.BH_E2E_HOME;
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `botharness/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(evidence, 'Set BH_E2E_EVIDENCE');
mkdirSync(evidence, { recursive: true });
const stage = process.env.BH_E2E_STAGE ?? 'complete';
assert.ok(['before', 'complete', 'verify'].includes(stage));
const fixturePath = resolve(evidence, 'fixture.json');
const bot = !existsSync(fixturePath)
  ? (await rpc('create', { displayName: `Bot delivery tools QA ${Date.now()}` })).bot
  : JSON.parse(readFileSync(fixturePath, 'utf8')).bot;
assert.ok(bot);
const channelId = `dm-${bot.slug}`;
await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
if (!existsSync(fixturePath)) {
  const models = (await rpc('modelCatalog')).models;
  const model = models.find(
    (e) => e.model.includes('flash') && e.efforts.some((e) => e.id === 'low'),
  );
  assert.ok(model);
  const route = { provider: model.provider, model: model.model, reasoningEffort: 'low' };
  const preset = (
    await rpc('modelPresetCreate', {
      name: bot.displayName,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  writeFileSync(
    fixturePath,
    JSON.stringify({ bot: { slug: bot.slug, displayName: bot.displayName }, route }, null, 2) +
      '\n',
  );
}
const pnpm = resolve('node_modules/.pnpm');
const pdir = readdirSync(pnpm).find((e) => e.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(pnpm, pdir, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ cookie });
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
async function open() {
  console.log('Opening native shell');
  await page.goto(origin, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((e) =>
          ['Continue', '继续'].includes(e.textContent?.trim()),
        ),
      { timeout: 3000 },
    )
    .catch(() => undefined);
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => ['Continue', '继续'].includes(e.textContent?.trim()))
      ?.click(),
  );
  if (!(await page.$('.bh-root')))
    await page.click('button[aria-label="Bot mode"],button[aria-label="Bot 模式"]');
  await page.waitForFunction(
    () =>
      document.querySelector('.bh-root') ||
      [...document.querySelectorAll('button')].some((e) =>
        ['Configure later', '稍后配置'].includes(e.textContent?.trim()),
      ),
  );
  await page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((e) => ['Configure later', '稍后配置'].includes(e.textContent?.trim()))
      ?.click(),
  );
  await page.waitForSelector(`[data-channel-id="dm-${bot.slug}"]`);
  await page.click(`[data-channel-id="dm-${bot.slug}"]`);
  await page.waitForFunction(
    (name) =>
      document
        .querySelector('.bh-channel-island[aria-haspopup="dialog"]')
        ?.textContent?.includes(name),
    {},
    bot.displayName,
  );
  await page.click('.bh-channel-island[aria-haspopup="dialog"]');
  await clickText(['View details', '查看详细']);
  await page.waitForSelector('.bh-profile-view');
  await page.waitForSelector(
    '.bh-profile-policy-section:has(.bh-source-policy-row) > details > summary',
  );
  await page.$eval(
    '.bh-profile-policy-section:has(.bh-source-policy-row) > details > summary',
    (e) => {
      if (!e.parentElement.open) e.click();
      e.scrollIntoView({ block: 'start' });
      if (!document.querySelector('.bh-source-policy-table'))
        for (let p = e.parentElement; p; p = p.parentElement) {
          if (
            p.scrollHeight > p.clientHeight &&
            ['auto', 'scroll'].includes(getComputedStyle(p).overflowY)
          ) {
            p.scrollTop = Math.max(0, p.scrollTop - 72);
            break;
          }
        }
    },
  );
  await page.waitForSelector('.bh-source-policy-row button', { visible: true });
}
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
async function until(read, check, message) {
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    const value = await read();
    if (check(value)) return value;
    await new Promise((done) => setTimeout(done, 1000));
  }
  throw Error(message);
}
async function policies() {
  return (await rpc('botSourcePolicies', { slug: bot.slug })).policies;
}
const sources = ['human-dm', 'bot-dm', 'group-mention'];
async function auditShot(name) {
  await open();
  await page
    .locator(
      '.bh-source-policy-row[data-source-class="human-dm"] button[aria-label^="查看"],.bh-source-policy-row[data-source-class="human-dm"] button[aria-label^="View"]',
    )
    .click();
  await page.waitForSelector('.bh-source-policy-audit');
  await page.screenshot({ path: resolve(evidence, name) });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.bh-source-policy-audit'));
}
async function request(body, phrase) {
  await rpc('channelSend', { channelId, body });
  return until(
    async () => ({
      bot: (await rpc('list')).bots.find((e) => e.slug === bot.slug),
      rows: (await rpc('channelMessages', { channelId })).messages,
    }),
    (value) =>
      value.bot?.aggregateState === 'idle' &&
      value.rows.some((m) => m.author.kind === 'bot' && m.body.includes(phrase)),
    'Real model must finish and explicitly reply',
  );
}
try {
  await page.setViewport({ width: 1500, height: 1000 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
  if (stage === 'before') {
    const before = await policies();
    assert.ok(sources.every((c) => before.find((p) => p.sourceClass === c)?.delivery === 'steer'));
    await auditShot('before-audit.png');
    writeFileSync(
      resolve(evidence, 'before-policies.json'),
      JSON.stringify(before, null, 2) + '\n',
    );
    console.log(JSON.stringify({ verdict: 'BASELINE CAPTURED', bot: bot.displayName }));
  } else if (stage === 'verify') {
    const rules = await policies();
    for (const sourceClass of sources) {
      const policy = rules.find((p) => p.sourceClass === sourceClass);
      assert.equal(policy.lastActor.kind, 'bot');
      assert.equal(policy.lastActor.botSlug, bot.slug);
      assert.equal(policy.delivery, sourceClass === 'human-dm' ? 'steer' : 'turn');
      assert.equal(policy.revision, sourceClass === 'human-dm' ? 3 : 2);
      assert.equal(policy.overrideActive, sourceClass !== 'human-dm');
    }
    await auditShot('after-restart.png');
    writeFileSync(
      resolve(evidence, 'restart-policies.json'),
      JSON.stringify(rules, null, 2) + '\n',
    );
    console.log(JSON.stringify({ verdict: 'RESTART PASS', bot: bot.displayName }));
  } else {
    const unchanged = (await policies()).filter((p) => !sources.includes(p.sourceClass));
    await request(
      '本地 QA：请依次调用 source_attention_set 三次，将 sourceClass human-dm、bot-dm、group-mention 各自设置 wake immediate 和 delivery turn。只修改你自己的这三条规则。最后用 channel_send 在本私聊回复精确短语 "Delivery policy saved"；不要使用 Shell，不要委派，也不要修改 Memory。',
      'Delivery policy saved',
    );
    const saved = await policies();
    for (const sourceClass of sources)
      assert.deepEqual(
        saved.find((p) => p.sourceClass === sourceClass),
        {
          ...saved.find((p) => p.sourceClass === sourceClass),
          sourceClass,
          admission: 'admit',
          wake: 'immediate',
          delivery: 'turn',
          revision: 2,
          overrideActive: true,
          lastActor: { kind: 'bot', botSlug: bot.slug },
        },
      );
    assert.deepEqual(
      saved.filter((p) => !sources.includes(p.sourceClass)),
      unchanged,
    );
    await auditShot('after-audit.png');
    await clickText(['Back to chat', '返回聊天']);
    await page.screenshot({ path: resolve(evidence, 'saved-chat.png') });
    await request(
      '本地 QA：请只调用 source_attention_reset，sourceClass human-dm，恢复 Human 私聊的内建投递默认值。不要修改 Bot 私聊或群内提及。然后用 channel_send 在本私聊回复精确短语 "Delivery default restored"。不要使用 Shell，不要委派，也不要修改 Memory。',
      'Delivery default restored',
    );
    const restored = await policies();
    assert.equal(restored.find((p) => p.sourceClass === 'human-dm').revision, 3);
    assert.equal(restored.find((p) => p.sourceClass === 'human-dm').delivery, 'steer');
    assert.equal(restored.find((p) => p.sourceClass === 'human-dm').overrideActive, false);
    for (const sourceClass of ['bot-dm', 'group-mention'])
      assert.deepEqual(
        restored.find((p) => p.sourceClass === sourceClass),
        saved.find((p) => p.sourceClass === sourceClass),
      );
    await auditShot('restored-audit.png');
    const session = (await rpc('sessions', { slug: bot.slug })).sessions.find(
      (e) => e.role === 'orchestrator',
    );
    assert.ok(session);
    const snapshot = await nativeSnapshot(session.sessionId);
    assert.equal(snapshot.hasMore, false);
    const events = snapshot.records.map((r) => r.event);
    const calls = events.filter(
      (e) =>
        e.type === 'tool/call' &&
        ['source_attention_set', 'source_attention_reset'].includes(e.data.name),
    );
    assert.equal(calls.filter((e) => e.data.name === 'source_attention_set').length, 3);
    assert.equal(calls.filter((e) => e.data.name === 'source_attention_reset').length, 1);
    const results = events.filter(
      (e) =>
        e.type === 'tool/result' &&
        calls.some((call) => call.data.callId === e.data.message.toolCallId),
    );
    assert.equal(results.length, 4);
    assert.ok(results.every((e) => e.data.message.isError !== true));
    assert.equal(events.filter((e) => e.type === 'turn/start').length, 2);
    assert.equal(events.filter((e) => e.type === 'turn/end').length, 2);
    writeFileSync(
      resolve(evidence, 'proof.json'),
      JSON.stringify(
        {
          bot: { slug: bot.slug, displayName: bot.displayName },
          sessionId: session.sessionId,
          saved,
          restored,
          toolCalls: calls.map((e) => ({ seq: e.seq, name: e.data.name })),
          successfulResults: results.length,
          nativeTurns: 2,
          finalState: 'idle',
        },
        null,
        2,
      ) + '\n',
    );
    console.log(JSON.stringify({ verdict: 'PASS', bot: bot.displayName, calls: 4, turns: 2 }));
  }
} catch (error) {
  await page
    .screenshot({ path: resolve('.humanlayer/tasks/528-bot-delivery-tools/failure-private.png') })
    .catch(() => undefined);
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
