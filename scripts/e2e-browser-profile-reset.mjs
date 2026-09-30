import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const fixture = 'http://127.0.0.1:32002';
if (process.argv.includes('--serve')) {
  const server = createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    const named = request.url === '/work';
    response.end(
      `<!doctype html><title>${named ? 'Named profile work' : 'Shared profile work'}</title><body style="font:24px sans-serif;padding:24px"><h1>${named ? 'Named profile work' : 'Shared profile work'}</h1><p id="isolation"></p><button onclick="document.querySelector('#state').textContent='Work completed in named profile'">Complete profile work</button><p id="state">Ready for profile work</p><script>${named ? '' : "document.cookie='profile-qa-marker=shared;path=/'"};document.querySelector('#isolation').textContent=document.cookie.includes('profile-qa-marker=shared')?'Shared sign-in marker':'Isolated sign-in state';</script></body>`,
    );
  });
  server.listen(32002, '127.0.0.1');
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
  async function humanOpen(slug) {
    const response = await fetch(`${origin}/api/browser/open`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ slug }),
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
  if (process.argv.includes('--prepare')) {
    const bots = (await api('list')).bots;
    const bot =
      bots.find((item) => item.displayName === 'Profile Work QA') ??
      (await api('create', { displayName: 'Profile Work QA' })).bot;
    const peer =
      bots.find((item) => item.displayName === 'Profile Peer QA') ??
      (await api('create', { displayName: 'Profile Peer QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('channelDm', { slug: peer.slug });
    for (const record of [bot, peer]) {
      await api('browserAccessSet', { slug: record.slug, enabled: true });
      await api('browserProfileSet', { slug: record.slug, profile: '' });
    }
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (item) => item.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/default，再调用 browser_observe，简短回复页面标题和文字，不做其他操作。`,
    });
    const deadline = Date.now() + 180000;
    let sessionId;
    let fresh;
    while (Date.now() < deadline) {
      sessionId = (await api('sessions', { slug: bot.slug })).sessions.find(
        (item) => item.role === 'orchestrator',
      )?.sessionId;
      if (sessionId) {
        fresh = (await events(sessionId)).filter((event) => !prior.has(event.seq));
        if (fresh.some((event) => event.type === 'turn/end')) break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert.ok(
      fresh?.some((event) => event.type === 'turn/end'),
      'Real model turn must complete',
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
          JSON.stringify(result.message).includes('Shared sign-in marker'),
      ),
    );
    const current = (await observation(bot.slug)).focused;
    assert.ok(current);
    for (const tab of (await observation(bot.slug)).tabs) {
      if (tab.targetId !== current)
        assert.equal(
          (await tool(sessionId, 'browser_tabs', { action: 'close', targetId: tab.targetId }))
            .isError,
          false,
        );
    }
    assert.equal(
      (
        await tool(sessionId, 'browser_tabs', {
          action: 'open',
          url: `${fixture}/default?reference`,
        })
      ).isError,
      false,
    );
    const reference = (await observation(bot.slug)).focused;
    assert.equal(
      (await tool(sessionId, 'browser_tabs', { action: 'select', targetId: current })).isError,
      false,
    );
    const peerTarget = (await humanOpen(peer.slug)).tabId;
    writeFileSync(
      statePath,
      `${JSON.stringify({ slug: bot.slug, peerSlug: peer.slug, sessionId, dmId: dm.id, current, reference, peerTarget, modelOpenObservePassed: true }, null, 2)}\n`,
      { mode: 0o600 },
    );
    console.log(
      'Prepared real-model default-profile work and peer tab; change Profile to work through the Client field, then run --verify.',
    );
  } else if (process.argv.includes('--verify')) {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const bot = (await api('list')).bots.find((item) => item.slug === state.slug);
    assert.equal(
      bot.browserProfile,
      'work',
      'Change the native Browser Profile field to work first',
    );
    const switched = await observation(state.slug);
    const opened = await tool(state.sessionId, 'browser_open', { url: `${fixture}/work` });
    const before = process.argv.includes('--before');
    const report = {
      baseline: before,
      modelOpenObservePassed: state.modelOpenObservePassed,
      oldCurrent: state.current,
      oldReference: state.reference,
      switched: {
        focused: switched.focused,
        takeover: switched.takeover,
        tabs: switched.tabs.map((tab) => tab.targetId),
      },
      openError: opened.isError,
      openText: JSON.stringify(opened.content),
      peerCurrent: (await observation(state.peerSlug)).focused,
    };
    if (before) {
      assert.equal(switched.focused, state.current);
      assert.equal(opened.isError, true);
      assert.equal(switched.takeover, true);
      assert.match(report.openText, /Browser Pause is active/iu);
    } else {
      assert.equal(switched.focused, null);
      assert.equal(switched.takeover, false);
      assert.equal(switched.tabs.length, 0);
      assert.equal(opened.isError, false);
      const observed = await tool(state.sessionId, 'browser_observe', {});
      assert.equal(observed.isError, false);
      const text = observed.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');
      assert.ok(text.includes('Isolated sign-in state'));
      const ref = /^(\S+) button Complete profile work$/mu.exec(text)?.[1];
      assert.ok(ref);
      assert.equal((await tool(state.sessionId, 'browser_click', { ref })).isError, false);
      const completed = await tool(state.sessionId, 'browser_observe', {});
      assert.equal(completed.isError, false);
      assert.ok(JSON.stringify(completed.content).includes('Work completed in named profile'));
      const newState = await observation(state.slug);
      assert.notEqual(newState.focused, state.current);
      assert.notEqual(newState.focused, state.peerTarget);
      assert.equal(newState.tabs.length, 1);
      report.newCurrent = newState.focused;
      report.isolatedSignIn = true;
      report.workCompleted = true;
      const peerOpen = await humanOpen(state.peerSlug);
      assert.equal(peerOpen.tabId, state.peerTarget);
      await api('browserAccessSet', { slug: state.slug, enabled: false });
      assert.equal((await tool(state.sessionId, 'browser_observe', {})).isError, true);
      await api('browserAccessSet', { slug: state.slug, enabled: true });
      assert.equal((await observation(state.slug)).focused, newState.focused);
      report.accessCycleRetainedCurrent = true;
    }
    assert.equal(report.peerCurrent, state.peerTarget);
    if (process.env.BH_E2E_RESULT)
      writeFileSync(process.env.BH_E2E_RESULT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(JSON.stringify(report));
  } else if (process.argv.includes('--verify-return')) {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    const bot = (await api('list')).bots.find((item) => item.slug === state.slug);
    assert.ok(!bot.browserProfile, 'Change the native Browser Profile field back to default first');
    assert.equal((await observation(state.slug)).focused, null);
    assert.equal(
      (await tool(state.sessionId, 'browser_open', { url: `${fixture}/default` })).isError,
      false,
    );
    assert.equal((await observation(state.peerSlug)).focused, state.peerTarget);
    console.log(
      'Native switch back to default opened fresh work without reusing old or peer ownership.',
    );
  } else {
    throw new Error('Use --prepare, --verify [--before], --verify-return, or --serve');
  }
}
