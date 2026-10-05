import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { assignmentProbe, waitFor } from './e2e-assignment-probe.mjs';

const { BH_E2E_ORIGIN: origin, BH_E2E_HOME: home, BH_E2E_EVIDENCE: evidence } = process.env;
assert.ok(origin && home && evidence);
const phase = process.argv[2];
assert.ok(['prepare', 'migration', 'restart'].includes(phase));
mkdirSync(evidence, { recursive: true });
const sceneFile = resolve(evidence, 'scene.json');
const { rpc } = assignmentProbe({ origin, home });
const hash = (value) =>
  createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex');
const fileFor = (slug) => resolve(home, 'botharness/bots', slug, 'bot.json');
const soulFor = (slug) => resolve(home, 'botharness/bots', slug, 'memory/PERSONA.md');
const recipe = {
  schemaVersion: 1,
  family: 'line',
  assetVersion: 1,
  rigVersion: 1,
  eyes: 'dots',
  brows: 'flat',
  nose: 'line',
  mouth: 'smile',
  cheeks: 'none',
  glasses: 'none',
  symbol: 'none',
  spacing: 0,
  height: 0,
  tilt: 0,
  backgroundColor: '#f3d9d2',
  inkColor: '#1d2433',
};
function databaseProof() {
  const db = new DatabaseSync(resolve(home, 'botharness/botharness.db'), { readOnly: true });
  try {
    const generation = db.prepare('SELECT generation FROM _botharness_schema').get().generation;
    if (generation < 55) return { generation, cutover: false, records: [] };
    return {
      generation,
      cutover: Boolean(db.prepare('SELECT singleton FROM persona_bots_import').get()),
      records: db
        .prepare('SELECT body FROM persona_bots ORDER BY slug')
        .all()
        .map((r) => JSON.parse(r.body)),
    };
  } finally {
    db.close();
  }
}
let scene;
if (phase === 'prepare') {
  assert.ok(!existsSync(sceneFile));
  assert.equal(databaseProof().generation, 54);
  const { models } = await rpc('modelCatalog');
  const model =
    models.find((m) => m.provider.startsWith('deepseek') && m.model.includes('flash')) ??
    models.find((m) => m.provider.startsWith('deepseek'));
  assert.ok(model);
  const effort = model.efforts.find((e) => e.id === 'low') ?? model.efforts[0];
  const route = {
    provider: model.provider,
    model: model.model,
    ...(effort?.id ? { reasoningEffort: effort.id } : {}),
  };
  const allowedEfforts = model.efforts.map((e) => e.id);
  const { preset } = await rpc('modelPresetCreate', {
    name: 'Registry baseline template',
    orchestrator: route,
    assignmentDefault: route,
  });
  const bots = [];
  for (const name of ['Registry migration QA', 'Paused Registry QA']) {
    const { bot } = await rpc('create', {
      displayName: name,
      roles: ['Migration QA'],
      persona:
        'Call channel_send in this DM when asked to reply with an acknowledgement. Do not use other tools.',
    });
    const { channel } = await rpc('channelDm', { slug: bot.slug });
    await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    await rpc('botAppearanceSet', { channelId: channel.id, recipe });
    if (bots.length === 1) {
      await rpc('pause', { slug: bot.slug });
      await rpc('computerAccessSet', { slug: bot.slug, enabled: true });
      await rpc('browserAccessSet', { slug: bot.slug, enabled: true });
      await rpc('browserProfileSet', { slug: bot.slug, profile: 'registry-qa' });
    }
    bots.push({
      slug: bot.slug,
      channelId: channel.id,
      record: JSON.parse(readFileSync(fileFor(bot.slug), 'utf8')),
      soulSha256: hash(readFileSync(soulFor(bot.slug), 'utf8')),
    });
  }
  scene = { bots, preset, allowedEfforts };
  writeFileSync(sceneFile, JSON.stringify(scene, null, 2), { mode: 0o600 });
} else scene = JSON.parse(readFileSync(sceneFile, 'utf8'));
let realModelReply = false;
if (phase !== 'prepare') {
  const state = databaseProof();
  assert.equal(state.generation, 55);
  assert.equal(state.cutover, true);
  if (phase === 'migration' && !scene.updated) {
    for (const b of scene.bots)
      assert.deepEqual(
        state.records.find((r) => r.slug === b.slug),
        b.record,
      );
    const first = scene.bots[0];
    await rpc('update', {
      slug: first.slug,
      patch: {
        displayName: 'SQLite Registry QA',
        description: 'Saved after Registry migration',
        roles: ['Database QA'],
      },
    });
    await rpc('botAppearanceSet', {
      channelId: first.channelId,
      recipe: { ...recipe, eyes: 'big' },
    });
    const route = first.record.modelPlan.assignmentDefault;
    await rpc('modelPlanAssignmentsSet', {
      slug: first.slug,
      expectedRevision: first.record.modelPlan.revision,
      assignmentDefault: route,
      assignmentModels: [
        {
          provider: route.provider,
          model: route.model,
          allowedEfforts: scene.allowedEfforts,
          defaultEffort: route.reasoningEffort ?? '',
        },
      ],
    });
    await rpc('modelPresetUpdate', {
      id: scene.preset.id,
      expectedRevision: scene.preset.revision,
      name: 'Changed template after Registry migration',
      orchestrator: route,
      assignmentDefault: route,
    });
    const { bot: created } = await rpc('create', { displayName: 'New SQLite Registry QA' });
    assert.ok(!existsSync(fileFor(created.slug)));
    scene.created = created.slug;
    scene.updated = databaseProof().records.find((r) => r.slug === first.slug);
    assert.equal(scene.updated.modelPlan.revision, first.record.modelPlan.revision + 1);
    for (const b of scene.bots) {
      assert.deepEqual(JSON.parse(readFileSync(fileFor(b.slug), 'utf8')), b.record);
      writeFileSync(fileFor(b.slug), '{damaged QA legacy source after cutover');
    }
    writeFileSync(sceneFile, JSON.stringify(scene, null, 2), { mode: 0o600 });
  }
  const first = scene.bots[0];
  assert.deepEqual(
    databaseProof().records.find((r) => r.slug === first.slug),
    scene.updated,
  );
  assert.deepEqual(
    databaseProof().records.find((r) => r.slug === scene.bots[1].slug),
    scene.bots[1].record,
  );
  assert.deepEqual((await rpc('modelPlan', { slug: first.slug })).plan, scene.updated.modelPlan);
  const { bot } = await rpc('get', { slug: first.slug });
  assert.equal(bot.displayName, scene.updated.displayName);
  assert.deepEqual(bot.appearance, scene.updated.appearance);
  for (const b of scene.bots)
    assert.equal(hash(readFileSync(soulFor(b.slug), 'utf8')), b.soulSha256);
  assert.ok((await rpc('get', { slug: scene.created })).bot);
  const acknowledgement = 'REGISTRY_DATABASE_' + phase.toUpperCase() + '_OK';
  await rpc('channelSend', {
    channelId: first.channelId,
    body: 'Call channel_send in this DM to reply with exactly: ' + acknowledgement,
  });
  await waitFor(async () => {
    const { messages } = await rpc('channelMessages', { channelId: first.channelId });
    return messages.some((m) => m.author?.kind === 'bot' && m.body?.includes(acknowledgement));
  }, 'real model reply using the retained independent Bot plan');
  realModelReply = true;
}
const proof = {
  phase,
  passed: true,
  databaseGeneration: databaseProof().generation,
  databaseCutover: databaseProof().cutover,
  bots: scene.bots.map((b, i) => ({
    slug: b.slug,
    recordSha256: hash(phase !== 'prepare' && i === 0 ? scene.updated : b.record),
    soulSha256: b.soulSha256,
    planRevision: (phase !== 'prepare' && i === 0 ? scene.updated : b.record).modelPlan.revision,
  })),
  ...(scene.created ? { newBotUsesDatabaseOnly: !existsSync(fileFor(scene.created)) } : {}),
  realModelReply,
  browserInteractionVerified: false,
};
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
