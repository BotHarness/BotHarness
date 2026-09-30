import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = ['--serve', '--prepare', '--paused', '--resumed', '--complete'];
assert.ok(
  flags.every((flag) => modes.includes(flag) || flag === '--before'),
  'Unknown QA flag',
);
const selected = flags.filter((flag) => modes.includes(flag));
assert.equal(
  selected.length,
  1,
  'Pass exactly one QA mode: --serve, --prepare, --paused, --resumed or --complete',
);
const mode = selected[0];
assert.ok(
  !flags.includes('--before') || ['--paused', '--resumed'].includes(mode),
  '--before requires --paused or --resumed',
);
const fixture = 'http://127.0.0.1:32004';
if (mode === '--serve') {
  let item = 'Original item';
  let count = 0;
  let confirmed = '';
  createServer((request, response) => {
    if (request.url === '/evidence' && process.env.BH_E2E_REPORT) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(readFileSync(process.env.BH_E2E_REPORT, 'utf8'));
    } else if (request.url === '/state') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ item, count, confirmed }));
    } else if (request.url === '/reset') {
      item = 'Original item';
      count = 0;
      confirmed = '';
      response.end('reset');
    } else if (request.url === '/change') {
      item = 'Updated by Human';
      response.end('changed');
    } else if (request.url === '/confirm') {
      count += 1;
      confirmed = item;
      response.end('confirmed');
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      const controls = request.url === '/controls';
      response.end(
        `<!doctype html><title>${controls ? 'Human Audit QA controls' : 'Browser refusal audit QA'}</title><body style="font:24px sans-serif;padding:24px"><h1>${controls ? 'Human controls' : 'Browser refusal audit QA'}</h1><p id="item"></p><button onclick="fetch('${controls ? '/change' : '/confirm'}').then(refresh)">${controls ? 'Change item while Bot paused' : 'Confirm current item'}</button><p id="state"></p><script>async function refresh(){const s=await(await fetch('/state')).json();document.querySelector('#item').textContent=s.item;document.querySelector('#state').textContent=s.count?'Confirmed '+s.confirmed+' ('+s.count+')':'Awaiting confirmation';}refresh();setInterval(refresh,250);</script></body>`,
      );
    }
  }).listen(32004, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath, 'Set BH_E2E_ORIGIN, BH_E2E_HOME and private BH_E2E_STATE');
  const cookie = readFileSync(
    join(tmpdir(), `dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`),
    'utf8',
  ).split(';')[0];
  async function rpc(namespace, method, args = {}) {
    const response = await fetch(`${origin}/api/${namespace}/${method}`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `profile-qa-${Date.now()}-${Math.random()}`,
        method: `${namespace}/${method}`,
        payload: { args },
      }),
    });
    const result = (await response.json()).result;
    assert.equal(result?.ok, true, `${namespace}/${method}: ${JSON.stringify(result?.error)}`);
    return result.value;
  }
  const api = (method, args) => rpc('botharness', method, args);
  async function observation(slug) {
    const response = await fetch(
      `${origin}/api/browser/observation?slug=${encodeURIComponent(slug)}`,
      { headers: { cookie }, signal: AbortSignal.timeout(30000) },
    );
    assert.equal(response.ok, true);
    return response.json();
  }
  async function tool(sessionId, name, args) {
    const response = await fetch(`${origin}/api/browser-queue-qa`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ sessionId, name, args }),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return response.json();
  }
  async function events(sessionId) {
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 100,
      },
    });
    return page.records.filter((record) => record.type === 'event').map((record) => record.event);
  }
  const textOf = (result) =>
    result.content
      .filter((item) => item.type === 'text')
      .map((item) => item.text)
      .join('\n');
  async function auditRows(since = 0) {
    const response = await fetch(
      `${origin}/api/computer/logs?plugin=browser&limit=1000&since=${since}`,
      { headers: { cookie }, signal: AbortSignal.timeout(30000) },
    );
    assert.equal(response.ok, true);
    return (await response.json()).entries;
  }
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  if (mode === '--prepare') {
    await fetch(`${fixture}/reset`);
    const bots = (await api('list')).bots;
    const bot =
      bots.find((record) => record.displayName === 'Audit Work QA') ??
      (await api('create', { displayName: 'Audit Work QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/page，再调用 browser_observe，回复页面标题和 item 文字，不点击按钮。`,
    });
    const deadline = Date.now() + 180000;
    let sessionId, fresh;
    while (Date.now() < deadline) {
      sessionId = (await api('sessions', { slug: bot.slug })).sessions.find(
        (record) => record.role === 'orchestrator',
      )?.sessionId;
      if (sessionId) {
        fresh = (await events(sessionId)).filter((event) => !prior.has(event.seq));
        if (fresh.some((event) => event.type === 'turn/end')) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(
      fresh?.some((event) => event.type === 'turn/end'),
      'Real model must complete',
    );
    const calls = new Map(
      fresh
        .filter((event) => event.type === 'tool/call')
        .map((event) => [event.data.callId, event.data.name]),
    );
    const results = fresh
      .filter((event) => event.type === 'tool/result')
      .map((event) => ({
        name: calls.get(event.data.message.toolCallId),
        message: event.data.message,
      }));
    assert.ok(results.some((result) => result.name === 'browser_open' && !result.message.isError));
    assert.ok(
      results.some(
        (result) =>
          result.name === 'browser_observe' &&
          !result.message.isError &&
          JSON.stringify(result.message).includes('Original item'),
      ),
    );
    const read = await tool(sessionId, 'browser_observe', {});
    assert.equal(read.isError, false);
    const ref = /^(\S+) button Confirm current item$/mu.exec(textOf(read))?.[1];
    assert.ok(ref);
    const current = (await observation(bot.slug)).focused;
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, sessionId, ref, current, modelPassed: true, since: Date.now(), lastLogId: Math.max(0, ...(await auditRows()).map((row) => row.id)) }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Prepared real model observation. Use Client Pause and --paused; change the item through Human controls and use Client Resume, then --resumed and --complete.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const before = flags.includes('--before');
    const phase = mode === '--complete' ? 'completed' : mode.slice(2);
    const call = (name, args = {}) => tool(state.sessionId, name, args);
    const actions = async () =>
      (await auditRows(state.since)).filter(
        (row) =>
          row.id > state.lastLogId &&
          row.kind === 'browser-action' &&
          row.detail.includes(`bot=${state.slug} session=${state.sessionId} `),
      );
    const paused = (await observation(state.slug)).takeover;
    if (phase === 'paused') {
      assert.equal(paused, true, 'Use native Pause Bot first');
      for (const [name, args] of [
        ['browser_click', { ref: state.ref }],
        ['browser_type', { ref: state.ref, text: 'QA_PRIVATE_TYPED_MARKER' }],
      ]) {
        const refused = await call(name, args);
        assert.equal(refused.isError, true);
        assert.match(textOf(refused), /Pause is active/iu);
      }
    } else if (phase === 'resumed') {
      assert.equal(paused, false, 'Use native Resume first');
      const refused = await call('browser_click', { ref: state.ref });
      assert.equal(refused.isError, true);
      assert.match(textOf(refused), /Resume.*browser_observe/iu);
    } else {
      assert.equal(paused, false);
      const read = await call('browser_observe');
      assert.equal(read.isError, false);
      assert.ok(textOf(read).includes('Updated by Human'));
      const ref = /^(\S+) button Confirm current item$/mu.exec(textOf(read))?.[1];
      assert.ok(ref);
      assert.equal((await call('browser_click', { ref })).isError, false);
      const deadline = Date.now() + 5000;
      let completed;
      do {
        completed = await call('browser_observe');
        assert.equal(completed.isError, false);
        if (textOf(completed).includes('Confirmed Updated by Human (1)')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(textOf(completed).includes('Confirmed Updated by Human (1)'));
      assert.equal((await counter()).count, 1);
      assert.equal((await observation(state.slug)).focused, state.current);
    }
    const rows = await actions();
    const errors = rows.filter((row) => row.detail.includes(' -> error: '));
    const expected = before ? 0 : phase === 'paused' ? 2 : 3;
    assert.equal(errors.length, expected);
    assert.ok(
      errors.every(
        (row) => row.owner === 'profile-shared' && row.detail.includes('role=orchestrator'),
      ),
    );
    if (!before && phase !== 'paused') {
      assert.equal(errors.filter((row) => row.detail.includes('Pause is active')).length, 2);
      assert.equal(errors.filter((row) => row.detail.includes('Resume requires')).length, 1);
    }
    if (phase !== 'completed') assert.equal((await counter()).count, 0);
    assert.ok(!JSON.stringify(rows).includes('QA_PRIVATE_TYPED_MARKER'));
    if (!before)
      assert.ok(
        errors.some(
          (row) => row.detail.includes('browser_type') && row.detail.includes('chars=23'),
        ),
      );
    if (phase === 'completed') {
      assert.ok(
        rows.some(
          (row) => row.detail.includes('browser_observe') && row.detail.includes(' -> ok '),
        ),
      );
      assert.equal(
        rows.filter((row) => row.detail.includes('browser_click') && row.detail.includes(' -> ok '))
          .length,
        1,
      );
    }
    const result = {
      baseline: before,
      phase,
      modelPassed: state.modelPassed,
      refusalCount: errors.length,
      refusedTypedContentRedacted: true,
      pageConfirmations: (await counter()).count,
      rows,
    };
    if (process.env.BH_E2E_RESULT)
      writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(result, null, 2)}\n`);
    if (process.env.BH_E2E_REPORT) {
      const escape = (value) =>
        String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
      const report = `<!doctype html><title>Browser Audit E2E report</title><body style="font:18px system-ui;margin:32px;max-width:1100px;color:#17212b"><h1>Browser Audit — E2E verification report</h1><p>Actual isolated Host / Chrome run. Source: existing operational logs API.</p><h2>${before ? 'Before: missing refusal outcomes' : 'After: recorded refusal outcomes'} · ${escape(phase)}</h2><p>Real model setup: completed · Refusal rows: <strong>${errors.length}</strong> · Page confirmations: <strong>${result.pageConfirmations}</strong></p><p>Typed marker absent from logs: ${result.refusedTypedContentRedacted} · Row ownership: profile-shared, attributed Bot/Session/role.</p><h2>Recorded Browser action outcomes</h2>${rows.length ? rows.map((row) => `<pre style="white-space:pre-wrap;overflow-wrap:anywhere;border:1px solid #d0d7de;padding:12px;font-size:14px">${escape(row.detail)}</pre>`).join('') : '<p>No browser-action rows for the three refused attempts.</p>'}<p>This is a test evidence report generated from checked Host results, not a product log viewer.</p></body>`;
      writeFileSync(process.env.BH_E2E_REPORT, report);
    }
    console.log(JSON.stringify(result));
  }
}
