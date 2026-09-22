// Live DSH regression for #208: committed roster placement crosses browser windows.
import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pnpm = resolve(root, 'node_modules/.pnpm');
const puppeteerDir = readdirSync(pnpm).find((entry) => entry.startsWith('puppeteer@'));
if (!puppeteerDir) throw new Error('Puppeteer is unavailable');
const puppeteer = createRequire(resolve(pnpm, puppeteerDir, 'node_modules/'))('puppeteer');
const token = process.env.BH_E2E_TOKEN;
if (!token) throw new Error('Set BH_E2E_TOKEN');
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3102';
const nonce = Date.now();
const names = [`RosterA-${nonce}`, `RosterB-${nonce}`];
const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});

async function enterBotMode(page) {
  await page.goto(`${origin}/?token=${encodeURIComponent(token)}`, {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });
  await page.evaluate(() => {
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.trim() === 'Continue')
      ?.click();
    document.querySelector('button[aria-label="Open sidebar"]')?.click();
    document.querySelector('button[aria-label="Bot mode"], button[aria-label="BOT 模式"]')?.click();
  });
  try {
    await page.waitForSelector('button[aria-label="新建"], button[aria-label="New"]', {
      timeout: 15000,
    });
  } catch (error) {
    console.error(
      'BOT_MODE_DEBUG',
      page.url(),
      await page.evaluate(() => ({
        text: document.body.innerText.slice(0, 800),
        buttons: Array.from(document.querySelectorAll('button'))
          .map((button) => [button.textContent?.slice(0, 30), button.getAttribute('aria-label')])
          .slice(0, 35),
      })),
    );
    throw error;
  }
}

async function rpc(page, method, args) {
  return page.evaluate(
    async ({ method, args }) => {
      const response = await fetch(`/api/botharness/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'client-request',
          rpcId: `roster-e2e-${Math.random()}`,
          method: `botharness/${method}`,
          payload: { args },
        }),
      });
      const envelope = await response.json();
      if (envelope.result?.ok !== true) throw new Error(JSON.stringify(envelope.result));
      return envelope.result.value;
    },
    { method, args },
  );
}

async function positions(page) {
  return page.evaluate(
    (labels) =>
      labels.map((label) => {
        const button = Array.from(document.querySelectorAll('button')).find((item) =>
          item.textContent?.includes(label),
        );
        return button?.getBoundingClientRect().top ?? null;
      }),
    names,
  );
}

let a;
let original;
try {
  a = await browser.newPage();
  const b = await browser.newPage();
  await enterBotMode(a);
  const created = [];
  for (const name of names) {
    created.push((await rpc(a, 'channelCreate', { name, members: [] })).channel.id);
  }
  await enterBotMode(b);
  await b.waitForFunction(
    (labels) =>
      labels.every((label) =>
        Array.from(document.querySelectorAll('button')).some((item) =>
          item.textContent?.includes(label),
        ),
      ),
    { timeout: 15000 },
    names,
  );
  original = (await rpc(a, 'rosterGet', {})).topOrder;
  const without = original.filter((item) => !created.includes(item.id));
  const order = [...created.map((id) => ({ kind: 'channel', id })), ...without];
  await rpc(a, 'topReorder', { order });
  await b.waitForFunction(
    (labels) => {
      const top = labels.map(
        (label) =>
          Array.from(document.querySelectorAll('button'))
            .find((item) => item.textContent?.includes(label))
            ?.getBoundingClientRect().top,
      );
      return top[0] !== undefined && top[1] !== undefined && top[0] < top[1];
    },
    { timeout: 15000 },
    names,
  );
  await rpc(a, 'topReorder', { order: [order[1], order[0], ...order.slice(2)] });
  await b.waitForFunction(
    (labels) => {
      const top = labels.map(
        (label) =>
          Array.from(document.querySelectorAll('button'))
            .find((item) => item.textContent?.includes(label))
            ?.getBoundingClientRect().top,
      );
      return top[0] !== undefined && top[1] !== undefined && top[1] < top[0];
    },
    { timeout: 15000 },
    names,
  );
  console.log(JSON.stringify({ verdict: 'PASS', positions: await positions(b) }));
} catch (error) {
  console.error(String(error?.stack ?? error).replace(/token=[^&\s]+/g, 'token=<REDACTED>'));
  process.exitCode = 1;
} finally {
  if (a !== undefined && original !== undefined) {
    await rpc(a, 'topReorder', { order: original }).catch(() => {});
  }
  await browser.close();
}
