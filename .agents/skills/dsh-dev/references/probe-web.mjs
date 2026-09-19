// Headless browser probe for a running DSH web instance.
//
// Usage (from anywhere in the repo):
//   node .agents/skills/dsh-dev/references/probe-web.mjs http://127.0.0.1:3080 <token>
//
// Prints: service-worker/state, in-page fetch results (real origin + dsh.internal),
// console errors, failed requests, and WebSocket lifecycle events.
//
// Needs puppeteer from the repo's pnpm store and a cached Chrome
// (`~/.cache/puppeteer`); both ship with the docs toolchain.

import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

function loadPuppeteer() {
  const pnpm = resolve(repoRoot, 'node_modules/.pnpm');
  const entry = readdirSync(pnpm).find((name) => name.startsWith('puppeteer@'));
  if (entry === undefined) throw new Error(`puppeteer not found in ${pnpm}`);
  const require = createRequire(resolve(pnpm, entry, 'node_modules/'));
  return require('puppeteer');
}

const [base, token] = process.argv.slice(2);
if (base === undefined || token === undefined) {
  console.error('usage: node probe-web.mjs <base-url> <token>');
  process.exit(1);
}

const puppeteer = loadPuppeteer();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
const events = [];
page.on('console', (m) => events.push(`CONSOLE[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => events.push(`PAGEERROR ${e.message}`));
page.on('requestfailed', (r) => events.push(`REQFAIL ${r.url()} :: ${r.failure()?.errorText ?? ''}`));
page.on('response', (r) => {
  if (r.status() >= 400) events.push(`HTTP ${r.status()} ${r.url()}`);
});
const cdp = await page.createCDPSession();
await cdp.send('Network.enable');
cdp.on('Network.webSocketCreated', (e) => events.push(`WS-CREATED ${e.url}`));
cdp.on('Network.webSocketClosed', (e) => events.push(`WS-CLOSED ${e.url}`));
cdp.on('Network.webSocketFrameError', (e) => events.push(`WS-FRAME-ERR ${JSON.stringify(e).slice(0, 300)}`));

await page
  .goto(`${base}/?token=${token}`, { waitUntil: 'networkidle2', timeout: 60000 })
  .catch((e) => events.push(`GOTO ${e.message}`));
await new Promise((r) => setTimeout(r, 8000));

const state = await page.evaluate(async () => {
  const out = { origin: location.origin };
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    out.swRegs = regs.map(
      (r) => (r.active && r.active.scriptURL) || (r.installing && r.installing.scriptURL) || 'none',
    );
    out.swController = navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : null;
  } catch (e) {
    out.sw = String(e);
  }
  const tryFetch = async (u) => {
    try {
      const r = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: 'probe', method: 'settings/describe', payload: { args: {} } }),
      });
      return { status: r.status, type: r.type, text: (await r.text()).slice(0, 160) };
    } catch (e) {
      return { error: String(e) };
    }
  };
  out.fetchReal = await tryFetch('/api/settings/describe');
  // dsh.internal is only reachable through a carrier/interceptor; ERR_NAME_NOT_RESOLVED here is expected.
  out.fetchInternal = await tryFetch('http://dsh.internal/api/settings/describe');
  return out;
});

console.log('=== STATE ===');
console.log(JSON.stringify(state, null, 2));
console.log('=== EVENTS ===');
console.log(events.slice(0, 160).join('\n'));
await browser.close();
