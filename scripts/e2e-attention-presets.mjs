/** Live #364 tracer against an already running isolated DSH Web Host. */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const port = Number(process.argv[2]);
const home = process.argv[3];
if (!Number.isSafeInteger(port) || typeof home !== 'string') {
  throw new Error('Usage: node scripts/e2e-attention-presets.mjs <port> <DSH_HOME>');
}
const cookie = readFileSync(
  `/tmp/dsh-${basename(home).replace(/[^a-zA-Z0-9-]/gu, '-')}.cookies`,
  'utf8',
).split(';')[0];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function rpc(method, args = {}) {
  const response = await fetch(`http://127.0.0.1:${port}/api/botharness/${method}`, {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `attention-${method}-${Date.now()}`,
      method: `botharness/${method}`,
      payload: { args },
    }),
  });
  const envelope = await response.json();
  if (response.status !== 200 || envelope.result?.ok !== true)
    throw new Error(
      `${method}: HTTP ${response.status}, ${JSON.stringify(envelope.result?.error)}`,
    );
  return envelope.result.value;
}

async function waitForReply(channelId, marker) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const timeline = await rpc('channelTimeline', { channelId });
    const reply = (timeline.page?.entries ?? []).find(
      (entry) => entry.author?.kind === 'bot' && entry.body.includes(marker),
    );
    if (reply !== undefined) return reply;
    await sleep(2_000);
  }
  throw new Error(`No real Bot reply containing ${marker}`);
}

async function waitForAttention(slug, marker, state) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const item = (await rpc('botAttention', { slug })).items.find((row) =>
      row.summary?.includes(marker),
    );
    if (item?.state === state) return item;
    await sleep(500);
  }
  throw new Error(`Admission ${marker} did not reach ${state}`);
}

if (process.argv[4] === '--verify-restart') {
  const [, , , , , botSlug, groupId, silentMarker] = process.argv;
  if (!botSlug || !groupId || !silentMarker)
    throw new Error('Restart check requires <botSlug> <groupId> <silentMarker>');
  const group = (await rpc('channels')).channels.find((channel) => channel.id === groupId);
  const policy = group?.wakePolicies?.[botSlug];
  const admission = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
    item.summary?.includes(silentMarker),
  );
  if (policy?.mode !== 'silent' || admission?.state !== 'pending') {
    throw new Error(
      `Restart lost silent policy or pending admission: ${JSON.stringify({ policy, admission })}`,
    );
  }
  console.log(
    JSON.stringify(
      {
        ok: true,
        group: group.name,
        mode: policy.mode,
        revision: policy.revision,
        admissionState: admission.state,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const stamp = Date.now();
const displayName = `AttentionQA-${stamp}`;
const created = await rpc('create', { displayName });
const botSlug = created.bot?.slug;
if (typeof botSlug !== 'string') throw new Error('No Bot slug');
const group = (await rpc('channelCreate', { name: `Attention QA ${stamp}`, members: [botSlug] }))
  .channel;
if (typeof group?.id !== 'string') throw new Error('No Group Channel ID');

const defaultMarker = `DEFAULT-${stamp}`;
await rpc('channelSend', { channelId: group.id, body: `请稍后记住 ${defaultMarker}。` });
const defaultAdmission = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
  item.summary?.includes(defaultMarker),
);
if (defaultAdmission?.state !== 'deferred')
  throw new Error(`Unset Group policy did not default to digest: ${defaultAdmission?.state}`);

const allPolicy = await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug,
  mode: 'all',
  count: 5,
  intervalSeconds: 30,
});
if (allPolicy.channel?.wakePolicies?.[botSlug]?.revision !== 1)
  throw new Error('All policy was not persisted at revision 1');
const allMarker = `ALL-${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `请现在在本群回复一句包含 ${allMarker} 的确认。`,
});
const allReply = await waitForReply(group.id, allMarker);

await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug,
  mode: 'mentions',
  count: 5,
  intervalSeconds: 30,
});
const mentionsMarker = `MENTIONS-ORDINARY-${stamp}`;
await rpc('channelSend', { channelId: group.id, body: `普通消息 ${mentionsMarker}` });
const mentionsAdmission = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
  item.summary?.includes(mentionsMarker),
);
if (mentionsAdmission?.state !== 'pending')
  throw new Error(
    `Mentions mode ordinary message should remain pending: ${mentionsAdmission?.state}`,
  );
const directMarker = `DIRECT-${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${displayName} 请回复一句同时包含 ${directMarker} 和刚才普通消息代号的确认。`,
  mentions: [{ botSlug, label: displayName, start: 0, end: displayName.length + 1 }],
});
const directReply = await waitForReply(group.id, directMarker);
if (!directReply.body.includes(mentionsMarker))
  throw new Error('Direct mention did not carry pending same-Channel context');
const mentionsHandled = await waitForAttention(botSlug, mentionsMarker, 'handled');

const silentPolicy = await rpc('channelGroupWakeSet', {
  channelId: group.id,
  botSlug,
  mode: 'silent',
  count: 5,
  intervalSeconds: 30,
});
const silentMarker = `SILENT-${stamp}`;
await rpc('channelSend', { channelId: group.id, body: `静默记录 ${silentMarker}` });
const silentAdmission = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
  item.summary?.includes(silentMarker),
);
if (silentAdmission?.state !== 'pending')
  throw new Error(`Silent Group message was not retained: ${silentAdmission?.state}`);
const silentDirectMarker = `SILENT-DIRECT-${stamp}`;
await rpc('channelSend', {
  channelId: group.id,
  body: `@${displayName} 请回复一句包含 ${silentDirectMarker} 的确认。`,
  mentions: [{ botSlug, label: displayName, start: 0, end: displayName.length + 1 }],
});
await waitForReply(group.id, silentDirectMarker);
await waitForAttention(botSlug, silentDirectMarker, 'handled');
const silentAfterMention = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
  item.summary?.includes(silentMarker),
);
if (silentAfterMention?.state !== 'pending')
  throw new Error(`Silent ordinary message rode the direct mention: ${silentAfterMention?.state}`);

const freshDefault = (
  await rpc('channelCreate', { name: `Attention Default QA ${stamp}`, members: [botSlug] })
).channel;
if (typeof freshDefault?.id !== 'string') throw new Error('No fresh default Group ID');
const freshMarker = `FRESH-DEFAULT-${stamp}`;
await rpc('channelSend', {
  channelId: freshDefault.id,
  body: `新群的第一条普通消息 ${freshMarker}。`,
});
const freshAdmission = (await rpc('botAttention', { slug: botSlug })).items.find((item) =>
  item.summary?.includes(freshMarker),
);
if (freshAdmission?.state !== 'deferred')
  throw new Error(`Fresh Group did not start in digest mode: ${freshAdmission?.state}`);
await rpc('channelSend', {
  channelId: freshDefault.id,
  body: `@${displayName} 请回复刚才普通消息中的代号。`,
  mentions: [{ botSlug, label: displayName, start: 0, end: displayName.length + 1 }],
});
const freshReply = await waitForReply(freshDefault.id, freshMarker);
const freshHandled = await waitForAttention(botSlug, freshMarker, 'handled');

console.log(
  JSON.stringify(
    {
      ok: true,
      bot: displayName,
      botSlug,
      group: group.name,
      groupId: group.id,
      defaultState: defaultAdmission.state,
      allRevision: allPolicy.channel.wakePolicies[botSlug].revision,
      allReply: allReply.body,
      directReply: directReply.body,
      mentionsContextState: mentionsHandled.state,
      silentRevision: silentPolicy.channel.wakePolicies[botSlug].revision,
      silentState: silentAfterMention.state,
      freshDefaultGroup: freshDefault.name,
      freshDefaultState: freshAdmission.state,
      freshDefaultReply: freshReply.body,
      freshDefaultHandled: freshHandled.state,
    },
    null,
    2,
  ),
);
