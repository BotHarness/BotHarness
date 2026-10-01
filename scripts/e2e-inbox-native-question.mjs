import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_QUESTION_QA_PORT ?? 31998);
const home = resolve(
  process.env.BH_QUESTION_QA_HOME ?? resolve(tmpdir(), 'bh-551-inbox-native-question-final'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-551', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch the isolated DSH Profile first');
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
  await page.evaluate(async (dark) => {
    if (dark) document.body.setAttribute('data-ds-dark-theme', 'true');
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
const prepare = async (name) => {
  const bot = (
    await rpc('create', {
      displayName: name,
      persona:
        'Follow the Human precisely. Ask the native user question only once when requested. Await the actual answer and report it with channel_send in your DM. Do not create Assignments.',
    })
  ).bot;
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  await rpc('channelSend', {
    channelId: dm.id,
    messageId: 'human-' + crypto.randomUUID(),
    body: 'Use native ask_user_question exactly once with one question: id release-route; question "Which release channel should I use?"; options [{label:"Canary",description:"Small rollout"},{label:"Stable",description:"Full rollout"}]. Wait for the actual Human answer. After the tool returns, report the actual selected or custom answer in one DM channel_send beginning ANSWER_QA:. Do not replace the native question with a plain chat question; do not ask again or create an Assignment.',
  });
  const request = await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: dm.id })).messages.find(
        (m) => m.userQuestionRequest,
      ),
    'native model question',
  );
  assert.deepEqual(
    request.userQuestionRequest.questions.map((q) => q.id),
    ['release-route'],
  );
  assert.equal(
    request.userQuestionRequest.questions[0].question,
    'Which release channel should I use?',
  );
  assert.deepEqual(
    request.userQuestionRequest.questions[0].options.map((o) => o.label),
    ['Canary', 'Stable'],
  );
  console.log('Live native question ready: ' + name);
  return { bot, dm, request };
};
const actionRows = async () =>
  (await rpc('humanAttention', { category: 'action', sort: 'oldest' })).items;
const review = async (scene) => {
  await inbox();
  await page.waitForFunction(
    (name) =>
      [...document.querySelectorAll('.bh-human-inbox-row')].some((n) =>
        n.textContent?.includes(name),
      ),
    {},
    scene.bot.displayName,
  );
  await page.evaluate((name) => {
    const row = [...document.querySelectorAll('.bh-human-inbox-row')].find((n) =>
      n.textContent?.includes(name),
    );
    [...row.querySelectorAll('button')].find((b) => b.textContent?.trim() === '回答问题')?.click();
  }, scene.bot.displayName);
  await page.waitForSelector('.bh-human-inbox-reply .bh-question-card');
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.bh-human-inbox-reply .bh-question-card button')].some(
      (b) => b.textContent === '回答并继续' && !b.disabled,
    ),
  );
  assert.deepEqual(
    await page.$$eval('.bh-question-prompt', (nodes) => nodes.map((n) => n.textContent)),
    scene.request.userQuestionRequest.questions.map((q) => q.question),
  );
  assert.equal(await page.$('.bh-human-inbox-reply textarea'), null);
  assert.equal(
    await page.$eval('.bh-human-inbox-reply h2', (n) => n.textContent),
    '回答问题 · ' + scene.bot.displayName,
  );
};
const choose = async (label, client = page) => {
  assert.ok(
    await client.evaluate(
      ({ label, scope }) => {
        const button = [...document.querySelectorAll(scope + '.bh-question-item button')].find(
          (b) => b.querySelector('.bh-question-option > span')?.textContent === label,
        );
        button?.click();
        return !!button;
      },
      { label, scope: client === page ? '.bh-human-inbox-reply ' : '' },
    ),
  );
};
const audit = async (scene) =>
  (await rpc('channelMessages', { channelId: scene.dm.id })).messages.filter(
    (m) => m.userQuestionResolution?.requestMessageId === scene.request.id,
  );
const answerCalls = [];
page.on('request', (request) => {
  if (request.url().endsWith('/api/botharness/userQuestionAnswer'))
    answerCalls.push(JSON.parse(request.postData()).payload.args);
});
try {
  await login(page);
  const release = await prepare('Release Question QA');
  const docs = await prepare('Docs Question QA');
  await inbox();
  assert.deepEqual(
    (await actionRows()).filter((i) => i.kind === 'user-question').map((i) => i.botSlug),
    [release.bot.slug, docs.bot.slug],
  );
  assert.equal(
    await page.$eval('.bh-human-inbox-filters label:last-child select', (n) => n.value),
    'oldest',
  );
  await theme(false);
  await shot(mode === 'before' ? 'before-list-light' : 'after-list-light');
  await theme(true);
  await shot(mode === 'before' ? 'before-list-dark' : 'after-list-dark');
  await theme(false);
  if (mode === 'before') {
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((n) => n.textContent?.trim() === '回答问题'),
      ),
      false,
    );
    await openDM(release.dm.id);
    await page.waitForSelector('.bh-question-card');
    await shot('before-source-dm');
    console.log('BASELINE VERIFIED: Inbox questions require opening the source DM');
  } else {
    await review(release);
    await shot('after-question-light');
    await click('.bh-human-inbox-reply button', '查看附近消息');
    const nearby = await page.$$eval('.bh-human-inbox-reply [data-message-id]', (nodes) =>
      nodes.map((n) => ({
        id: n.getAttribute('data-message-id'),
        at: n.querySelector('time').dateTime,
      })),
    );
    assert.ok(nearby.length > 1);
    assert.ok(nearby.some((n) => n.id === release.request.id));
    assert.deepEqual(
      nearby.map((n) => n.at),
      nearby.map((n) => n.at).sort(),
    );
    await shot('after-context-light');
    await theme(true);
    await shot('after-context-dark');
    await page.setViewport({ width: 900, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot('after-narrow');
    await page.setViewport({ width: 1440, height: 900 });
    await theme(false);
    await click('.bh-human-inbox-reply button', '查看来源');
    await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-reply'));
    await page.waitForSelector(`[data-message-id="${release.request.id}"] .bh-question-card`, {
      visible: true,
    });
    await shot('after-exact-source');
    await review(release);
    await choose('Canary');
    await click('.bh-human-inbox-reply .bh-question-card button', '回答并继续');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已回答'),
    );
    await shot('after-choice');
    assert.deepEqual(
      (await audit(release)).map((m) => m.userQuestionResolution),
      [
        {
          requestMessageId: release.request.id,
          state: 'answered',
          answers: [{ id: 'release-route', selected: ['Canary'] }],
        },
      ],
    );
    const independent = (await actionRows()).some((i) => i.messageId === docs.request.id);
    assert.ok(independent);
    await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: release.dm.id })).messages.some(
          (m) =>
            m.author.kind === 'bot' && m.body.startsWith('ANSWER_QA:') && m.body.includes('Canary'),
        ),
      'real native selected answer',
    );
    await review(docs);
    const input = await page.$('.bh-human-inbox-reply .bh-question-card input');
    await input.type('Nightly QA');
    await click('.bh-human-inbox-reply .bh-question-card button', '回答并继续');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已回答'),
    );
    await shot('after-custom');
    assert.deepEqual(
      (await audit(docs)).map((m) => m.userQuestionResolution),
      [
        {
          requestMessageId: docs.request.id,
          state: 'answered',
          answers: [{ id: 'release-route', selected: [], custom: 'Nightly QA' }],
        },
      ],
    );
    await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: docs.dm.id })).messages.some(
          (m) =>
            m.author.kind === 'bot' &&
            m.body.startsWith('ANSWER_QA:') &&
            m.body.includes('Nightly QA'),
        ),
      'real native custom answer',
    );
    assert.ok(
      answerCalls.some(
        (c) =>
          c.channelId === release.dm.id &&
          c.messageId === release.request.id &&
          c.answer.answers[0].selected[0] === 'Canary',
      ),
    );
    assert.ok(
      answerCalls.some(
        (c) =>
          c.channelId === docs.dm.id &&
          c.messageId === docs.request.id &&
          c.answer.answers[0].custom === 'Nightly QA',
      ),
    );
    const stale = await prepare('Stale Question QA');
    await review(stale);
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.setViewport({ width: 1440, height: 900 });
    await login(second);
    await openDM(stale.dm.id, second);
    await second.waitForSelector('.bh-question-card input');
    await choose('Stable', second);
    await click('.bh-question-card button', '回答并继续', second);
    await waitFor(async () => (await audit(stale)).length === 1, 'second window answer');
    await page.bringToFront();
    await choose('Canary');
    await click('.bh-human-inbox-reply .bh-question-card button', '回答并继续');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('此提问已失效'),
    );
    await shot('after-stale');
    assert.equal((await audit(stale)).length, 1);
    assert.equal(
      (await actionRows()).some((i) => i.messageId === stale.request.id),
      false,
    );
    await secondContext.close();
    const human = await prepare('Human Question QA');
    await review(human);
    await shot('human-qa-ready');
    writeFileSync(
      resolve(out, 'results.json'),
      JSON.stringify(
        {
          realNativeModel: true,
          exactQuestions: true,
          sourceCommand: true,
          sourceNavigation: true,
          choiceAnswer: true,
          customAnswer: true,
          canonicalAudit: true,
          otherBotIndependent: independent,
          oldestFirst: true,
          expandableContext: nearby.length > 1,
          lightDark: 'screenshot-only',
          narrowLayout: true,
          twoWindowStaleRejected: true,
          nativeAnswerVerified: true,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(
      'LIVE DSH VERIFIED: Inbox choice/custom answers, real native responses, exact source and second-window stale rejection',
    );
  }
} catch (error) {
  await shot('failure').catch(() => undefined);
  console.log('E2E failed: ' + error.message);
  throw error;
} finally {
  await browser.close();
}
