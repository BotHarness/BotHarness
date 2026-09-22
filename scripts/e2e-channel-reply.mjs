// Live DSH browser tracer bullet for #145. Use an isolated profile; no model call is needed.
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable in this workspace install');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN to the isolated DSH web token');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3101';
const nonce = String(Date.now());
const name = `ReplyE2E-${nonce}`;
const originalBody = `original-${nonce}`;
const latestBody = `latest-${nonce}`;
const replyBody = `ui-reply-${nonce}`;
const olderReplyBody = `older-reply-${nonce}`;
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const calls = [];
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 960 });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/botharness/channelTimeline')) return;
    try {
      const request = JSON.parse(response.request().postData() ?? '{}');
      const args = request.payload?.args ?? {};
      calls.push(args.direction === 'newer' ? 'newer' : (args.around ?? 'latest'));
    } catch {
      // The DOM and authoritative RPC read below decide the verdict.
    }
  });
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) =>
        ['BOT \\u6a21\\u5f0f', 'Bot mode'].includes(button.textContent?.trim() ?? ''),
      )
      ?.click();
  });
  await page.waitForFunction(
    () => document.querySelector('button[aria-label="\\u65b0\\u5efa"], button[aria-label="New"]'),
    { timeout: 10000 },
  );
  const ids = await page.evaluate(
    async (channelName, original, latest) => {
      const rpc = async (method, args) => {
        const response = await fetch(`/api/botharness/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `reply-e2e-${method}-${Math.random()}`,
            method: `botharness/${method}`,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true)
          throw new Error(`${method}: ${JSON.stringify(envelope.result ?? envelope)}`);
        return envelope.result.value;
      };
      const created = await rpc('channelCreate', { name: channelName, members: [] });
      const channelId = created.channel.id;
      const first = await rpc('channelSend', { channelId, body: original });
      for (let i = 0; i < 65; i += 1) {
        await rpc('channelSend', { channelId, body: i === 64 ? latest : `filler-${i}` });
      }
      return { channelId, originalId: first.message.id };
    },
    name,
    originalBody,
    latestBody,
  );
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) =>
        ['BOT \\u6a21\\u5f0f', 'Bot mode'].includes(button.textContent?.trim() ?? ''),
      )
      ?.click();
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
  });
  await page.waitForFunction(
    (channelName) =>
      Array.from(document.querySelectorAll('button')).some((button) =>
        button.textContent?.includes(channelName),
      ),
    { timeout: 10000 },
    name,
  );
  await page.evaluate((channelName) => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes(channelName))
      ?.click();
  }, name);
  await page.waitForSelector(
    'textarea[placeholder^="\\u53d1\\u6d88\\u606f\\u7ed9"], textarea[placeholder^="Message "]',
    { timeout: 10000 },
  );
  await page.waitForFunction(
    (body) =>
      Array.from(document.querySelectorAll('.bh-bubble-wrap')).some((wrap) =>
        wrap.textContent?.includes(body),
      ),
    { timeout: 10000 },
    latestBody,
  );
  const selectReply = async () => {
    const wraps = await page.$$('.bh-bubble-wrap');
    const target = (
      await Promise.all(
        wraps.map(async (wrap) => ({
          wrap,
          contains: await wrap.evaluate(
            (node, body) => node.textContent?.includes(body),
            latestBody,
          ),
        })),
      )
    ).find((item) => item.contains)?.wrap;
    if (!target) throw new Error('latest bubble missing');
    await target.click({ button: 'right' });
    await page.waitForSelector('div[role="menu"] button', { timeout: 5000 });
    const selected = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll('div[role="menu"] button')).find((item) =>
        ['\\u56de\\u590d', 'Reply'].includes(item.textContent?.trim() ?? ''),
      );
      button?.click();
      return Boolean(button);
    });
    if (!selected) throw new Error('reply menu item missing');
  };
  await selectReply();
  await page.waitForSelector('.bh-composer-reply', { timeout: 5000 });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.querySelector('.bh-composer-reply'), {
    timeout: 5000,
  });
  await selectReply();
  const input =
    'textarea[placeholder^="\\u53d1\\u6d88\\u606f\\u7ed9"], textarea[placeholder^="Message "]';
  await page.type(input, replyBody);
  await page.evaluate(() =>
    document
      .querySelector('button[aria-label="\\u53d1\\u9001"], button[aria-label="Send"]')
      ?.click(),
  );
  await page.waitForFunction(
    (body) =>
      Array.from(document.querySelectorAll('.bh-bubble-wrap')).some(
        (wrap) =>
          wrap.textContent?.includes(body) &&
          !wrap.querySelector('.bh-bubble-pending') &&
          wrap.querySelector('.bh-bubble-reply'),
      ),
    { timeout: 10000 },
    replyBody,
  );
  const host = await page.evaluate(
    async (channelId, originalId, uiBody, oldBody) => {
      const rpc = async (method, args) => {
        const response = await fetch(`/api/botharness/${method}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            type: 'client-request',
            rpcId: `reply-e2e-check-${method}-${Math.random()}`,
            method: `botharness/${method}`,
            payload: { args },
          }),
        });
        const envelope = await response.json();
        if (envelope.result?.ok !== true)
          throw new Error(`${method}: ${JSON.stringify(envelope.result ?? envelope)}`);
        return envelope.result.value;
      };
      const before = await rpc('channelTimeline', { channelId });
      const uiReply = before.page.entries.find((item) => item.body === uiBody);
      const oldReply = await rpc('channelSend', { channelId, body: oldBody, replyTo: originalId });
      return {
        uiReplyTo: uiReply?.replyTo,
        uiPreview: uiReply?.replyToPreview?.body,
        oldReplyId: oldReply.message.id,
        oldPreview: oldReply.message.replyToPreview?.body,
      };
    },
    ids.channelId,
    ids.originalId,
    replyBody,
    olderReplyBody,
  );
  await page.waitForFunction(
    (body) =>
      Array.from(document.querySelectorAll('.bh-bubble-wrap')).some(
        (wrap) => wrap.textContent?.includes(body) && wrap.querySelector('.bh-bubble-reply'),
      ),
    { timeout: 10000 },
    olderReplyBody,
  );
  const wraps = await page.$$('.bh-bubble-wrap');
  const older = (
    await Promise.all(
      wraps.map(async (wrap) => ({
        wrap,
        contains: await wrap.evaluate(
          (node, body) => node.textContent?.includes(body),
          olderReplyBody,
        ),
      })),
    )
  ).find((item) => item.contains)?.wrap;
  if (!older) throw new Error('old-target reply bubble missing');
  await older.$('.bh-bubble-reply').then((quote) => quote?.click());
  await page.waitForFunction(
    (targetId) =>
      Boolean(
        Array.from(document.querySelectorAll('[data-message-id]')).find(
          (item) =>
            item.getAttribute('data-message-id') === targetId &&
            item.classList.contains('bh-bubble-focused'),
        ),
      ),
    { timeout: 10000 },
    ids.originalId,
  );
  const latestVisible = async () =>
    page.evaluate(
      (body) =>
        Array.from(document.querySelectorAll('.bh-bubble-wrap')).some((wrap) =>
          wrap.textContent?.includes(body),
        ),
      latestBody,
    );
  if (await latestVisible()) throw new Error('around page unexpectedly contains latest message');
  const paginationDeadline = Date.now() + 10000;
  while (Date.now() < paginationDeadline && !(await latestVisible())) {
    await page.evaluate(() => {
      const pane = document.querySelector('.bh-chat-body');
      if (!pane) throw new Error('Channel scroll pane missing');
      pane.scrollTop = pane.scrollHeight;
      pane.dispatchEvent(new Event('scroll', { bubbles: true }));
    });
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  const reachedLatestByScroll = await latestVisible();
  const verdict =
    reachedLatestByScroll &&
    calls.includes('newer') &&
    host.uiReplyTo !== undefined &&
    host.uiPreview === latestBody &&
    host.oldPreview === originalBody &&
    calls.includes(ids.originalId) &&
    !(await page.$('.bh-composer-reply'));
  console.log(
    JSON.stringify({
      verdict: verdict ? 'PASS' : 'FAIL',
      channel: name,
      uiReplyCommitted: host.uiReplyTo !== undefined,
      uiPreview: host.uiPreview,
      oldPreview: host.oldPreview,
      aroundCalled: calls.includes(ids.originalId),
      originalHighlighted: true,
      reachedLatestByScroll,
      newerCalled: calls.includes('newer'),
    }),
  );
  if (!verdict) process.exitCode = 1;
} catch (error) {
  console.error(String(error).replace(/token=[^&\s]+/gu, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
