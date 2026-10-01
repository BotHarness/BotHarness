import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const flags = process.argv.slice(2);
const modes = ['--serve', '--prepare', '--probe'];
assert.ok(
  flags.every((flag) => modes.includes(flag) || flag === '--before'),
  'Unknown QA flag',
);
assert.equal(flags.filter((flag) => modes.includes(flag)).length, 1, 'Pass exactly one QA mode');
const mode = flags.find((flag) => modes.includes(flag));
const before = flags.includes('--before');
assert.ok(!before || mode === '--probe', '--before requires --probe');
const fixture = 'http://127.0.0.1:32009';
if (mode === '--serve') {
  let count = 0;
  let submitted;
  createServer((request, response) => {
    const url = new URL(request.url, fixture);
    if (url.pathname === '/state') response.end(JSON.stringify({ count, submitted }));
    else if (url.pathname === '/reset') {
      count = 0;
      submitted = undefined;
      response.end('reset');
    } else {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      if (url.pathname === '/submitted') {
        count += 1;
        submitted = Object.fromEntries(url.searchParams);
        response.end(
          `<!doctype html><title>Protected form submitted</title><body style="font:22px sans-serif;padding:24px"><h1>Protected form submitted</h1><p>Submission count: ${count}</p><p>Editable: ${submitted.editable === 'complete' ? 'complete' : 'unexpected'}</p><p>Readonly input: ${submitted.readonlyInput === 'original' ? 'original' : 'changed'}</p><p>Readonly textarea: ${submitted.readonlyTextarea === 'original' ? 'original' : 'changed'}</p><p>Disabled controls: excluded by native form</p></body>`,
        );
      } else {
        response.end(`<!doctype html><title>Protected fields QA</title><body style="font:22px sans-serif;padding:24px"><h1>Protected fields QA</h1><form action="/submitted" method="get">
<p><label>Readonly input <input name="readonlyInput" aria-label="Readonly input" value="original" readonly></label></p>
<p><label>Readonly textarea <textarea name="readonlyTextarea" aria-label="Readonly textarea" readonly>original</textarea></label></p>
<p><label>Disabled input <input name="disabledInput" aria-label="Disabled input" value="original" disabled></label></p>
<p><label>Disabled textarea <textarea name="disabledTextarea" aria-label="Disabled textarea" disabled>original</textarea></label></p>
<fieldset disabled><legend>Disabled group</legend><label>Inherited disabled <input name="inherited" aria-label="Inherited disabled" value="original"></label></fieldset>
<p><label>Editable <input name="editable" aria-label="Editable"></label></p><button type="submit">Submit</button></form><p id="state">Protected writes: 0; Focus: none</p><script>let writes=0;function refresh(){document.querySelector('#state').textContent='Protected writes: '+writes+'; Focus: '+(document.activeElement.name||'none')+'; '+Array.from(document.querySelectorAll('[name]')).map(e=>e.name+': '+e.value).join('; ');}document.addEventListener('input',e=>{if(e.target.name!=='editable')writes++;refresh()});document.addEventListener('change',refresh);document.addEventListener('focusin',refresh);refresh();</script></body>`);
      }
    }
  }).listen(32009, '127.0.0.1');
} else {
  const origin = process.env.BH_E2E_ORIGIN;
  const home = process.env.BH_E2E_HOME;
  const statePath = process.env.BH_E2E_STATE;
  assert.ok(origin && home && statePath, 'Set private QA origin, home and state path');
  if (mode === '--probe')
    assert.ok(process.env.BH_E2E_RESULTS, 'Set a QA result path before probing');
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
        rpcId: `editability-qa-${Date.now()}-${Math.random()}`,
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
      bots.find((record) => record.displayName === 'Editability QA') ??
      (await api('create', { displayName: 'Editability QA' })).bot;
    const dm = (await api('channelDm', { slug: bot.slug })).channel;
    await api('browserAccessSet', { slug: bot.slug, enabled: true });
    await api('browserProfileSet', { slug: bot.slug, profile: 'editability' });
    const oldSession = (await api('sessions', { slug: bot.slug })).sessions.find(
      (record) => record.role === 'orchestrator',
    )?.sessionId;
    const prior = new Set(oldSession ? (await events(oldSession)).map((event) => event.seq) : []);
    await api('channelSend', {
      channelId: dm.id,
      body: `本地 QA。只调用 browser_open 打开 ${fixture}/page，再调用 browser_observe，回复页面标题和文字，不输入、不点击按钮。`,
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
          JSON.stringify(result.message).includes('Protected fields QA'),
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
      'Real model opened and observed the protected-field fixture. Run --probe on this build.',
    );
  } else {
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(state.modelPassed, true);
    assert.notEqual(state.probePassed, true, 'Probe already completed; prepare a fresh run');
    assert.equal((await counter()).count, 0, 'Fresh fixture required before mutation');
    const call = (name, args = {}) => tool(state.sessionId, name, args);
    const initial = await observation(state.slug);
    assert.equal(initial.focused, state.original);
    assert.equal(initial.tabs.length, 1);
    const observed = await call('browser_observe');
    assert.equal(observed.isError, false);
    const protectedNames = [
      'Readonly input',
      'Readonly textarea',
      'Disabled input',
      'Disabled textarea',
      'Inherited disabled',
    ];
    const refusals = [];
    for (const label of protectedNames) {
      const fresh = await call('browser_observe');
      const ref = textOf(fresh)
        .split('\n')
        .find((line) => line.includes(label))
        ?.match(/(e[\w]+)/)?.[1];
      assert.ok(ref, label);
      const result = await call('browser_type', { ref, text: 'changed' });
      assert.equal(result.isError, !before, label);
      if (!before) assert.match(textOf(result), /readonly|disabled/i);
      refusals.push({ label, isError: result.isError === true });
    }
    const protectedResult = await call('browser_observe');
    assert.match(
      textOf(protectedResult),
      before ? /Protected writes: 5/ : /Protected writes: 0; Focus: none/,
    );
    for (const name of [
      'readonlyInput',
      'readonlyTextarea',
      'disabledInput',
      'disabledTextarea',
      'inherited',
    ]) {
      assert.ok(textOf(protectedResult).includes(`${name}: ${before ? 'changed' : 'original'}`));
    }
    const protectedView = await observation(state.slug);
    assert.equal(protectedView.focused, state.original);
    if (process.env.BH_E2E_SCREENSHOT) {
      assert.match(protectedView.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(
        process.env.BH_E2E_SCREENSHOT,
        Buffer.from(protectedView.frame.split(',')[1], 'base64'),
      );
    }
    const fresh = await call('browser_observe');
    const editableRef = textOf(fresh)
      .split('\n')
      .find((line) => /(?:input|textbox).*Editable/.test(line))
      ?.match(/(e[\w]+)/)?.[1];
    assert.ok(editableRef);
    assert.equal(
      (await call('browser_type', { ref: editableRef, text: 'complete' })).isError,
      false,
    );
    assert.equal((await call('browser_press_key', { key: 'Enter' })).isError, false);
    const deadline = Date.now() + 10000;
    let confirmed;
    do {
      confirmed = await call('browser_observe');
      if (textOf(confirmed).includes('Submission count: 1')) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    } while (Date.now() < deadline);
    assert.equal(confirmed.isError, false);
    assert.match(textOf(confirmed), /Submission count: 1/);
    const resultState = await counter();
    assert.equal(resultState.count, 1);
    assert.deepEqual(resultState.submitted, {
      readonlyInput: before ? 'changed' : 'original',
      readonlyTextarea: before ? 'changed' : 'original',
      editable: 'complete',
    });
    const final = await observation(state.slug);
    assert.equal(final.focused, state.original);
    assert.equal(final.tabs.length, 1);
    const rows = (await auditRows()).filter(
      (row) => row.id > state.lastLogId && row.detail.includes('browser_type'),
    );
    assert.equal(rows.length, 6);
    assert.ok(
      rows.every(
        (row) =>
          row.detail.includes(`bot=${state.slug}`) &&
          row.detail.includes(`session=${state.sessionId}`) &&
          row.detail.includes('role=orchestrator'),
      ),
    );
    assert.equal(rows.filter((row) => / -> error:/.test(row.detail)).length, before ? 0 : 5);
    assert.equal(rows.filter((row) => / -> ok \(/.test(row.detail)).length, before ? 6 : 1);
    assert.ok(
      rows.every((row) => !row.detail.includes('changed') && !row.detail.includes('complete')),
      'Typed values must stay redacted',
    );
    const report = {
      build: before ? 'before' : 'after',
      modelSetupVerified: true,
      protectedFields: refusals,
      protectedValues: before ? 'changed' : 'original',
      protectedInputEvents: before ? 5 : 0,
      submission: resultState,
      final: { currentRetained: final.focused === state.original, ownedTabs: final.tabs.length },
      audit: {
        matchedAttempts: rows.length,
        ok: before ? 6 : 1,
        error: before ? 0 : 5,
        attributed: true,
      },
    };
    if (process.env.BH_E2E_COMPLETED_SCREENSHOT) {
      assert.match(final.frame, /^data:image\/jpeg;base64,/);
      writeFileSync(
        process.env.BH_E2E_COMPLETED_SCREENSHOT,
        Buffer.from(final.frame.split(',')[1], 'base64'),
      );
    }
    writeFileSync(process.env.BH_E2E_RESULTS, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(statePath, `${JSON.stringify({ ...state, probePassed: true }, null, 2)}\n`, {
      mode: 0o600,
    });
    console.log(JSON.stringify(report));
  }
}
