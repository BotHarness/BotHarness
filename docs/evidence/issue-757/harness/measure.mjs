import { createRequire } from 'node:module';
import { readdirSync } from 'node:fs';
const pkg = readdirSync('node_modules/.pnpm').find((x) => x.startsWith('puppeteer-core@'));
const puppeteer = createRequire(process.cwd() + '/node_modules/.pnpm/' + pkg + '/node_modules/')(
  'puppeteer-core',
);
import http from 'node:http';
import fs from 'node:fs';
const dir = process.cwd() + '/docs/evidence/issue-757/harness';
const server = http
  .createServer((q, r) => {
    const f = q.url === '/' ? '/index.html' : q.url;
    try {
      r.end(fs.readFileSync(dir + f));
    } catch {
      r.statusCode = 404;
      r.end();
    }
  })
  .listen(0);
const port = server.address().port;
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--js-flags=--expose-gc', '--enable-precise-memory-info', '--window-size=1280,900'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
await page.evaluateOnNewDocument(() => {
  const raf = window.requestAnimationFrame.bind(window);
  window.__raf = 0;
  window.requestAnimationFrame = (cb) => {
    window.__raf++;
    return raf(cb);
  };
});
const cdp = await page.createCDPSession();
await cdp.send('Performance.enable');
await page.goto('http://127.0.0.1:' + port + '/');
const metrics = async () =>
  Object.fromEntries(
    (await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]),
  );
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function run(
  label,
  cfg,
  { throttle = 1, reduce = false, stale = false, hidden = false, scroll = false, ms = 6000 } = {},
) {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate((r) => {
    r
      ? (document.documentElement.dataset.botharnessMotion = 'reduce')
      : delete document.documentElement.dataset.botharnessMotion;
  }, reduce);
  await page.evaluate((s) => {
    s
      ? (document.documentElement.dataset.botharnessActivity = 'stale')
      : delete document.documentElement.dataset.botharnessActivity;
  }, stale);
  await page.evaluate((c) => window.mountGrid(c), cfg);
  await sleep(2000);
  await page.evaluate(() => {
    gc();
  });
  const m0 = await metrics();
  const r = await page.evaluate(
    async (ms, scroll) => {
      const ts = [];
      const raf0 = window.__raf;
      const t0 = performance.now();
      await new Promise((res) => {
        const f = (t) => {
          ts.push(t);
          if (scroll) {
            window.scrollBy(0, 12);
            if (window.scrollY + innerHeight >= document.body.scrollHeight - 2)
              window.scrollTo(0, 0);
          }
          if (t - t0 < ms) requestAnimationFrame(f);
          else res();
        };
        requestAnimationFrame(f);
      });
      const d = ts
        .slice(1)
        .map((t, i) => t - ts[i])
        .sort((a, b) => a - b);
      const q = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))];
      const svgs = [...document.querySelectorAll('.bh-persona-avatar svg')];
      const nodes = svgs.map((s) => s.querySelectorAll('*').length);
      return {
        frames: d.length,
        p50: +q(0.5).toFixed(1),
        p95: +q(0.95).toFixed(1),
        max: +d[d.length - 1].toFixed(1),
        long: d.filter((x) => x > 25).length,
        rafPerSec: +((window.__raf - raf0 - ts.length) / (ms / 1000)).toFixed(0),
        anims: document.getAnimations().length,
        svgNodesAvg: nodes.length ? Math.round(nodes.reduce((a, b) => a + b, 0) / nodes.length) : 0,
        svgNodesMax: Math.max(0, ...nodes),
      };
    },
    ms,
    scroll,
  );
  const m1 = await metrics();
  const sec = ms / 1000;
  const out = {
    label,
    ...r,
    scriptMsPerSec: +(((m1.ScriptDuration - m0.ScriptDuration) * 1000) / sec).toFixed(1),
    layoutPerSec: +((m1.LayoutCount - m0.LayoutCount) / sec).toFixed(1),
    stylePerSec: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / sec).toFixed(1),
    taskMsPerSec: +(((m1.TaskDuration - m0.TaskDuration) * 1000) / sec).toFixed(1),
    heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
    domNodes: m1.Nodes,
  };
  console.log(JSON.stringify(out));
  return out;
}
const base = { size: 40, sameBot: false, intervalMs: 700 };
const results = [];
const only = process.argv[2];
const plan =
  only === 'family'
    ? [
        ['n32-pixel', { ...base, count: 32, family: 'illustrated' }],
        ['n32-line', { ...base, count: 32, family: 'line' }],
        ['n64-pixel', { ...base, count: 64, family: 'illustrated' }],
        ['n64-line', { ...base, count: 64, family: 'line' }],
      ]
    : null;
if (only === 'scroll') {
  await run('col32', { ...base, count: 32, column: true });
  await run('col256-top', { ...base, count: 256, column: true });
  await run('col256-scroll', { ...base, count: 256, column: true }, { scroll: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await browser.close();
  server.close();
  process.exit(0);
}
if (plan) {
  for (const [l, c] of plan) await run(l, c);
  await browser.close();
  server.close();
  process.exit(0);
}
for (const n of [1, 8, 32, 64, 128]) results.push(await run('n' + n, { ...base, count: n }));
results.push(await run('n32-idle-static', { ...base, count: 32, intervalMs: 0 }));
results.push(await run('n32-with-indicator', { ...base, count: 32, indicator: true }));
results.push(
  await run('n32-static-indicator', { ...base, count: 32, intervalMs: 0, indicator: true }),
);
results.push(await run('n32-size96', { ...base, count: 32, size: 96 }));
results.push(await run('n32-samebot', { ...base, count: 32, sameBot: true }));
results.push(await run('n32-cpu4x', { ...base, count: 32 }, { throttle: 4 }));
results.push(await run('n64-cpu4x', { ...base, count: 64 }, { throttle: 4 }));
results.push(await run('n32-reduce', { ...base, count: 32 }, { reduce: true }));
results.push(await run('n32-stale', { ...base, count: 32 }, { stale: true }));
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
await page.evaluate(() => delete document.documentElement.dataset.botharnessActivity);
// lifecycle: mount/unmount cycles
for (let i = 0; i < 20; i++) {
  await page.evaluate(() =>
    window.mountGrid({ count: 32, size: 40, sameBot: false, intervalMs: 150 }),
  );
  await sleep(400);
  await page.evaluate(() => window.unmountGrid());
}
await sleep(1500);
await page.evaluate(() => gc());
await sleep(300);
const after = await metrics();
const raf0 = await page.evaluate(() => window.__raf);
await sleep(2000);
const raf1 = await page.evaluate(() => window.__raf);
const animsAfter = await page.evaluate(() => document.getAnimations().length);
console.log(
  JSON.stringify({
    label: 'after-20-cycles-unmounted',
    heapMB: +(after.JSHeapUsedSize / 1048576).toFixed(1),
    domNodes: after.Nodes,
    listeners: after.JSEventListeners,
    rafCallsIn2s: raf1 - raf0,
    anims: animsAfter,
  }),
);
await browser.close();
server.close();
