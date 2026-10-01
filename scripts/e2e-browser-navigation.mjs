import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = ['--serve', '--prepare', '--probe', '--complete'];
assert.ok(
  flags.every((flag) => modes.includes(flag) || flag === '--before'),
  'Unknown QA flag',
);
assert.equal(flags.filter((flag) => modes.includes(flag)).length, 1, 'Pass exactly one QA mode');
const mode = flags.find((flag) => modes.includes(flag));
const before = flags.includes('--before');
assert.ok(!before || mode === '--probe', '--before requires --probe');
const fixture = 'http://127.0.0.1:32007';
if (mode === '--serve') {
  let count = 0;
  createServer((request, response) => {
    if (request.url === '/fail') request.socket.destroy();
    else if (request.url === '/state') response.end(JSON.stringify({ count }));
    else if (request.url === '/reset') {
      count = 0;
      response.end('reset');
    } else if (request.url === '/confirm') {
      count += 1;
      response.end('confirmed');
    } else if (request.url === '/evidence' && process.env.BH_E2E_REPORT) {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(readFileSync(process.env.BH_E2E_REPORT, 'utf8'));
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><title>Navigation retry QA</title><body style="font:24px sans-serif;padding:24px"><h1>Navigation retry QA</h1><p>Retry the original target</p><button onclick="fetch('/confirm').then(refresh)">Confirm navigation retry</button><p id="state"></p><script>async function refresh(){const s=await(await fetch('/state')).json();document.querySelector('#state').textContent=s.count?'Navigation retry confirmed ('+s.count+')':'Awaiting retry confirmation';}refresh();setInterval(refresh,250);</script></body>`,
      );
    }
  }).listen(32007, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath, 'Set private QA origin, home and state path');
  const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
    ';',
  )[0];
  async function rpc(namespace, method, args = {}) {
    const response = await fetch(`${origin}/api/${namespace}/${method}`, {
      method: 'POST',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        type: 'client-request',
        rpcId: `closed-tab-qa-${Date.now()}-${Math.random()}`,
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
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  async function pageTargets() {
    const port = Number(
      readFileSync(
        join(home, 'botharness', 'browser-profiles', 'navigation', 'DevToolsActivePort'),
        'utf8',
      ).split('\n')[0],
    );
    assert.ok(Number.isInteger(port) && port > 0);
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.ok, true);
    return (await response.json()).filter((target) => target.type === 'page');
  }
  async function auditRows() {
    const response = await fetch(`${origin}/api/computer/logs?plugin=browser&limit=1000`, {
      headers: { cookie },
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.ok, true);
    return (await response.json()).entries;
  }
  if (mode === '--prepare') {
    await fetch(`${fixture}/reset`);
    const bots = (await api('list')).bots;
    const bot =
      bots.find((record) => record.displayName === 'Navigation QA') ??
      (await api('create', { displayName: 'Navigation QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'navigation' });
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/page，再调用 browser_observe，回复页面标题和文字，不点击按钮。`,
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
          JSON.stringify(result.message).includes('Retry the original target'),
      ),
    );
    const original = (await observation(bot.slug)).focused;
    assert.ok(original);
    assert.equal((await counter()).count, 0);
    const entries = await auditRows();
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, sessionId, original, modelPassed: true, lastLogId: Math.max(0, ...entries.map((row) => row.id)) }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Real model opened and observed the original fixture. Run --probe, then --complete on the fixed build.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.modelPassed, true);
    const call = (name, args = {}) => tool(state.sessionId, name, args);
    let outcomes;
    if (mode === '--probe') {
      assert.equal((await counter()).count, 0);
      const initial = await observation(state.slug);
      const initialTargets = await pageTargets();
      assert.ok(initialTargets.some((target) => target.id === state.original));
      assert.equal(initial.focused, state.original);
      assert.equal(initial.tabs.length, 1);
      const reused = await call('browser_open', { url: `${fixture}/fail` });
      assert.equal(reused.isError, !before);
      assert.match(
        textOf(reused),
        before ? /Opened chrome-error:/u : /navigation failed.*ERR_EMPTY_RESPONSE/iu,
      );
      assert.equal((await observation(state.slug)).focused, state.original);
      const retry = await call('browser_open', { url: `${fixture}/page` });
      assert.equal(retry.isError, false);
      assert.equal((await observation(state.slug)).focused, state.original);
      const created = await call('browser_tabs', { action: 'open', url: `${fixture}/fail` });
      assert.equal(created.isError, !before);
      assert.match(
        textOf(created),
        before ? /Opened chrome-error:/u : /navigation failed.*ERR_EMPTY_RESPONSE/iu,
      );
      const view = await observation(state.slug);
      assert.equal(view.tabs.length, before ? 2 : 1);
      assert.equal(
        (await pageTargets()).length,
        initialTargets.length + (before ? 1 : 0),
        'No extra unowned target after failed new-tab navigation',
      );
      assert.equal(view.focused === state.original, !before);
      if (!before) assert.ok(view.frame);
      const rows = (await auditRows()).filter(
        (row) =>
          row.id > state.lastLogId &&
          row.kind === 'browser-action' &&
          row.detail.includes(`bot=${state.slug} session=${state.sessionId} `),
      );
      const failures = rows.filter((row) => row.detail.includes('/fail'));
      assert.equal(failures.length, 2);
      assert.ok(
        failures.every(
          (row) =>
            row.detail.includes(before ? ' -> ok ' : ' -> error: ') &&
            row.detail.includes('role=orchestrator'),
        ),
      );
      outcomes = failures.map((row) => ({
        tool: / role=\S+ browser_open /u.test(row.detail) ? 'browser_open' : 'browser_tabs open',
        outcome: before ? 'ok' : 'error',
        attributed: true,
      }));
      assert.deepEqual(
        new Set(outcomes.map((row) => row.tool)),
        new Set(['browser_open', 'browser_tabs open']),
      );
      writeFileSync(
        statePath,
        `${JSON.stringify({ ...state, probeVerified: !before, outcomes }, null, 2)}\n`,
        { mode: 0o600 },
      );
    } else {
      assert.equal(state.probeVerified, true, 'Run the fixed probe before completion');
      assert.equal((await counter()).count, 0, 'Fixture confirmation already completed');
      assert.equal((await observation(state.slug)).focused, state.original);
      const read = await call('browser_observe');
      assert.equal(read.isError, false);
      assert.ok(textOf(read).includes('Retry the original target'));
      const ref = /^(\S+) button Confirm navigation retry$/mu.exec(textOf(read))?.[1];
      assert.ok(ref);
      assert.equal((await call('browser_click', { ref })).isError, false);
      let completed;
      const deadline = Date.now() + 5000;
      do {
        completed = await call('browser_observe');
        assert.equal(completed.isError, false);
        if (textOf(completed).includes('Navigation retry confirmed (1)')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(textOf(completed).includes('Navigation retry confirmed (1)'));
      assert.equal((await counter()).count, 1);
      outcomes = state.outcomes;
    }
    const view = await observation(state.slug);
    const result = {
      baseline: before,
      phase: mode.slice(2),
      modelPassed: true,
      navigationOutcomes: outcomes,
      originalTab: state.original,
      focused: view.focused,
      retainedOriginal: view.focused === state.original,
      ownedLiveTabs: view.tabs.length,
      nativePageTargets: (await pageTargets()).length,
      previewAvailable: view.frame !== null,
      pageConfirmations: (await counter()).count,
    };
    if (process.env.BH_E2E_RESULT)
      writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(result, null, 2)}\n`);
    if (process.env.BH_E2E_REPORT) {
      const report = `<!doctype html><title>Navigation E2E evidence</title><body style="font:20px system-ui;margin:36px;max-width:1100px"><h1>Browser navigation — E2E evidence</h1><p>Actual isolated Client / Host / Chrome run. Checked native Session Tool replies and operational Audit rows.</p><h2>${before ? 'Before: failure reported as success' : 'After: honest navigation failure'}</h2><p>Real model setup: completed · Page confirmations: ${result.pageConfirmations}</p><table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">Attempt to /fail</th><th align="left">Tool / Audit outcome</th><th align="left">Attributed</th></tr></thead><tbody>${outcomes.map((row) => `<tr><td style="padding:16px 0;border-bottom:1px solid">${row.tool}</td><td style="color:${before ? '#166534' : '#b91c1c'};border-bottom:1px solid">${row.outcome}</td><td style="border-bottom:1px solid">yes</td></tr>`).join('')}</tbody></table><p>Retry reused the original target: yes</p><p>After failed new-tab navigation: original target current = <strong>${result.retainedOriginal}</strong>; owned live tabs = <strong>${result.ownedLiveTabs}</strong>.</p><p>This report presents verified test results; it is not a product log viewer.</p></body>`;
      writeFileSync(process.env.BH_E2E_REPORT, report);
    }
    console.log(JSON.stringify(result));
  }
}
