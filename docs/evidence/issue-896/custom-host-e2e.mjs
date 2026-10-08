import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
const instance = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const evidencePath = new URL('./backend-e2e.json', import.meta.url);
const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
if (process.argv[3] === 'seed-stopped-profile') {
  const { createCore } = await import(
    new URL('../../../packages/core/dist/index.mjs', import.meta.url)
  );
  const core = createCore({ dshHome: instance.home });
  const base = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'bh896-custom-')));
  const existing = path.join(base, 'pre-existing');
  fs.mkdirSync(existing);
  fs.writeFileSync(path.join(existing, 'draft.md'), 'custom disposable QA bytes');
  const cases = [
    { name: 'owned', memoryDir: path.join(base, 'new-owned') },
    { name: 'unproven', memoryDir: existing },
    { name: 'sharedParent', memoryDir: path.join(base, 'shared') },
    { name: 'sharedChild', memoryDir: path.join(base, 'shared', 'child') },
  ];
  evidence.customCases = {};
  try {
    for (const item of cases) {
      const slug = `qa896-${crypto.randomUUID().replaceAll('-', '')}`;
      const result = core.registry.create({
        slug,
        displayName: `QA896 custom ${item.name}`,
        memoryDir: item.memoryDir,
        persona: '# Disposable custom Memory\n',
      });
      assert.ok(result.ok);
      evidence.customCases[item.name] = slug;
    }
  } finally {
    await core.runtime.close();
    core.externalMessaging.close();
    core.operationalDatabase.close();
  }
  evidence.customFixture =
    'Seeded through canonical Registry API with Host stopped; verified through authenticated running Host API after restart.';
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('custom-owned-unproven-and-shared-fixtures-seeded-through-owning-Registry');
} else {
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
  const owned = evidence.customCases.owned;
  let preview = (await rpc('deletionPreview', { slug: owned })).preview;
  assert.ok(preview.eraseAvailable);
  const erased = (
    await rpc('deletionConfirm', { slug: owned, token: preview.token, eraseMemory: true })
  ).deletion;
  assert.equal(erased.memory, 'erased');
  assert.equal(erased.phase, 'complete');
  assert.ok(!fs.existsSync(preview.memoryDir));
  evidence.checks.push({ name: 'real-Host-new-custom-exclusive-Memory-erasure', passed: true });
  for (const name of ['unproven', 'sharedParent', 'sharedChild']) {
    const slug = evidence.customCases[name];
    preview = (await rpc('deletionPreview', { slug })).preview;
    assert.equal(preview.eraseAvailable, false);
    assert.ok(preview.refusal);
    await assert.rejects(rpc('deletionConfirm', { slug, token: preview.token, eraseMemory: true }));
    const retained = (
      await rpc('deletionConfirm', { slug, token: preview.token, eraseMemory: false })
    ).deletion;
    assert.equal(retained.phase, 'complete');
    assert.equal(retained.memory, 'retained');
    assert.ok(fs.existsSync(path.join(preview.memoryDir, '.git')));
    if (name === 'unproven')
      assert.equal(
        fs.readFileSync(path.join(preview.memoryDir, 'draft.md'), 'utf8'),
        'custom disposable QA bytes',
      );
  }
  evidence.checks.push({
    name: 'real-Host-unproven-and-shared-custom-paths-refuse-erasure-retain-bytes',
    passed: true,
  });
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2) + '\n');
  console.log('real-Host-new-custom-exclusive-Memory-erasure');
  console.log('real-Host-unproven-and-shared-custom-paths-refuse-erasure-retain-bytes');
}
