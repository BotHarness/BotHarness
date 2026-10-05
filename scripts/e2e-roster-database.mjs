import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assignmentProbe } from './e2e-assignment-probe.mjs';

const { BH_E2E_ORIGIN: origin, BH_E2E_HOME: home, BH_E2E_EVIDENCE: evidence } = process.env;
assert.ok(origin && home && evidence);
const phase = process.argv[2];
assert.ok(['prepare', 'migration', 'restart'].includes(phase));
const client = assignmentProbe({ origin, home });
const secondClient = assignmentProbe({ origin, home });
const { rpc } = client;
mkdirSync(evidence, { recursive: true });
const sceneFile = resolve(evidence, 'scene.json');
const sourceFile = resolve(home, 'storages/botharness_roster.json');
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
function databaseProof() {
  const db = new DatabaseSync(resolve(home, 'botharness/botharness.db'), { readOnly: true });
  try {
    const generation = db.prepare('SELECT generation FROM _botharness_schema').get().generation;
    return generation < 56
      ? { generation, imported: false }
      : {
          generation,
          imported:
            db.prepare('SELECT singleton FROM roster_arrangement_import').get()?.singleton === 1,
          record: JSON.parse(db.prepare('SELECT body FROM roster_arrangement').get().body),
        };
  } finally {
    db.close();
  }
}
let scene;
if (phase === 'prepare') {
  assert.ok(!existsSync(sceneFile));
  assert.equal(databaseProof().generation, 55);
  const channels = [];
  for (const name of ['Research A', 'Research B', 'Hidden history QA', 'Loose QA', 'Pinned QA']) {
    const { channel } = await rpc('channelCreate', { name, members: [] });
    const { message } = await rpc('channelSend', {
      channelId: channel.id,
      body: 'Retain this history while arranging: ' + name,
    });
    channels.push({ id: channel.id, name, messageId: message.id, body: message.body });
  }
  const { section: first } = await rpc('sectionCreate', { name: '研究' });
  const { section: second } = await rpc('sectionCreate', { name: '工作' });
  await rpc('channelAssign', { channelId: channels[0].id, sectionId: first.id });
  await rpc('channelAssign', { channelId: channels[1].id, sectionId: first.id });
  await rpc('channelAssign', { channelId: channels[2].id, sectionId: second.id });
  await rpc('sectionReorder', { order: [first.id, second.id] });
  await rpc('pinsSet', { pins: [channels[4].id, channels[0].id] });
  await rpc('hiddenSet', { hidden: [channels[2].id] });
  await rpc('topReorder', {
    order: [
      { kind: 'section', id: first.id },
      { kind: 'channel', id: channels[3].id },
      { kind: 'section', id: second.id },
      { kind: 'channel', id: channels[4].id },
    ],
  });
  const baseline = await rpc('rosterGet');
  assert.ok(existsSync(sourceFile));
  scene = {
    channels,
    first,
    second,
    baseline,
    sourceSha256: hash(readFileSync(sourceFile, 'utf8')),
  };
  writeFileSync(sceneFile, JSON.stringify(scene, null, 2), { mode: 0o600 });
} else scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
let crossConnectionRefreshVerified = false;
if (phase !== 'prepare') {
  assert.equal(databaseProof().generation, 56);
  assert.equal(databaseProof().imported, true);
  if (phase === 'migration') {
    assert.deepEqual(await rpc('rosterGet'), scene.baseline);
    assert.equal(hash(readFileSync(sourceFile, 'utf8')), scene.sourceSha256);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const stream = await fetch(origin + '/api/botharness/stream?scope=roster', {
      headers: { cookie: secondClient.cookie },
      signal: controller.signal,
    });
    assert.equal(stream.status, 200);
    const reader = stream.body.getReader();
    await reader.read();
    try {
      const invalidation = (async () => {
        let text = '';
        while (!text.includes('event: roster/changed')) {
          const chunk = await reader.read();
          assert.equal(chunk.done, false);
          text += new TextDecoder().decode(chunk.value);
        }
        return secondClient.rpc('rosterGet');
      })();
      await rpc('sectionRename', { sectionId: scene.first.id, name: 'SQLite Research QA' });
      assert.deepEqual(await invalidation, await rpc('rosterGet'));
      crossConnectionRefreshVerified = true;
    } finally {
      clearTimeout(timeout);
      controller.abort();
      await reader.cancel().catch(() => {});
    }
    await rpc('rosterBatch', {
      action: 'move',
      channelIds: [scene.channels[1].id, scene.channels[3].id],
      sectionId: scene.second.id,
    });
    await rpc('rosterBatch', {
      action: 'pin',
      channelIds: [scene.channels[1].id, scene.channels[3].id],
    });
    await rpc('rosterBatch', { action: 'unpin', channelIds: [scene.channels[1].id] });
    await rpc('hiddenSet', { hidden: [scene.channels[2].id] });
    await rpc('rosterBatch', { action: 'hide', channelIds: [scene.channels[1].id] });
    await rpc('channelAssign', {
      channelId: scene.channels[4].id,
      sectionId: scene.first.id,
      index: 0,
    });
    await rpc('pinsSet', { pins: [scene.channels[4].id, scene.channels[3].id] });
    const { section: temporary } = await rpc('sectionCreate', { name: 'Temporary arrangement QA' });
    await rpc('channelAssign', { channelId: scene.channels[0].id, sectionId: temporary.id });
    assert.equal((await rpc('sectionRemove', { sectionId: temporary.id })).removed, true);
    await rpc('sectionReorder', { order: [scene.second.id, scene.first.id] });
    await rpc('topReorder', {
      order: [
        { kind: 'section', id: scene.second.id },
        { kind: 'channel', id: scene.channels[0].id },
        { kind: 'section', id: scene.first.id },
      ],
    });
    scene.expected = await rpc('rosterGet');
    assert.deepEqual(await secondClient.rpc('rosterGet'), scene.expected);
    assert.equal(hash(readFileSync(sourceFile, 'utf8')), scene.sourceSha256);
    writeFileSync(sourceFile, '{damaged task-only retained roster source after cutover');
    scene.crossConnectionRefreshVerified = crossConnectionRefreshVerified;
    writeFileSync(sceneFile, JSON.stringify(scene, null, 2), { mode: 0o600 });
  }
  assert.deepEqual(await rpc('rosterGet'), scene.expected);
  assert.deepEqual(await secondClient.rpc('rosterGet'), scene.expected);
  const all = (await rpc('channels')).channels;
  for (const channel of scene.channels) {
    assert.ok(all.some((entry) => entry.id === channel.id));
    const { messages } = await rpc('channelMessages', { channelId: channel.id });
    assert.ok(
      messages.some((message) => message.id === channel.messageId && message.body === channel.body),
    );
  }
  if (phase === 'restart')
    assert.equal(
      readFileSync(sourceFile, 'utf8'),
      '{damaged task-only retained roster source after cutover',
    );
}
const proof = {
  phase,
  passed: true,
  databaseGeneration: databaseProof().generation,
  databaseCutover: databaseProof().imported,
  arrangement: phase === 'prepare' ? scene.baseline : scene.expected,
  arrangementSha256: hash(phase === 'prepare' ? scene.baseline : scene.expected),
  retainedLegacySourceSha256: scene.sourceSha256,
  crossConnectionRefreshVerified:
    phase === 'restart' ? scene.crossConnectionRefreshVerified : crossConnectionRefreshVerified,
  channelHistoryRetained: phase !== 'prepare',
  browserInteractionVerified: false,
  actualSecondBrowserClientVerified: false,
};
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(
  JSON.stringify({
    phase,
    passed: true,
    generation: proof.databaseGeneration,
    browserInteractionVerified: false,
  }),
);
