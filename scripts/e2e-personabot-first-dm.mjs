// Live DSH tracer bullet for #186. Configure the LLM in DSH; pass only its web token.
// BH_E2E_TOKEN=<token> node scripts/e2e-personabot-first-dm.mjs [--expect-reply]
// Controls for the ablation: --reselect and --wait-ms=3000.
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
if (!token) throw new Error('Set BH_E2E_TOKEN to the local DSH web token');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3099';
const expectReply = process.argv.includes('--expect-reply');
const expectStream = process.argv.includes('--expect-stream');
const reselect = process.argv.includes('--reselect');
const waitMs = Number(process.argv.find((arg) => arg.startsWith('--wait-ms='))?.split('=')[1] ?? 0);
if (!Number.isSafeInteger(waitMs) || waitMs < 0 || waitMs > 30000) {
  throw new Error('--wait-ms must be an integer from 0 to 30000');
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const name = `FirstDmE2E-${Date.now()}`;
const nonce = String(Date.now());
const prompt = `请只回复一句：你好，我已收到这条测试消息。验证码 ${nonce}`;
const calls = [];
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

try {
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    const probe = {
      baselines: 0,
      updates: 0,
      settled: 0,
      abandoned: 0,
      maxBodyLength: 0,
      revisionContiguous: true,
      bodyPrefixMonotonic: true,
      lastRevision: 0,
      bodies: {},
    };
    window.__bhDraftProbe = probe;
    const original = EventSource.prototype.addEventListener;
    EventSource.prototype.addEventListener = function (name, listener, options) {
      if (
        name === 'channel/draft-baseline' ||
        name === 'channel/draft' ||
        name === 'channel/draft-settled' ||
        name === 'channel/draft-abandoned'
      ) {
        original.call(
          this,
          name,
          (event) => {
            try {
              const frame = JSON.parse(event.data);
              if (name === 'channel/draft-baseline') {
                probe.baselines += 1;
                probe.lastRevision = frame.revision;
                probe.bodies = Object.fromEntries(
                  frame.drafts.map((draft) => [draft.draftId, draft.body]),
                );
                return;
              }
              if (frame.revision !== probe.lastRevision + 1) probe.revisionContiguous = false;
              probe.lastRevision = frame.revision;
              if (name === 'channel/draft') {
                probe.updates += 1;
                probe.maxBodyLength = Math.max(probe.maxBodyLength, frame.body.length);
                const previous = probe.bodies[frame.draftId];
                if (previous !== undefined && !frame.body.startsWith(previous)) {
                  probe.bodyPrefixMonotonic = false;
                }
                probe.bodies[frame.draftId] = frame.body;
              } else {
                if (name === 'channel/draft-settled') probe.settled += 1;
                else probe.abandoned += 1;
                delete probe.bodies[frame.draftId];
              }
            } catch {
              probe.revisionContiguous = false;
            }
          },
          options,
        );
      }
      return original.call(this, name, listener, options);
    };
  });
  await page.setViewport({ width: 1440, height: 960 });
  page.on('response', async (response) => {
    if (!response.url().includes('/api/botharness/')) return;
    try {
      const request = JSON.parse(response.request().postData() ?? '{}');
      if (
        [
          'botharness/create',
          'botharness/channelDm',
          'botharness/channelTimeline',
          'botharness/channelSend',
        ].includes(request.method)
      ) {
        const envelope = await response.json();
        calls.push({ method: request.method, status: response.status(), ok: envelope.result?.ok });
      }
    } catch {
      // The verdict uses the visible UI and a fresh authoritative Host read.
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
      .find((button) => ['BOT 模式', 'Bot mode'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await sleep(900);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Configure later')
      ?.click();
    document.querySelector('button[aria-label="新建"], button[aria-label="New"]')?.click();
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('[role="menuitem"]'))
      .find((item) => item.textContent?.includes('PersonaBot'))
      ?.click();
  });
  await page.type('input[placeholder="例如：小研"], input[placeholder="e.g. Xiao Yan"]', name);
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => ['创建', 'Create'].includes(button.textContent?.trim() ?? ''))
      ?.click();
  });
  await page.waitForSelector(
    'textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]',
    { timeout: 10000 },
  );
  if (reselect) {
    await page.evaluate((botName) => {
      Array.from(document.querySelectorAll('button'))
        .find((button) => button.textContent?.includes(botName))
        ?.click();
    }, name);
    await sleep(500);
  }
  if (waitMs > 0) await sleep(waitMs);
  await page.type('textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]', prompt);
  await page.evaluate(() =>
    document.querySelector('button[aria-label="发送"], button[aria-label="Send"]')?.click(),
  );
  let visible = false;
  try {
    await page.waitForFunction(
      (body) =>
        Array.from(document.querySelectorAll('.bh-message-group-me .bh-bubble-body')).some(
          (bubble) => bubble.textContent === body && !bubble.closest('.bh-bubble-pending'),
        ),
      { timeout: 6000 },
      prompt,
    );
    visible = true;
  } catch {
    // Return a safe failure verdict rather than a token-bearing URL.
  }
  const draftRetained = await page.evaluate(() =>
    Boolean(
      document.querySelector('textarea[placeholder^="发消息给"], textarea[placeholder^="Message "]')
        ?.value,
    ),
  );
  const readCommitted = () =>
    page.evaluate(
      async (botName, body, replyNonce) => {
        const rpc = async (method, args) => {
          const response = await fetch(`/api/botharness/${method}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              type: 'client-request',
              rpcId: `e2e-first-dm-${method}`,
              method: `botharness/${method}`,
              payload: { args },
            }),
          });
          const envelope = await response.json();
          if (envelope.result?.ok !== true) throw new Error(`${method} read failed`);
          return envelope.result.value;
        };
        const channels = await rpc('channels', {});
        const matchingChannels = channels.channels.filter(
          (item) => item.type === 'dm' && item.name === botName,
        );
        const channel = matchingChannels[0];
        if (!channel) throw new Error('new DM not found');
        const timeline = await rpc('channelTimeline', { channelId: channel.id });
        return {
          dmCount: matchingChannels.length,
          humanCount: timeline.page.entries.filter(
            (item) => item.author.kind === 'human' && item.body === body,
          ).length,
          botCount: timeline.page.entries.filter((item) => item.author.kind === 'bot').length,
          replyContainsNonce: timeline.page.entries.some(
            (item) => item.author.kind === 'bot' && item.body.includes(replyNonce),
          ),
        };
      },
      name,
      prompt,
      nonce,
    );
  const committed = await readCommitted();
  let final = committed;
  let replyVisible = false;
  if (expectReply && visible && committed.humanCount === 1) {
    const deadline = Date.now() + 120000;
    while (!final.replyContainsNonce && Date.now() < deadline) {
      await sleep(500);
      final = await readCommitted();
    }
    if (final.replyContainsNonce) {
      try {
        await page.waitForFunction(
          (replyNonce) =>
            Array.from(
              document.querySelectorAll(
                '.bh-message-group:not(.bh-message-group-me) .bh-bubble-body',
              ),
            ).some(
              (bubble) =>
                bubble.textContent?.includes(replyNonce) && !bubble.closest('.bh-bubble-pending'),
            ),
          { timeout: 8000 },
          nonce,
        );
        replyVisible = true;
      } catch {
        // A committed message that missed UI delivery is still a failing E2E.
      }
    }
  }
  const draftStream = await page.evaluate(() => {
    const metrics = { ...window.__bhDraftProbe };
    delete metrics.bodies;
    return metrics;
  });
  const passed =
    visible &&
    !draftRetained &&
    final.dmCount === 1 &&
    final.humanCount === 1 &&
    (!expectReply || (replyVisible && final.replyContainsNonce)) &&
    (!expectStream ||
      (draftStream.updates > 0 &&
        draftStream.settled > 0 &&
        draftStream.revisionContiguous &&
        draftStream.bodyPrefixMonotonic));
  console.log(
    JSON.stringify({
      verdict: passed ? 'PASS' : 'FAIL',
      scenario: { reselect, waitMs, expectReply, expectStream },
      draftStream,
      botName: name,
      visible,
      draftRetained,
      humanCommitted: final.humanCount,
      dmCount: final.dmCount,
      replyVisible,
      botCommitted: final.botCount,
      calls,
      replyContainsNonce: final.replyContainsNonce,
    }),
  );
  if (!passed) process.exitCode = 1;
} catch (error) {
  console.error(String(error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  await browser.close();
}
