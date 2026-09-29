import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const port = Number(process.argv[2]);
const profileHome = process.argv[3];
if (!Number.isInteger(port) || typeof profileHome !== 'string')
  throw new Error('Usage: node scripts/e2e-group-context.mjs <port> <DSH_HOME>');

const jar = join('/tmp', `dsh-${basename(profileHome).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`);
const cookie = readFileSync(jar, 'utf8').split(';')[0];
if (!cookie.includes('=')) throw new Error('DSH authentication cookie is unavailable');

async function rpc(method, args = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/botharness/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `group-context-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(
      `${method}: HTTP ${response.status}, ${envelope.result?.error?.code ?? 'unknown'}`,
    );
  return envelope.result.value;
}

async function waitFor(check, label) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const value = await check();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

const displayName = `GroupContextQA-${Date.now()}`;
const bot = (await rpc('create', { displayName })).bot;
const group = (await rpc('channelCreate', { name: `Context ${Date.now()}`, members: [bot.slug] }))
  .channel;
await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug: bot.slug,
  mode: 'mentions',
  count: 5,
  intervalSeconds: 60,
});
const marker = `CONTEXT_${Date.now()}`;
await rpc('channelSend', { channelId: group.id, body: `本群今天的验收代号是 ${marker}。` });
const pending = (await rpc('botAttention', { slug: bot.slug })).items.find(
  (item) => item.sourceChannelId === group.id && item.summary.includes(marker),
);
if (pending?.state !== 'pending')
  throw new Error(`Ordinary message should be pending; got ${pending?.state}`);
const before = await rpc('channelTimeline', { channelId: group.id });
if ((before.page?.entries ?? []).some((item) => item.author?.kind === 'bot'))
  throw new Error('Mentions mode woke the Bot for ordinary Group traffic');

const mention = `@${displayName} 请只根据本群刚才的普通消息，回复今天的验收代号。`;
await rpc('channelSend', {
  channelId: group.id,
  body: mention,
  mentions: [{ botSlug: bot.slug, label: displayName, start: 0, end: 1 + displayName.length }],
});
const reply = await waitFor(async () => {
  const timeline = await rpc('channelTimeline', { channelId: group.id });
  return (timeline.page?.entries ?? []).find(
    (item) => item.author?.kind === 'bot' && item.body.includes(marker),
  );
}, 'real model Group reply containing prior ordinary-message marker');
const handled = await waitFor(async () => {
  const item = (await rpc('botAttention', { slug: bot.slug })).items.find(
    (row) => row.sourceChannelId === group.id && row.summary.includes(marker),
  );
  return item?.state === 'handled' ? item : undefined;
}, 'context Admission settlement');
console.log(
  JSON.stringify(
    {
      ok: true,
      botSlug: bot.slug,
      displayName,
      groupId: group.id,
      marker,
      pendingBeforeMention: pending.state,
      handledAfterTurn: handled.state,
      reply: reply.body,
    },
    null,
    2,
  ),
);
