import fs from 'node:fs';
import assert from 'node:assert/strict';
import path from 'node:path';

const instance = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const origin = new URL(instance.url).origin;
const login = await fetch(instance.url, { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
assert.ok(cookie, 'Host login cookie');
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
    signal: AbortSignal.timeout(60_000),
  });
  const result = (await response.json()).result;
  if (!result?.ok) throw new Error(`${method}: ${result?.error?.message ?? response.status}`);
  return result.value;
}
const evidence = { startedAt: new Date().toISOString(), checks: [], bots: {} };
function record(name, details) {
  evidence.checks.push({ name, ...details });
  console.log(name);
}
const retained = (
  await rpc('create', { displayName: 'QA896 retained Memory', persona: '# QA896 Soul\n' })
).bot;
const erased = (
  await rpc('create', { displayName: 'QA896 erased Memory', persona: '# QA896 disposable Soul\n' })
).bot;
const working = (
  await rpc('create', { displayName: 'QA896 stop active Agent', persona: '# QA896 execution\n' })
).bot;
evidence.bots = { retained: retained.slug, erased: erased.slug, working: working.slug };
const dm = (await rpc('channelDm', { slug: retained.slug })).channel;
await rpc('channelSend', {
  channelId: dm.id,
  body: 'Invoke channel_send in this DM with text QA896_READY. Do not use other tools.',
  messageId: `human-${crypto.randomUUID()}`,
});
let ready = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const messages = (await rpc('channelMessages', { channelId: dm.id, limit: 30 })).messages;
  if (
    messages.some(
      (message) => message.author?.kind === 'bot' && message.body?.includes('QA896_READY'),
    )
  ) {
    ready = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(ready, 'Real model DM reply');
record('real-model-DM-reply', { channelId: dm.id });
let reviewed = (await rpc('deletionPreview', { slug: retained.slug })).preview;
assert.ok(reviewed.dependencies.sessions.length > 0, 'Native Session ownership in preview');
fs.writeFileSync(
  path.join(reviewed.memoryDir, 'uncommitted-qa.md'),
  'QA896 preserve uncommitted bytes\n',
);
const folder = (await rpc('deletionMemoryFolder', { slug: retained.slug })).target;
assert.equal(folder.path, reviewed.memoryDir);
record('native-folder-target', { kind: folder.kind });
const retainedState = (
  await rpc('deletionConfirm', { slug: retained.slug, token: reviewed.token, eraseMemory: false })
).deletion;
assert.equal(retainedState.phase, 'complete');
assert.equal(retainedState.memory, 'retained');
assert.equal(
  fs.readFileSync(path.join(retainedState.memoryDir, 'uncommitted-qa.md'), 'utf8'),
  'QA896 preserve uncommitted bytes\n',
);
assert.ok(fs.existsSync(path.join(retainedState.memoryDir, '.git')));
assert.ok((await rpc('sessions', { slug: retained.slug })).sessions.length > 0);
assert.ok(
  (await rpc('channelMessages', { channelId: dm.id })).messages.some((message) =>
    message.body?.includes('QA896_READY'),
  ),
);
await assert.rejects(rpc('resume', { slug: retained.slug }));
await assert.rejects(
  rpc('channelSend', {
    channelId: dm.id,
    body: 'late input',
    messageId: `human-${crypto.randomUUID()}`,
  }),
);
record('retain-Memory-native-history-and-late-input-denial', {
  phase: retainedState.phase,
  memory: retainedState.memory,
});
reviewed = (await rpc('deletionPreview', { slug: erased.slug })).preview;
assert.ok(reviewed.eraseAvailable, 'Dedicated default Memory erasure');
const erasedState = (
  await rpc('deletionConfirm', { slug: erased.slug, token: reviewed.token, eraseMemory: true })
).deletion;
assert.equal(erasedState.phase, 'complete');
assert.equal(erasedState.memory, 'erased');
assert.ok(!fs.existsSync(erasedState.memoryDir));
record('explicit-Memory-erasure', { phase: erasedState.phase, memory: erasedState.memory });
const activeDm = (await rpc('channelDm', { slug: working.slug })).channel;
await rpc('channelSend', {
  channelId: activeDm.id,
  body: 'First invoke channel_send in this DM with text QA896_WORKING. Then invoke native bash with command sleep 30 and description QA896 deletion timer. Wait for Human approval. Do not use other tools.',
  messageId: `human-${crypto.randomUUID()}`,
});
let pending = false;
for (let attempt = 0; attempt < 60; attempt++) {
  const messages = (await rpc('channelMessages', { channelId: activeDm.id, limit: 30 })).messages;
  if (messages.some((message) => message.toolApprovalRequest !== undefined)) {
    pending = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert.ok(pending, 'Live native tool awaiting Human approval');
reviewed = (await rpc('deletionPreview', { slug: working.slug })).preview;
const activeState = (
  await rpc('deletionConfirm', { slug: working.slug, token: reviewed.token, eraseMemory: false })
).deletion;
assert.equal(activeState.phase, 'complete');
record('drain-real-Agent-awaiting-native-approval', {
  phase: activeState.phase,
  sessions: reviewed.dependencies.sessions,
});
evidence.finishedAt = new Date().toISOString();
fs.writeFileSync(
  new URL('./backend-e2e.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
