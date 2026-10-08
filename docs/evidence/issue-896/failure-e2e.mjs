import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const instance = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const evidencePath = new URL('./backend-e2e.json', import.meta.url);
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
const origin = new URL(instance.url).origin;
const cookie = (await fetch(instance.url, { redirect: 'manual' })).headers
  .get('set-cookie')
  ?.split(';')[0];
assert.ok(cookie);
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  if (!result?.ok) throw new Error(`${method}: ${result?.error?.message ?? response.status}`);
  return result.value;
}
function record(name) {
  evidence.checks.push({ name, passed: true });
  console.log(name);
}
if (process.argv[3] === 'retry-after-cold-restart') {
  const slug = evidence.failureBot;
  const preview = (await rpc('deletionPreview', { slug })).preview;
  assert.equal(preview.deletion.phase, 'incomplete');
  assert.equal(preview.deletion.memory, 'pending');
  assert.ok(preview.deletion.cleanupAccepted);
  await assert.rejects(rpc('resume', { slug }));
  const result = (await rpc('deletionRetry', { slug })).deletion;
  assert.equal(result.phase, 'complete');
  assert.equal(result.memory, 'erased');
  assert.ok(!fs.existsSync(preview.memoryDir));
  record('real-Host-cold-restart-incomplete-cleanup-and-explicit-retry');
} else {
  const stale = (await rpc('create', { displayName: 'QA896 stale scope' })).bot;
  let preview = (await rpc('deletionPreview', { slug: stale.slug })).preview;
  await rpc('update', { slug: stale.slug, patch: { displayName: 'QA896 renamed after preview' } });
  await assert.rejects(
    rpc('deletionConfirm', { slug: stale.slug, token: preview.token, eraseMemory: true }),
    /scope changed/,
  );
  assert.equal((await rpc('deletionPreview', { slug: stale.slug })).preview.deletion, undefined);
  preview = (await rpc('deletionPreview', { slug: stale.slug })).preview;
  await rpc('deletionConfirm', { slug: stale.slug, token: preview.token, eraseMemory: false });
  record('real-Host-stale-confirmation-refused-before-terminal-fence');
  const escape = (await rpc('create', { displayName: 'QA896 external link refusal' })).bot;
  preview = (await rpc('deletionPreview', { slug: escape.slug })).preview;
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bh896-outside-'));
  fs.writeFileSync(path.join(outside, 'must-remain.txt'), 'outside disposable QA bytes');
  const link = path.join(preview.memoryDir, 'outside-link');
  fs.symlinkSync(outside, link);
  try {
    preview = (await rpc('deletionPreview', { slug: escape.slug })).preview;
    assert.equal(preview.eraseAvailable, false);
    await assert.rejects(
      rpc('deletionConfirm', { slug: escape.slug, token: preview.token, eraseMemory: true }),
    );
    const result = (
      await rpc('deletionConfirm', { slug: escape.slug, token: preview.token, eraseMemory: false })
    ).deletion;
    assert.equal(result.memory, 'retained');
    assert.equal(
      fs.readFileSync(path.join(outside, 'must-remain.txt'), 'utf8'),
      'outside disposable QA bytes',
    );
    record('real-Host-escaping-link-refused-ordinary-deletion-retains-outside-bytes');
  } finally {
    fs.unlinkSync(link);
    fs.rmSync(outside, { recursive: true });
  }
  const failure = (await rpc('create', { displayName: 'QA896 cleanup failure' })).bot;
  preview = (await rpc('deletionPreview', { slug: failure.slug })).preview;
  assert.ok(preview.eraseAvailable);
  const mode = fs.statSync(preview.memoryDir).mode & 0o777;
  fs.chmodSync(preview.memoryDir, 0o555);
  try {
    const result = (
      await rpc('deletionConfirm', { slug: failure.slug, token: preview.token, eraseMemory: true })
    ).deletion;
    assert.equal(result.phase, 'incomplete');
    assert.equal(result.memory, 'pending');
    assert.ok(result.cleanupAccepted);
    assert.ok(result.failure);
    await assert.rejects(rpc('resume', { slug: failure.slug }));
    evidence.failureBot = failure.slug;
    record('real-Host-injected-filesystem-failure-keeps-terminal-fence-and-pending-cleanup');
  } finally {
    if (fs.existsSync(preview.memoryDir)) fs.chmodSync(preview.memoryDir, mode);
  }
}
fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
