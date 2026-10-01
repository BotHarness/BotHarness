import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.ok(['--prepare', '--verify-on', '--verify-off', '--complete'].includes(mode));
const home = process.env.BH_E2E_HOME;
const origin = process.env.BH_E2E_ORIGIN;
const statePath = process.env.BH_E2E_STATE;
assert.ok(home && origin && statePath);
const target = new URL(origin);
assert.equal(target.protocol, 'http:');
assert.ok(
  ['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname),
  'Use an isolated loopback QA Host',
);
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
const save = (value) =>
  writeFileSync(statePath, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
async function route(path, body) {
  const response = await fetch(`${origin}/api/${path}`, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: { cookie, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.ok, true, `Host request failed: ${response.status}`);
  return response.json();
}
async function rpc(name, args = {}) {
  const response = await route(`botharness/${name}`, {
    type: 'client-request',
    rpcId: `computer-header-${Date.now()}`,
    method: `botharness/${name}`,
    payload: { args },
  });
  assert.equal(response.result?.ok, true, JSON.stringify(response.result?.error));
  return response.result.value;
}
if (mode === '--prepare') {
  const existing = (await rpc('list')).bots.find(
    (value) => value.displayName === 'Computer header QA',
  );
  const bot = existing ?? (await rpc('create', { displayName: 'Computer header QA' })).bot;
  const dm = (await rpc('channelDm', { slug: bot.slug })).channel;
  assert.equal(bot.computerAccess ?? false, false);
  save({ phase: 'off', bot: { slug: bot.slug, channelId: dm.id }, initialAccessOff: true });
  console.log(
    'Open the Bot DM and verify the disabled Computer header before enabling it in the Client.',
  );
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const bot = (await rpc('list')).bots.find((value) => value.slug === state.bot.slug);
  assert.ok(bot);
  if (mode === '--verify-on') {
    assert.equal(state.phase, 'off');
    assert.equal(bot.computerAccess, true);
    const computer = await route('computer/status');
    assert.equal(computer.probe.available, true);
    assert.equal(computer.status.state, 'absent');
    save({ ...state, phase: 'on', headerWriteReachedHost: true, isolatedRuntimeReady: true });
    console.log(
      'The real Host persisted the Client access write; isolated Computer is available and has not been created.',
    );
  } else if (mode === '--verify-off') {
    assert.equal(state.phase, 'on');
    assert.equal(bot.computerAccess ?? false, false);
    const computer = await route('computer/status');
    assert.equal(computer.status.state, 'stopped');
    save({
      ...state,
      phase: 'verified',
      disableWriteReachedHost: true,
      isolatedRuntimeStopped: true,
    });
    console.log(
      'The real Host persisted disabling access. Reload the Client and verify the locked header again.',
    );
  } else {
    assert.equal(state.phase, 'verified');
    assert.equal(bot.computerAccess ?? false, false);
    assert.ok(process.env.BH_E2E_UI_RESULTS && process.env.BH_E2E_REPORT);
    const ui = JSON.parse(readFileSync(process.env.BH_E2E_UI_RESULTS, 'utf8'));
    for (const key of [
      'offHeaderLocked',
      'enableExpands',
      'collapsedSwitchVisible',
      'authorizeAndCancel',
      'runningBodyMounted',
      'disableCollapses',
      'reloadKeepsOff',
      'lightAndDark',
    ]) {
      assert.equal(ui[key], true, `Missing real Client verification: ${key}`);
    }
    const report = {
      initialAccessOff: state.initialAccessOff,
      headerWriteReachedHost: state.headerWriteReachedHost,
      disableWriteReachedHost: state.disableWriteReachedHost,
      isolatedRuntimeReady: state.isolatedRuntimeReady,
      isolatedRuntimeStopped: state.isolatedRuntimeStopped,
      desktopFrames: 'unverified: viewer remained connecting',
      ui,
    };
    for (const key of [
      'initialAccessOff',
      'headerWriteReachedHost',
      'disableWriteReachedHost',
      'isolatedRuntimeReady',
      'isolatedRuntimeStopped',
    ])
      assert.equal(report[key], true);
    writeFileSync(process.env.BH_E2E_REPORT, JSON.stringify(report, null, 2) + '\n');
    save({ ...state, phase: 'completed' });
    console.log(
      'Computer header acceptance complete; the report contains no credentials or private paths.',
    );
  }
}
