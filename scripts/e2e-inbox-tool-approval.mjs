import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_APPROVAL_QA_PORT ?? 31994);
const home = resolve(
  process.env.BH_APPROVAL_QA_HOME ?? resolve(tmpdir(), 'bh-550-inbox-tool-approval-final'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-550', mode === 'before' ? 'before' : 'evidence');
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
  protocolTimeout: 30000,
  args: ['--no-sandbox'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
const delay = (ms) => new Promise((done) => setTimeout(done, ms));
const shot = (name) => page.screenshot({ path: resolve(out, name + '.png') });
const rpc = async (method, args = {}, client = page, namespace = 'botharness') =>
  client.evaluate(
    async ({ method, args, namespace }) => {
      const response = await fetch('/api/' + namespace + '/' + method, {
        method: 'POST',
        signal: AbortSignal.timeout(30000),
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
        'Follow the Human precisely. Use bash only once when asked. After its approval or rejection, report with channel_send in your DM. Do not retry denied calls. Do not create Assignments.',
    })
  ).bot;
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  await rpc('channelSend', {
    channelId: dm.id,
    messageId: 'human-' + crypto.randomUUID(),
    body: 'Use native bash exactly once with command "echo BH_INBOX_APPROVAL_QA" (no workdir, no escalation). After the actual result, send one DM channel_send message beginning APPROVED_QA: and including actual stdout. If Human rejects, send DENIED_QA: rejected; do not retry. Wait for the approval; never claim it ran before the tool returns.',
  });
  const request = await waitFor(
    async () =>
      (await rpc('channelMessages', { channelId: dm.id })).messages.find(
        (m) => m.toolApprovalRequest,
      ),
    'native model approval',
  );
  assert.equal(request.toolApprovalRequest.toolName, 'bash');
  assert.ok(request.toolApprovalRequest.input.includes('BH_INBOX_APPROVAL_QA'));
  console.log('Live native approval ready: ' + name);
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
  assert.ok(
    await page.evaluate((name) => {
      const row = [...document.querySelectorAll('.bh-human-inbox-row')].find((n) =>
        n.textContent?.includes(name),
      );
      const b = [...row.querySelectorAll('button')].find(
        (b) => b.textContent?.trim() === '处理审批',
      );
      b?.click();
      return !!b;
    }, scene.bot.displayName),
  );
  await page.waitForSelector('.bh-human-inbox-reply .bh-tool-approval-actions');
  assert.equal(
    await page.$eval('.bh-tool-approval-input', (n) => n.textContent),
    scene.request.toolApprovalRequest.input,
  );
  assert.equal(await page.$('.bh-human-inbox-reply textarea'), null);
};
const audit = async (scene) =>
  (await rpc('channelMessages', { channelId: scene.dm.id })).messages.filter(
    (m) => m.toolApprovalDecision?.requestMessageId === scene.request.id,
  );
try {
  await login(page);
  const release = await prepare('Release QA');
  const docs = await prepare('Docs QA');
  await inbox();
  const items = await actionRows();
  assert.deepEqual(
    items.filter((i) => i.kind === 'tool-approval').map((i) => i.botSlug),
    [release.bot.slug, docs.bot.slug],
  );
  if (mode !== 'before')
    assert.equal(
      await page.$eval('.bh-human-inbox-filters label:last-child select', (n) => n.value),
      'oldest',
    );
  await shot(mode === 'before' ? 'before-list-light' : 'after-list-light');
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
  await shot(mode === 'before' ? 'before-list-dark' : 'after-list-dark');
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
  if (mode === 'before') {
    assert.equal(
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some((n) => n.textContent?.trim() === '处理审批'),
      ),
      false,
    );
    await openDM(release.dm.id);
    await page.waitForSelector('.bh-tool-approval-actions');
    await shot('before-source-dm');
    console.log('BASELINE VERIFIED: Inbox requires opening source DM to decide');
  } else {
    await review(release);
    await shot('after-approval-light');
    await click('.bh-human-inbox-reply button', '查看附近消息');
    await shot('after-context-light');
    await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', 'true'));
    await shot('after-context-dark');
    await page.setViewport({ width: 900, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await shot('after-narrow');
    await page.setViewport({ width: 1440, height: 900 });
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'));
    await click('.bh-human-inbox-reply .bh-tool-approval-card button', '仅批准这一次');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已批准这一次调用'),
    );
    await shot('after-approved');
    assert.equal((await audit(release)).length, 1);
    assert.equal((await audit(release))[0].toolApprovalDecision.outcome, 'allowed-once');
    assert.ok((await actionRows()).some((i) => i.messageId === docs.request.id));
    const realReply = await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: release.dm.id })).messages.find(
          (m) =>
            m.author.kind === 'bot' &&
            m.body.startsWith('APPROVED_QA:') &&
            m.body.includes('BH_INBOX_APPROVAL_QA'),
        ),
      'native tool result',
    );
    await review(docs);
    await click('.bh-human-inbox-reply .bh-tool-approval-card button', '拒绝');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('已拒绝这一次调用'),
    );
    await shot('after-rejected');
    assert.equal((await audit(docs))[0].toolApprovalDecision.outcome, 'rejected');
    await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: docs.dm.id })).messages.find((m) =>
          m.body.startsWith('DENIED_QA:'),
        ),
      'rejected native caller',
    );
    const stale = await prepare('Stale QA');
    await review(stale);
    const secondContext = await browser.createBrowserContext();
    const second = await secondContext.newPage();
    await second.setViewport({ width: 1440, height: 900 });
    await login(second);
    await openDM(stale.dm.id, second);
    await second.waitForSelector('.bh-tool-approval-actions');
    await click('.bh-tool-approval-card button', '仅批准这一次', second);
    await waitFor(async () => (await audit(stale)).length === 1, 'second window decision');
    await page.bringToFront();
    await click('.bh-human-inbox-reply .bh-tool-approval-card button', '仅批准这一次');
    await page.waitForFunction(() =>
      document.querySelector('.bh-human-inbox-reply')?.textContent?.includes('此请求已失效'),
    );
    await shot('after-stale');
    assert.equal((await audit(stale)).length, 1);
    assert.equal(
      (await actionRows()).some((i) => i.messageId === stale.request.id),
      false,
    );
    await secondContext.close();
    const human = await prepare('Human Review QA');
    await review(human);
    await click('.bh-human-inbox-reply button', '查看来源');
    await page.waitForSelector(`[data-message-id="${human.request.id}"]`);
    await shot('after-exact-source');
    await review(human);
    writeFileSync(
      resolve(out, 'results.json'),
      JSON.stringify(
        {
          realModel: true,
          exactInput: true,
          sourceCommand: true,
          sourceNavigation: true,
          approve: true,
          reject: true,
          canonicalAudit: true,
          otherBotIndependent: true,
          oldestFirst: true,
          expandableContext: true,
          twoWindowStaleRejected: true,
          lightDark: true,
          narrowLayout: true,
          nativeOutputVerified: realReply.body.includes('BH_INBOX_APPROVAL_QA'),
        },
        null,
        2,
      ) + '\n',
    );
    await shot('human-qa-ready');
    console.log(
      'LIVE DSH VERIFIED: Inbox approve/reject, real native tool results, canonical audit and second-window stale rejection',
    );
  }
} catch (error) {
  await shot('failure').catch(() => undefined);
  console.log('E2E failed: ' + error.message);
  throw error;
} finally {
  await browser.close();
}
