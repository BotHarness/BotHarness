import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const { parse } = createRequire(new URL('../packages/core/package.json', import.meta.url))('yaml');

const home = process.env.BH_E2E_HOME;
const origin = process.env.BH_E2E_ORIGIN ?? 'http://127.0.0.1:3136';
const reportPath = process.env.BH_E2E_REPORT;
assert(home && reportPath, 'Set BH_E2E_HOME and BH_E2E_REPORT');
const url = new URL(origin);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'http:');
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
async function request(path, body) {
  console.log(JSON.stringify({ probe: path }));
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(30_000),
    headers: { cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
const status = await request('/api/computer/status');
assert.equal(status.status, 200);
assert.equal(status.body.target, 'local');
assert.equal(status.body.provider, 'local');
assert.equal(status.body.probe.available, true);
assert.equal(status.body.status.state, 'running');
assert.equal(status.body.exportDir, '');
assert.equal(status.body.resolution, undefined);
const pin = {
  'cua-driver': 'e0d802a126a8fc90af74ef9cccd7dde5ba82feea26c3a2ad8c492ad1f444bb1e',
  'libcua_driver_sdk.dylib': '24a5b7aa55223bd76cb60000e5d3439c7a8e84bbb8ee05b2abdd2164a7446d39',
  'cua_driver_node_runtime.node':
    'ced42da1c940f58c762304436d1a24ff87ae26af3bc9f17267fb18267539227b',
};
for (const [file, hash] of Object.entries(pin)) {
  const bytes = readFileSync(join(homedir(), '.botharness/cua-driver/0.28.0/darwin', file));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
}
const patch = parse(readFileSync(join(home, 'profiles/web-dev/cordis.patch.yml'), 'utf8'));
assert.equal(patch.find((row) => row.id === 'botharness-computer').config.target, 'local');
const refused = [];
for (const endpoint of [
  'export',
  'import',
  'upload',
  'open-dir',
  'exports',
  'download',
  'upload-content',
]) {
  const result = await request(
    `/api/computer/${endpoint}`,
    ['exports', 'download'].includes(endpoint) ? undefined : { authorize: true, file: 'proof.tar' },
  );
  assert.equal(result.status, 400, endpoint);
  assert.equal(result.body.code, 'container-only', endpoint);
  refused.push({ endpoint, status: result.status, code: result.body.code });
}
const stale = await request('/api/computer/start', { authorize: true, target: 'container' });
assert.equal(stale.status, 409);
assert.equal(stale.body.code, 'target-changed');
const list = await request('/api/botharness/list', {
  type: 'client-request',
  rpcId: 'local-computer-readback',
  method: 'botharness/list',
  payload: { args: {} },
});
assert.equal(list.body.result?.ok, true);
const bot = list.body.result.value.bots.find((bot) => bot.displayName === 'Local QA');
assert(bot, 'Use the isolated Local QA PersonaBot');
assert.equal(bot.computerAccess ?? false, false);
const diagnostics = await request('/api/computer/diagnostics');
assert(
  diagnostics.body.events.some((event) =>
    event.detail.includes('accessibility=true screenRecording=true'),
  ),
);
const report = {
  capturedAt: new Date().toISOString(),
  driverVersion: '0.28.0',
  runtimeHashesVerified: true,
  target: 'local',
  provider: 'local',
  installationAndOsGrants: 'PASS',
  persistedTarget: 'local',
  localArchiveRoutesRefused: refused,
  staleTargetSetupRefused: { status: stale.status, code: stale.body.code },
  computerAccess: false,
  nativeDesktopCapture: 'NOT_RUN',
  nativeBotAction: 'NOT_RUN_WAITING_HUMAN_AUTHORIZATION',
};
writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify({
    report: reportPath,
    installationAndOsGrants: 'PASS',
    nativeBotAction: report.nativeBotAction,
  }),
);
