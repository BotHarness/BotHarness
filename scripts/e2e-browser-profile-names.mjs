import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = ['--serve', '--prepare', '--rejected', '--complete'];
assert.ok(
  flags.every((flag) => modes.includes(flag) || flag === '--before'),
  'Unknown QA flag',
);
const selected = flags.filter((flag) => modes.includes(flag));
assert.equal(selected.length, 1, 'Pass exactly one QA mode');
const mode = selected[0];
assert.ok(!flags.includes('--before') || mode === '--rejected', '--before requires --rejected');
const fixture = 'http://127.0.0.1:32005';
if (mode === '--serve') {
  let count = 0;
  createServer((request, response) => {
    if (request.url === '/state') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ count }));
    } else if (request.url === '/reset') {
      count = 0;
      response.end('reset');
    } else if (request.url === '/confirm') {
      count += 1;
      response.end('confirmed');
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(
        `<!doctype html><title>Profile name work QA</title><body style="font:24px sans-serif;padding:24px"><h1>Profile name work QA</h1><p>Existing work in work.v2</p><button onclick="fetch('/confirm').then(refresh)">Confirm preserved work</button><p id="state"></p><script>async function refresh(){const s=await(await fetch('/state')).json();document.querySelector('#state').textContent=s.count?'Preserved work confirmed ('+s.count+')':'Awaiting work confirmation';}refresh();setInterval(refresh,250);</script></body>`,
      );
    }
  }).listen(32005, '127.0.0.1');
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
  const counter = async () => (await fetch(`${fixture}/state`)).json();
  if (mode === '--prepare') {
    await fetch(`${fixture}/reset`);
    const bots = (await api('list')).bots;
    const bot =
      bots.find((record) => record.displayName === 'Profile Name QA') ??
      (await api('create', { displayName: 'Profile Name QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'work.v2' });
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
          JSON.stringify(result.message).includes('Existing work in work.v2'),
      ),
    );
    const current = (await observation(bot.slug)).focused;
    assert.ok(current);
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, sessionId, current, modelPassed: true }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Use native Pause Bot, submit .. through the Profile field, then run --rejected (with --before for the base build). Resume and use --complete for recovery.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const bot = (await api('list')).bots.find((record) => record.slug === state.slug);
    assert.ok(bot);
    const view = await observation(state.slug);
    const before = flags.includes('--before');
    if (mode === '--rejected') {
      assert.equal((await counter()).count, 0);
      if (before) {
        assert.equal(bot.browserProfile, '..');
        assert.equal(view.focused, null);
        assert.equal(view.takeover, false);
        assert.equal(view.tabs.length, 0);
      } else {
        assert.equal(bot.browserProfile, 'work.v2');
        assert.equal(view.focused, state.current);
        assert.equal(view.takeover, true, 'Use native Pause before the rejected assignment');
        assert.ok(view.tabs.some((tab) => tab.targetId === state.current));
        writeFileSync(
          statePath,
          `${JSON.stringify({ ...state, rejectedVerified: true }, null, 2)}\n`,
          { mode: 0o600 },
        );
      }
    } else {
      assert.equal(state.rejectedVerified, true, 'Run --rejected before --complete');
      assert.equal(bot.browserProfile, 'work.v2');
      assert.equal(view.focused, state.current);
      assert.equal(view.takeover, false, 'Use native Resume first');
      assert.equal((await counter()).count, 0, 'Fixture confirmation already completed');
      const read = await tool(state.sessionId, 'browser_observe', {});
      assert.equal(read.isError, false);
      assert.ok(textOf(read).includes('Existing work in work.v2'));
      const ref = /^(\S+) button Confirm preserved work$/mu.exec(textOf(read))?.[1];
      assert.ok(ref);
      assert.equal((await tool(state.sessionId, 'browser_click', { ref })).isError, false);
      const deadline = Date.now() + 5000;
      let completed;
      do {
        completed = await tool(state.sessionId, 'browser_observe', {});
        assert.equal(completed.isError, false);
        if (textOf(completed).includes('Preserved work confirmed (1)')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(textOf(completed).includes('Preserved work confirmed (1)'));
      assert.equal((await counter()).count, 1);
      assert.equal((await observation(state.slug)).focused, state.current);
    }
    const result = {
      baseline: before,
      phase: mode.slice(2),
      modelPassed: state.modelPassed,
      savedProfile: bot.browserProfile,
      focused: view.focused,
      pause: view.takeover,
      ownedTabs: view.tabs.map((tab) => tab.targetId),
      originalTab: state.current,
      pageConfirmations: (await counter()).count,
    };
    if (process.env.BH_E2E_RESULT)
      writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  }
}
