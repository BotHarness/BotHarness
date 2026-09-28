/** Live #390 Group management check against an isolated DSH Web Host. */
import { createRequire } from 'node:module';
import { basename, dirname, resolve } from 'node:path';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
if (!origin || !home) throw new Error('Set BH_E2E_ORIGIN and BH_E2E_HOME');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `group-management-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(`${method}: ${response.status} ${JSON.stringify(envelope.result?.error)}`);
  return envelope.result.value;
}

async function waitFor(predicate, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(300);
  }
  throw new Error(`Timed out: ${label}`);
}

async function groupRecord(id) {
  return (await rpc('channels')).channels.find((channel) => channel.id === id);
}

if (process.argv[2] === '--verify-restart') {
  const [, , , groupId, targetSlug, expectedName] = process.argv;
  if (!groupId || !targetSlug || !expectedName) throw new Error('Missing restart check arguments');
  const group = await groupRecord(groupId);
  const invitation = group?.invitations?.find((item) => item.targetBotSlug === targetSlug);
  if (group?.name !== expectedName || !group.avatar || invitation?.inviterHuman !== true)
    throw new Error('Group settings or Human invitation lost after restart');
  const admission = (await rpc('botAttention', { slug: targetSlug })).items.find(
    (item) => item.reason === 'group-invite',
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        groupId,
        name: group.name,
        avatar: true,
        members: group.members,
        invitationStatus: invitation.status,
        botInboxState: admission?.state,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

if (process.argv[2] === '--remove-member') {
  const [, , , groupId, targetSlug] = process.argv;
  if (!groupId || !targetSlug) throw new Error('Missing Group or member');
  if (!(await groupRecord(groupId))?.members.includes(targetSlug))
    throw new Error('Target is not a Group member');
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(origin, { waitUntil: 'networkidle2' });
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Continue')
        ?.click(),
    );
    const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
    await page.waitForSelector(botButton);
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await page.waitForSelector('.bh-root');
    const openSidebar = await page.$('button[aria-label="Open sidebar"]');
    if (openSidebar) await openSidebar.click();
    await page.waitForSelector(`.bh-root [data-channel-id="${groupId}"]`);
    await page.click(`.bh-root [data-channel-id="${groupId}"]`);
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('.bh-channel-sidebar-entry')).find(
        (entry) =>
          ['群管理', 'Group management'].includes(
            entry.querySelector('.bh-channel-sidebar-entry-label')?.textContent ?? '',
          ),
      );
      const button = section?.querySelector('.bh-channel-sidebar-entry-head');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('.bh-group-management .bh-member-row button');
    await page.screenshot({ path: '/tmp/bh390-member-before-removal.png' });
    await page.evaluate(() => {
      const button = Array.from(
        document.querySelectorAll('.bh-group-management .bh-member-row button'),
      ).find((item) => ['移出群聊', 'Remove from Group'].includes(item.textContent?.trim() ?? ''));
      button?.click();
    });
    await waitFor(
      async () => !(await groupRecord(groupId))?.members.includes(targetSlug),
      'member removal',
    );
    console.log(
      JSON.stringify(
        {
          ok: true,
          groupId,
          removed: targetSlug,
          screenshot: '/tmp/bh390-member-before-removal.png',
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
}

if (process.argv[2] === '--join-requests' || process.argv[2] === '--seed-join-request') {
  const groupId = process.argv[3];
  const group = groupId ? await groupRecord(groupId) : undefined;
  if (!group) throw new Error('Group unavailable');
  const bots = [];
  for (const decision of process.argv[2] === '--seed-join-request'
    ? ['accept']
    : ['accept', 'decline']) {
    const bot = (await rpc('create', { displayName: `Join ${decision} ${Date.now()}` })).bot;
    if (!bot?.slug) throw new Error('Join requester unavailable');
    bots.push({ ...bot, decision });
    await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    const body = `Please request to join #${group.name}. Call group_join_request for this selected Group now.`;
    const start = body.indexOf('#');
    await rpc('channelSend', {
      channelId: `dm-${bot.slug}`,
      body,
      channelRefs: [
        { channelId: group.id, label: group.name, start, end: start + group.name.length + 1 },
      ],
    });
    await waitFor(
      async () =>
        Boolean(
          (await groupRecord(group.id))?.joinRequests?.some(
            (request) => request.requesterBotSlug === bot.slug && request.status === 'pending',
          ),
        ),
      `join request from ${bot.slug}`,
      180_000,
    );
  }
  if (process.argv[2] === '--seed-join-request') {
    console.log(
      JSON.stringify({ ok: true, groupId: group.id, requester: bots[0].displayName }, null, 2),
    );
    process.exit(0);
  }
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 960 });
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(origin, { waitUntil: 'networkidle2' });
    await page.evaluate(() =>
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.trim() === 'Continue')
        ?.click(),
    );
    const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
    await page.waitForSelector(botButton);
    if (!(await page.$('.bh-root'))) await page.click(botButton);
    await page.waitForSelector('.bh-root');
    const openSidebar = await page.$('button[aria-label="Open sidebar"]');
    if (openSidebar) await openSidebar.click();
    await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);
    await page.click(`.bh-root [data-channel-id="${group.id}"]`);
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('.bh-channel-sidebar-entry')).find(
        (entry) =>
          ['群管理', 'Group management'].includes(
            entry.querySelector('.bh-channel-sidebar-entry-label')?.textContent ?? '',
          ),
      );
      const button = section?.querySelector('.bh-channel-sidebar-entry-head');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('.bh-group-management');
    await page.screenshot({ path: '/tmp/bh390-join-requests-before.png' });
    for (const bot of bots) {
      const clicked = await page.evaluate(
        ({ name, decision }) => {
          const row = Array.from(
            document.querySelectorAll('.bh-group-management .bh-group-request'),
          ).find((item) => item.textContent?.includes(name));
          const button = Array.from(row?.querySelectorAll('button') ?? []).find((item) =>
            decision === 'accept'
              ? ['Approve', '批准'].includes(item.textContent?.trim() ?? '')
              : ['Decline', '拒绝'].includes(item.textContent?.trim() ?? ''),
          );
          button?.click();
          return Boolean(button);
        },
        { name: bot.displayName, decision: bot.decision },
      );
      if (!clicked) throw new Error(`Missing ${bot.decision} control for ${bot.displayName}`);
      await waitFor(
        async () =>
          Boolean(
            (await groupRecord(group.id))?.joinRequests?.some(
              (request) =>
                request.requesterBotSlug === bot.slug &&
                request.status === (bot.decision === 'accept' ? 'accepted' : 'declined'),
            ),
          ),
        `${bot.decision} decision`,
      );
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    const final = await groupRecord(group.id);
    if (!final.members.includes(bots[0].slug) || final.members.includes(bots[1].slug))
      throw new Error('Join decisions changed the wrong membership');
    console.log(
      JSON.stringify(
        {
          ok: true,
          groupId: group.id,
          accepted: bots[0].slug,
          declined: bots[1].slug,
          screenshot: '/tmp/bh390-join-requests-before.png',
        },
        null,
        2,
      ),
    );
  } finally {
    await browser.close();
  }
  process.exit(0);
}

const stamp = Date.now();
const target = (await rpc('create', { displayName: `Manage Invite ${stamp}` })).bot;
const group = (await rpc('channelCreate', { name: `Manage QA ${stamp}`, members: [] })).channel;
const disposable = (await rpc('channelCreate', { name: `Disband QA ${stamp}`, members: [] }))
  .channel;
if (!target?.slug || !group?.id || !disposable?.id) throw new Error('Missing QA fixtures');

const avatarPath = `/tmp/bh390-avatar-${stamp}.png`;
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.log('Browser console', message.type(), message.text());
  });
  await page.setViewport({ width: 1440, height: 960 });
  await page.setExtraHTTPHeaders({ cookie });
  await page.goto(origin, { waitUntil: 'networkidle2' });
  await page.evaluate(() =>
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click(),
  );
  const botButton = 'button[aria-label="Bot mode"], button[aria-label="Bot 模式"]';
  await page.waitForSelector(botButton);
  if (!(await page.$('.bh-root'))) await page.click(botButton);
  await page.waitForSelector('.bh-root');
  const openSidebar = await page.$('button[aria-label="Open sidebar"]');
  if (openSidebar) await openSidebar.click();
  await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);

  async function openGroup(id) {
    await page.click(`.bh-root [data-channel-id="${id}"]`);
    await page.waitForFunction(
      (channelId) =>
        document
          .querySelector(`.bh-root [data-channel-id="${channelId}"]`)
          ?.classList.contains('bh-selected'),
      {},
      id,
    );
    await page.evaluate(() => {
      const section = Array.from(document.querySelectorAll('.bh-channel-sidebar-entry')).find(
        (entry) =>
          ['群管理', 'Group management'].includes(
            entry.querySelector('.bh-channel-sidebar-entry-label')?.textContent ?? '',
          ),
      );
      const button = section?.querySelector('.bh-channel-sidebar-entry-head');
      if (button?.getAttribute('aria-expanded') === 'false') button.click();
    });
    await page.waitForSelector('.bh-group-management');
  }

  await openGroup(group.id);
  const samplePng = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const context = canvas.getContext('2d');
    context.fillStyle = '#427fe9';
    context.fillRect(0, 0, 64, 64);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  writeFileSync(avatarPath, Buffer.from(samplePng, 'base64'));
  const membersText = await page.$eval('.bh-channel-sidebar-entry', (entry) => entry.textContent);
  if (membersText?.includes('Join requests') || membersText?.includes('Disband Group'))
    throw new Error('Members section still contains management actions');

  const renamed = `Renamed QA ${stamp}`;
  await page.$eval(
    '#bh-group-name',
    (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    },
    renamed,
  );
  await page.click('.bh-group-setting button[type="submit"]');
  await waitFor(async () => (await groupRecord(group.id))?.name === renamed, 'Group rename');

  await (await page.$('.bh-group-avatar-setting input[type="file"]')).uploadFile(avatarPath);
  await waitFor(async () => Boolean((await groupRecord(group.id))?.avatar), 'Group avatar');

  await page.select('.bh-group-management select', target.slug);
  await page.evaluate(() => {
    const button = Array.from(document.querySelectorAll('.bh-group-management button')).find(
      (item) => ['邀请新群员', 'Invite member'].includes(item.textContent?.trim() ?? ''),
    );
    button?.click();
  });
  await waitFor(
    async () =>
      Boolean(
        (await groupRecord(group.id))?.invitations?.some(
          (item) => item.targetBotSlug === target.slug,
        ),
      ),
    'Human invitation',
  );
  const invited = await groupRecord(group.id);
  if (invited.invitations.find((item) => item.targetBotSlug === target.slug)?.inviterHuman !== true)
    throw new Error('Human invitation lost its actor');

  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector(`.bh-root [data-channel-id="${group.id}"]`);
  await openGroup(group.id);
  if ((await groupRecord(group.id))?.name !== renamed || !(await groupRecord(group.id))?.avatar)
    throw new Error('Group settings lost after refresh');
  const geometry = await page.evaluate(() => {
    const measure = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect();
      return rect ? { x: rect.x, right: rect.right, height: rect.height } : null;
    };
    return {
      nativeNewSession: measure('button[aria-label="New Session"], button[aria-label="新会话"]'),
      members: measure('.bh-channel-sidebar-entry-head'),
      groupManagement: measure('.bh-group-management'),
    };
  });
  await page.screenshot({ path: `/tmp/bh390-group-management-${stamp}.png` });

  await openGroup(disposable.id);
  page.once('dialog', (dialog) => void dialog.accept());
  await page.evaluate(() => {
    const button = document.querySelector('.bh-group-management .bh-group-delete-button');
    button?.click();
  });
  await waitFor(async () => (await groupRecord(disposable.id)) === undefined, 'Group disband');
  console.log(
    JSON.stringify(
      {
        ok: true,
        groupId: group.id,
        targetSlug: target.slug,
        renamed,
        avatar: true,
        invitation: true,
        disbanded: disposable.id,
        geometry,
        screenshot: `/tmp/bh390-group-management-${stamp}.png`,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
