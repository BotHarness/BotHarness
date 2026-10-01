import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_HISTORY_QA_PORT ?? 32001);
const home = resolve(process.env.BH_HISTORY_QA_HOME ?? resolve(tmpdir(), 'bh-553-inbox-history'));
const out = resolve(repo, '.humanlayer/tasks/issue-553', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated DSH Profile first');
if (mode === 'seed') {
  for (const script of [
    'e2e-inbox-tool-approval.mjs',
    'e2e-inbox-native-question.mjs',
    'e2e-inbox-grant-assignment.mjs',
  ]) {
    const env = { ...process.env };
    for (const prefix of ['BH_APPROVAL_QA_', 'BH_QUESTION_QA_', 'BH_ACTION_QA_']) {
      env[prefix + 'HOME'] = home;
      env[prefix + 'PORT'] = String(port);
    }
    const output = execFileSync(process.execPath, [resolve(repo, 'scripts', script), 'check'], {
      cwd: repo,
      env,
      encoding: 'utf8',
      windowsHide: true,
      maxBuffer: 8_000_000,
    });
    writeFileSync(resolve(out, script + '.log'), output);
    console.log('Real DSH scenario passed: ' + script);
  }
}
const modules = resolve(repo, 'node_modules/.pnpm');
const pkg = readdirSync(modules).find((name) => name.startsWith('puppeteer@'));
const puppeteer = createRequire(resolve(modules, pkg, 'node_modules/'))('puppeteer');
const browser = await puppeteer.launch({
  headless: true,
  protocolTimeout: 60000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const theme = async (dark) => {
  await page.emulateMediaFeatures([
    { name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' },
  ]);
  await page.evaluate(async (dark) => {
    if (dark) document.body.setAttribute('data-ds-dark-theme', '');
    else document.body.removeAttribute('data-ds-dark-theme');
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  }, dark);
};
const rpc = async (method, args = {}, client = page, namespace = 'botharness') =>
  client.evaluate(
    async ({ method, args, namespace }) => {
      const response = await fetch('/api/' + namespace + '/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(50000),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: crypto.randomUUID(),
          method: namespace + '/' + method,
          payload: { args },
        }),
      });
      const result = (await response.json()).result;
      if (result?.ok !== true) throw new Error(method + ': ' + JSON.stringify(result?.error));
      return result.value;
    },
    { method, args, namespace },
  );
const click = async (selector, text, client = page) => {
  await client.waitForFunction(
    ({ selector, text }) =>
      [...document.querySelectorAll(selector)].some((n) => n.textContent?.trim() === text),
    {},
    { selector, text },
  );
  assert.ok(
    await client.evaluate(
      ({ selector, text }) => {
        const n = [...document.querySelectorAll(selector)].find(
          (n) => n.textContent?.trim() === text,
        );
        n?.click();
        return !!n;
      },
      { selector, text },
    ),
  );
};
const login = async (client) => {
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client.goto(url, { waitUntil: 'domcontentloaded' });
  await client
    .waitForFunction(
      () =>
        [...document.querySelectorAll('button')].some((n) =>
          ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''),
        ),
      { timeout: 6000 },
    )
    .catch(() => undefined);
  await client.evaluate(() =>
    [...document.querySelectorAll('button')]
      .find((n) => ['继续', 'Continue'].includes(n.textContent?.trim() ?? ''))
      ?.click(),
  );
  await client.waitForSelector('.bh-human-inbox-entry', { timeout: 5000 }).catch(async () => {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-human-inbox-entry');
  });
};
const inbox = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => document.querySelector('.bh-human-inbox-entry')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await delay(700);
};
const openDM = async (id, client = page) => {
  await client.bringToFront();
  await client.waitForSelector(`[data-channel-id="${id}"]`);
  await client.evaluate((id) => document.querySelector(`[data-channel-id="${id}"]`)?.click(), id);
  await client.waitForSelector('.bh-channel-options');
  await delay(700);
};
const waitFor = async (test, label) => {
  for (let n = 0; n < 60; n++) {
    const result = await test();
    if (result) return result;
    await delay(2000);
  }
  throw new Error('Timed out: ' + label);
};

const handled = async (client = page, filters = {}) =>
  (await rpc('humanAttention', { category: 'handled', limit: 100, ...filters }, client)).items;
const showHistory = async (client = page) => {
  await inbox(client);
  await click('.bh-human-inbox-tabs button', '已处理', client);
  await client.select('.bh-human-inbox-filters label:nth-child(1) select', '');
  await client.select('.bh-human-inbox-filters label:nth-child(2) select', '');
  await delay(600);
};
try {
  await login(page);
  await showHistory();
  const rows = await handled();
  assert.ok(rows.length >= 7);
  const kinds = new Set(rows.map((row) => row.kind));
  for (const kind of [
    'user-question',
    'tool-approval',
    'workspace-grant-request',
    'assignment-waiting-human',
    'assignment-blocked',
  ])
    assert.ok(kinds.has(kind), kind);
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length);
  for (const row of rows) {
    const messages = (await rpc('channelMessages', { channelId: row.channelId })).messages;
    const reply = messages.find((message) => message.id === row.responseMessageId);
    assert.equal(reply?.author.kind, 'human');
    if (row.assignmentSessionId) {
      const context = (
        await rpc('humanAssignmentContext', {
          slug: row.botSlug,
          sessionId: row.assignmentSessionId,
          sourceEventId: row.sourceEventId,
        })
      ).context;
      assert.equal(context.canReply, false);
      assert.equal(context.reply.id, reply.id);
    } else assert.equal(reply.replyTo, row.messageId);
  }
  await shot(mode === 'resume' ? 'history-after-restart' : 'history-light');
  if (mode === 'resume') {
    const before = JSON.parse(readFileSync(resolve(out, 'history.json'), 'utf8'));
    assert.deepEqual(
      rows.map((row) => row.id),
      before.ids,
    );
    console.log('PASS: canonical Handled history and navigation survive Host restart.');
  } else {
    await theme(true);
    await shot('history-dark');
    await theme(false);
    const question = rows.find((row) => row.kind === 'user-question');
    await page.select('.bh-human-inbox-filters label:nth-child(1) select', question.botSlug);
    await page.select('.bh-human-inbox-filters label:nth-child(2) select', question.channelId);
    await delay(600);
    const scoped = await handled(page, {
      botSlug: question.botSlug,
      channelId: question.channelId,
    });
    assert.equal(await page.$$eval('.bh-human-inbox-row', (nodes) => nodes.length), scoped.length);
    await shot('history-filtered');
    await click('[data-attention-id="' + question.id + '"] button', '查看上下文');
    await page.waitForSelector(
      '.bh-human-inbox-reply [data-message-id="' + question.messageId + '"]',
    );
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已回答'),
    );
    await shot('history-question-context');
    await click('[data-attention-id="' + question.id + '"] button', '查看答复');
    await page.waitForSelector('[data-message-id="' + question.responseMessageId + '"]');
    await shot('history-exact-response');
    await showHistory();
    const assignment = rows.find((row) => row.kind === 'assignment-blocked');
    await click('[data-attention-id="' + assignment.id + '"] button', '查看上下文');
    await page.waitForSelector(
      '.bh-human-inbox-reply [data-source-event-id="' + assignment.sourceEventId + '"]',
    );
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已发送给 Bot'),
    );
    await shot('history-assignment-context');
    await showHistory();
    const actions = (
      await rpc('humanAttention', { category: 'action', sort: 'oldest', limit: 100 })
    ).items;
    let pending = actions.find((row) => row.kind === 'user-question');
    if (pending === undefined) {
      const bot = (
        await rpc('create', {
          displayName: 'History source QA',
          persona:
            'Follow the Human exactly. Use the native question once, await its answer, then report the actual answer using channel_send in the DM. No Assignments.',
        })
      ).bot;
      const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
      await rpc('channelSend', {
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Call native ask_user_question exactly once: id release-route, question "Which release channel should I use?", options [{label:"Canary"},{label:"Stable"}]. Await the actual Human answer, then channel_send its selected answer in this DM. Do not replace the native question with plain chat.',
      });
      pending = await waitFor(
        async () =>
          (await rpc('humanAttention', { category: 'action', limit: 100 })).items.find(
            (row) => row.botSlug === bot.slug && row.kind === 'user-question',
          ),
        'new live native source question',
      );
    }
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.setViewport({ width: 1440, height: 900 });
    await secondContext.setCookie(...(await page.cookies()));
    await login(second);
    await openDM(pending.channelId, second);
    await second.waitForSelector(
      '[data-message-id="' + pending.messageId + '"] .bh-question-item button',
    );
    assert.ok(
      await second.evaluate((messageId) => {
        const target = document.querySelector('[data-message-id="' + messageId + '"]');
        const option = [...target.querySelectorAll('.bh-question-item button')].find(
          (node) => node.querySelector('.bh-question-option > span')?.textContent === 'Stable',
        );
        option?.click();
        return !!option;
      }, pending.messageId),
    );
    await click('.bh-question-card button', '回答并继续', second);
    await waitFor(
      async () => (await handled()).some((row) => row.sourceEventId === pending.sourceEventId),
      'source answer appears in history',
    );
    await showHistory();
    await page.waitForSelector('[data-attention-id="handled:' + pending.sourceEventId + '"]');
    await shot('history-two-window-source-answer');
    await secondContext.close();
    await page.setViewport({ width: 420, height: 900 });
    await delay(300);
    assert.ok(
      await page.evaluate(() =>
        [...document.querySelectorAll('.bh-human-inbox-row-main')].every(
          (node) => node.getBoundingClientRect().width > 200,
        ),
      ),
    );
    await shot('history-narrow');
    await page.setViewport({ width: 1440, height: 900 });
    await showHistory();
    const final = await handled();
    writeFileSync(
      resolve(out, 'history.json'),
      JSON.stringify(
        {
          ids: final.map((row) => row.id),
          responseNavigation: true,
          scopedFilters: true,
          twoWindowSourceAnswer: true,
          kinds: [...kinds],
        },
        null,
        2,
      ),
    );
    console.log(
      'PASS: all four canonical Human action families, exact request/answer navigation, filters and two-window source decisions.',
    );
  }
} catch (error) {
  await shot('failure').catch(() => undefined);
  console.log('History E2E failed: ' + error.message);
  throw error;
} finally {
  await browser.close();
}
