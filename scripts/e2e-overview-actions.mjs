import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? 'check';
const port = Number(process.env.BH_OVERVIEW_QA_PORT ?? 32017);
const home = resolve(
  process.env.BH_OVERVIEW_QA_HOME ?? resolve(tmpdir(), 'bh-698-overview-actions'),
);
const out = resolve(repo, '.humanlayer/tasks/issue-698', mode === 'before' ? 'before' : 'evidence');
mkdirSync(out, { recursive: true });
const url = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}-${port}.log`), 'utf8').match(
  /http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9._-]+/u,
)?.[0];
assert.ok(url, 'Launch isolated DSH first');
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
const shot = (name) =>
  page.screenshot({
    path: resolve(
      out,
      name + (mode === 'resume' && name !== 'overview-restarted' ? '-restart' : '') + '.png',
    ),
  });
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
  await client.waitForSelector('.bh-panel-activity', { timeout: 5000 }).catch(async () => {
    await client.evaluate(() =>
      [...document.querySelectorAll('button')]
        .find((n) => n.textContent?.includes('Bot 模式'))
        ?.click(),
    );
    await client.waitForSelector('.bh-panel-activity');
  });
};
const _inbox = async (client = page) => {
  await client.bringToFront();
  await client.evaluate(() => document.querySelector('.bh-panel-activity')?.click());
  await client.waitForSelector('.bh-human-inbox-tabs');
  await click('.bh-human-inbox-tabs button', '需要我处理', client);
  await delay(700);
};
const _openDM = async (id, client = page) => {
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

const overview = async (client = page) => {
  await client.evaluate(() => document.querySelector('.bh-panel-activity')?.click());
  await client.waitForSelector('.bh-activity-center-header');
  await click('.bh-activity-center-header [role=tab]', '总览', client);
  await client.waitForSelector('.bh-overview');
  await client.waitForSelector('.bh-overview-bot');
};

try {
  await login(page);
  if (mode === 'prepare') {
    const all = (await rpc('list')).bots;
    const bot = async (displayName, persona) =>
      all.find((b) => b.displayName === displayName) ??
      (await rpc('create', { displayName, persona })).bot;
    const decision = await bot(
      'Release Choice QA',
      'Follow the Human precisely. Use native ask_user_question once when requested, then wait. Do not create Assignments.',
    );
    const execution = await bot(
      'Session Tiles QA',
      'Follow the Human exactly. Create one requested Assignment. Use native pwsh only for the explicit timed print command. Await approvals. No other commands or child agents.',
    );
    const idle = await bot(
      'Idle QA',
      'Reply only with the requested marker. Do not call any tools except channel_send, or create an Assignment.',
    );
    const idleDm = (await rpc('channelDm', { slug: idle.slug })).channel;
    if (
      !(await rpc('channelMessages', { channelId: idleDm.id })).messages?.some(
        (m) => m.author.kind === 'bot' && m.body.includes('IDLE_READY'),
      )
    )
      await rpc('channelSend', {
        channelId: idleDm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Send one Channel reply exactly IDLE_READY. Do nothing else.',
      });
    const dm = (await rpc('channelDm', { slug: execution.slug })).channel;
    const project = resolve(home, 'tile-qa-project');
    mkdirSync(project, { recursive: true });
    const workspace = (await rpc('create', { request: { path: project } }, page, 'workspace'))
      .workspace;
    if (
      !(await rpc('grants', { slug: execution.slug })).grants.some(
        (g) => !g.revokedAt && g.workspaceId === workspace.workspaceId,
      )
    )
      await rpc('grantCreate', { slug: execution.slug, workspaceId: workspace.workspaceId });
    if (
      (await rpc('humanAttention', { category: 'action', botSlug: execution.slug })).items.filter(
        (i) => i.kind === 'tool-approval',
      ).length < 2
    )
      await rpc('channelSend', {
        channelId: dm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'First create_assignment exactly once using the existing active Grant. Purpose: use native pwsh to run node -e "setTimeout(()=>console.log(\'ASSIGNMENT_TILE_READY\'),180000)"; wait for approval, then after actual completion report_to_orchestrator state completed summary ASSIGNMENT_TILE_READY. No child agents. After creating this Assignment, Orchestrator must use native pwsh itself to run node -e "setTimeout(()=>console.log(\'ORCHESTRATOR_TILE_READY\'),180000)". Await Human approval and actual completion, then send one DM ORCHESTRATOR_TILE_READY. Never bash; omit workdir for Orchestrator. These commands only wait and print. Do not run anything else.',
      });
    const choiceDm = (await rpc('channelDm', { slug: decision.slug })).channel;
    if (
      !(await rpc('humanAttention', { category: 'action', botSlug: decision.slug })).items.some(
        (i) => i.kind === 'user-question',
      )
    )
      await rpc('channelSend', {
        channelId: choiceDm.id,
        messageId: 'human-' + crypto.randomUUID(),
        body: 'Call native ask_user_question once: id release-route; question "Which release channel should I use?"; options Canary and Stable. Wait for the Human answer; no Assignment.',
      });
    await waitFor(
      async () =>
        (await rpc('humanAttention', { category: 'action', botSlug: decision.slug })).items.some(
          (i) => i.kind === 'user-question',
        ),
      'native question',
    );
    await waitFor(
      async () =>
        (await rpc('humanAttention', { category: 'action', botSlug: execution.slug })).items.filter(
          (i) => i.kind === 'tool-approval',
        ).length >= 2,
      'root approvals',
    );
    await waitFor(
      async () =>
        (await rpc('channelMessages', { channelId: idleDm.id })).messages.some(
          (m) => m.author.kind === 'bot' && m.body.includes('IDLE_READY'),
        ),
      'live model reply',
    );
    writeFileSync(
      resolve(out, 'scene.json'),
      JSON.stringify(
        { decision: decision.slug, execution: execution.slug, idle: idle.slug },
        null,
        2,
      ),
    );
    console.log('PASS: live model reply, real native question and native root approvals');
  } else {
    await overview();
    const state = await rpc('activityOverview');
    const geometry = await page.evaluate(() => {
      const n = document.querySelector('.bh-overview');
      return { width: n.clientWidth, scrollWidth: n.scrollWidth };
    });
    assert.ok(geometry.scrollWidth <= geometry.width);
    await theme(false);
    await shot('overview-actions-light');
    await theme(true);
    await shot('overview-actions-dark');
    if (mode === 'snapshot') {
      console.log('PASS: real Overview captures ' + JSON.stringify(geometry));
    } else {
      const scene = JSON.parse(readFileSync(resolve(out, 'scene.json'), 'utf8'));
      assert.equal(await page.$('[data-bot-id="' + scene.idle + '"]'), null);
      assert.ok(await page.$('[data-bot-id="' + scene.decision + '"]'));
      await click('.bh-overview-toolbar button', '显示空闲 Bot');
      assert.ok(await page.$('[data-bot-id="' + scene.idle + '"]'));
      await shot('overview-all-bots-light');
      await click('.bh-overview-toolbar button', '隐藏空闲 Bot');
      await page.waitForSelector('[data-bot-id="' + scene.decision + '"] [data-attention-id]');
      await click(
        '[data-bot-id="' + scene.decision + '"] .bh-human-inbox-row-actions button',
        '回答问题',
      );
      await page.waitForSelector('.bh-question-card');
      await theme(false);
      await shot('overview-question-light');
      await theme(true);
      await shot('overview-question-dark');
      await page.evaluate(() =>
        [...document.querySelectorAll('.bh-question-option > span')]
          .find((n) => n.textContent === 'Stable')
          ?.closest('button')
          ?.click(),
      );
      await click('.bh-question-card button', '回答并继续');
      await waitFor(
        async () =>
          !(
            await rpc('humanAttention', { category: 'action', botSlug: scene.decision })
          ).items.some((i) => i.kind === 'user-question'),
        'question settled',
      );
      assert.ok(await page.$('.bh-overview'));
      assert.equal(
        (await page.$('.bh-activity-center-header [role=tab][aria-selected=true]')) !== null,
        true,
      );
      await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-action-dialog'));
      await theme(false);
      await shot('overview-question-handled-light');
      const approvals = (
        await rpc('humanAttention', { category: 'action', botSlug: scene.execution })
      ).items.filter((i) => i.kind === 'tool-approval');
      for (const item of approvals) {
        await page.waitForSelector('[data-attention-id="' + item.id + '"]');
        await click(
          '[data-attention-id="' + item.id + '"] .bh-human-inbox-row-actions button',
          '处理审批',
        );
        await page.waitForSelector('.bh-tool-approval-card');
        await click('.bh-tool-approval-card button', '仅批准这一次');
        await waitFor(
          async () =>
            !(
              await rpc('humanAttention', { category: 'action', botSlug: scene.execution })
            ).items.some((i) => i.id === item.id),
          'approval settled',
        );
        const close = await page.$('.bh-human-inbox-action-dialog button[aria-label="关闭"]');
        if (close) await close.click();
        await page.waitForFunction(() => !document.querySelector('.bh-human-inbox-action-dialog'));
      }
      const active = await waitFor(async () => {
        const current = (await rpc('activityOverview')).bots.find(
          (b) => b.slug === scene.execution,
        );
        return current?.sessions.length === 2 ? current : false;
      }, 'executing root tiles');
      assert.deepEqual(
        new Set(active.sessions.map((s) => s.role)),
        new Set(['orchestrator', 'assignment']),
      );
      for (const session of active.sessions)
        await rpc(
          'rename',
          {
            request: {
              sessionId: session.sessionId,
              title:
                session.role === 'orchestrator'
                  ? 'Release coordination'
                  : 'Verify release artifact',
            },
          },
          page,
          'session',
        );
      await click('.bh-overview-toolbar button', '刷新');
      await page.waitForFunction(
        () =>
          document.querySelector('.bh-overview')?.textContent.includes('Release coordination') &&
          document.querySelector('.bh-overview')?.textContent.includes('Verify release artifact'),
      );
      const tiles = await page.$$eval('.bh-overview-session', (ns) =>
        ns.map((n) => ({
          label: n.getAttribute('aria-label'),
          height: n.getBoundingClientRect().height,
          role: n.querySelector('[role=img]')?.getAttribute('aria-label'),
        })),
      );
      assert.ok(tiles.every((t) => t.height <= 44 && t.role));
      await theme(false);
      await shot('overview-tiles-light');
      await theme(true);
      await shot('overview-tiles-dark');
      const first = active.sessions[0];
      await rpc(
        'rename',
        { request: { sessionId: first.sessionId, title: 'Renamed live coordination' } },
        page,
        'session',
      );
      await page.waitForFunction(() =>
        document.querySelector('.bh-overview')?.textContent.includes('Renamed live coordination'),
      );
      for (const session of active.sessions) {
        await page.click('[data-session-id="' + session.sessionId + '"] button');
        await page.waitForFunction(() => !document.querySelector('.bh-overview'));
        await page.waitForSelector('.bh-session-return-action');
        await login(page);
        await overview();
      }
      await page.setViewport({ width: 420, height: 860, deviceScaleFactor: 1 });
      await shot('overview-narrow');
      assert.ok(await page.$eval('.bh-overview', (n) => n.scrollWidth <= n.clientWidth));
      writeFileSync(
        resolve(out, 'verification.json'),
        JSON.stringify(
          {
            passed: true,
            actionsBefore: state.actionCount,
            geometry,
            tiles,
            assertions: [
              'default hides idle',
              'waiting Bot remains',
              'show idle',
              'native question answered in Overview',
              'both native timed commands approved in Overview',
              'both executing root roles',
              'native titles and live rename',
              'exact native Session navigation',
              'narrow overflow',
            ],
          },
          null,
          2,
        ),
      );
      console.log('PASS: real actions and named root tiles ' + JSON.stringify(tiles));
    }
  }
} catch (error) {
  await shot('failure').catch(() => undefined);
  throw error;
} finally {
  await browser.close();
}
