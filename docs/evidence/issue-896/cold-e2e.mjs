import fs from 'node:fs';
import assert from 'node:assert/strict';
const instance = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const evidence = JSON.parse(
  fs.readFileSync(new URL('./backend-e2e.json', import.meta.url), 'utf8'),
);
const origin = new URL(instance.url).origin;
const login = await fetch(instance.url, { redirect: 'manual' });
const cookie = login.headers.get('set-cookie')?.split(';')[0];
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
const roster = (await rpc('list')).bots;
for (const slug of Object.values(evidence.bots)) {
  assert.ok(roster.find((bot) => bot.slug === slug)?.deleted);
  assert.equal((await rpc('deletionPreview', { slug })).preview.deletion.phase, 'complete');
  await assert.rejects(rpc('resume', { slug }));
}
const retained = (await rpc('deletionPreview', { slug: evidence.bots.retained })).preview;
assert.equal(retained.deletion.memory, 'retained');
assert.ok(fs.existsSync(retained.memoryDir));
const erased = (await rpc('deletionPreview', { slug: evidence.bots.erased })).preview;
assert.equal(erased.deletion.memory, 'erased');
assert.ok(!fs.existsSync(erased.memoryDir));
await assert.rejects(rpc('deletionMemoryFolder', { slug: evidence.bots.erased }));
assert.ok((await rpc('sessions', { slug: evidence.bots.retained })).sessions.length > 0);
const channelId = evidence.checks.find((check) => check.name === 'real-model-DM-reply').channelId;
assert.ok(
  (await rpc('channelMessages', { channelId })).messages.some((message) =>
    message.body?.includes('QA896_READY'),
  ),
);
await assert.rejects(
  rpc('channelSend', {
    channelId,
    body: 'cold late input',
    messageId: `human-${crypto.randomUUID()}`,
  }),
);
evidence.checks.push({
  name: 'cold-restart-terminal-fence-Memory-outcome-and-native-history',
  passed: true,
});
evidence.humanReviewBots = [];
for (const displayName of ['Human QA896 keep Memory', 'Human QA896 erase Memory']) {
  const bot = (
    await rpc('create', {
      displayName,
      persona: '# Human QA896\nThis Memory is disposable QA content.\n',
    })
  ).bot;
  evidence.humanReviewBots.push({ slug: bot.slug, displayName });
}
evidence.coldCheckedAt = new Date().toISOString();
fs.writeFileSync(
  new URL('./backend-e2e.json', import.meta.url),
  JSON.stringify(evidence, null, 2) + '\n',
);
console.log('cold-restart-terminal-fence-Memory-outcome-and-native-history');
console.log('two-disposable-active-Bots-ready-for-Human-UI-review');
