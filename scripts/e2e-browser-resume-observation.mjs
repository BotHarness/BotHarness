import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const fixture = 'http://127.0.0.1:32003';
if (process.argv.includes('--serve')) {
  let item = 'Original item';
  let count = 0;
  let confirmed = '';
  createServer((request, response) => {
    if (request.url === '/state') {
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
        `<!doctype html><title>${controls ? 'Human Resume QA controls' : 'Resume observation QA'}</title><body style="font:24px sans-serif;padding:24px"><h1>${controls ? 'Human controls' : 'Resume observation QA'}</h1><p id="item"></p><button onclick="fetch('${controls ? '/change' : '/confirm'}').then(refresh)">${controls ? 'Change item while Bot paused' : 'Confirm current item'}</button><p id="state"></p><script>async function refresh(){const s=await(await fetch('/state')).json();document.querySelector('#item').textContent=s.item;document.querySelector('#state').textContent=s.count?'Confirmed '+s.confirmed+' ('+s.count+')':'Awaiting confirmation';}refresh();setInterval(refresh,250);</script></body>`,
      );
    }
  }).listen(32003, '127.0.0.1');
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
  if (process.argv.includes('--prepare')) {
    await fetch(`${fixture}/reset`);
    const bots = (await api('list')).bots;
    const bot =
      bots.find((record) => record.displayName === 'Resume Work QA') ??
      (await api('create', { displayName: 'Resume Work QA' })).bot;
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
      `${JSON.stringify({ slug: bot.slug, sessionId, ref, current, modelPassed: true }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Prepared real model observation. Use Client Pause, Human controls Change item, then Client Resume before --verify.',
    );
  } else if (process.argv.includes('--verify')) {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const before = process.argv.includes('--before');
    assert.equal((await observation(state.slug)).takeover, false);
    assert.equal((await counter()).item, 'Updated by Human');
    assert.equal((await counter()).count, 0);
    const stale = await tool(state.sessionId, 'browser_click', { ref: state.ref });
    const result = {
      baseline: before,
      modelPassed: state.modelPassed,
      staleClickError: stale.isError,
      staleClickText: textOf(stale),
      countAfterStaleClick: (await counter()).count,
    };
    if (before) {
      assert.equal(stale.isError, false);
      assert.equal(result.countAfterStaleClick, 1);
    } else {
      assert.equal(stale.isError, true);
      assert.match(result.staleClickText, /Resume.*browser_observe/iu);
      assert.equal(result.countAfterStaleClick, 0);
      if (process.argv.includes('--refusal-only')) {
        if (process.env.BH_E2E_RESULT)
          writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(result, null, 2)}\n`);
        console.log(JSON.stringify(result));
        process.exit(0);
      }
      const read = await tool(state.sessionId, 'browser_observe', {});
      assert.equal(read.isError, false);
      assert.ok(textOf(read).includes('Updated by Human'));
      const ref = /^(\S+) button Confirm current item$/mu.exec(textOf(read))?.[1];
      assert.ok(ref);
      assert.equal((await tool(state.sessionId, 'browser_click', { ref })).isError, false);
      const deadline = Date.now() + 5000;
      let completed;
      do {
        completed = await tool(state.sessionId, 'browser_observe', {});
        assert.equal(completed.isError, false);
        if (textOf(completed).includes('Confirmed Updated by Human (1)')) break;
        await new Promise((resolve) => setTimeout(resolve, 100));
      } while (Date.now() < deadline);
      assert.ok(textOf(completed).includes('Confirmed Updated by Human (1)'));
      assert.equal((await counter()).count, 1);
      assert.equal((await observation(state.slug)).focused, state.current);
      result.freshObservationReadHumanChange = true;
      result.freshClickCompleted = true;
      result.currentTabRetained = true;
    }
    if (process.env.BH_E2E_RESULT)
      writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(result, null, 2)}\n`);
    console.log(JSON.stringify(result));
  } else throw new Error('Use --serve, --prepare or --verify [--before]');
}
