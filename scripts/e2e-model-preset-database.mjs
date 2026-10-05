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
const scenePath = resolve(evidence, 'scene.json');
const { rpc } = assignmentProbe({ origin, home });
const legacyFile = resolve(home, 'botharness/model-presets.json');
const hash = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function databaseProof() {
  const db = new DatabaseSync(resolve(home, 'botharness/botharness.db'), { readOnly: true });
  try {
    const generation = db.prepare('SELECT generation FROM _botharness_schema').get().generation;
    const table = db.prepare("SELECT name FROM sqlite_master WHERE name='model_presets'").get();
    return {
      generation,
      templates: table
        ? db
            .prepare('SELECT body FROM model_presets')
            .all()
            .map((row) => JSON.parse(row.body))
        : [],
      cutover: table
        ? Boolean(db.prepare('SELECT singleton FROM model_presets_import').get())
        : false,
    };
  } finally {
    db.close();
  }
}
let scene;
if (phase === 'prepare') {
  assert.ok(!existsSync(scenePath));
  assert.equal(databaseProof().generation, 53);
  const { models } = await rpc('modelCatalog');
  const model =
    models.find((m) => m.provider.startsWith('deepseek') && m.model.includes('flash')) ??
    models.find((m) => m.provider.startsWith('deepseek'));
  assert.ok(model);
  const effort =
    model.efforts.find((e) => e.id === 'low') ??
    model.efforts.find((e) => e.id === 'off') ??
    model.efforts[0];
  const route = {
    provider: model.provider,
    model: model.model,
    ...(effort?.id ? { reasoningEffort: effort.id } : {}),
  };
  const { preset } = await rpc('modelPresetCreate', {
    name: 'Legacy migration QA',
    orchestrator: route,
    assignmentDefault: route,
  });
  const bots = [];
  for (const name of ['First migration QA', 'Second migration QA']) {
    const { bot } = await rpc('create', {
      displayName: name,
      persona: 'Reply exactly with the requested acknowledgement. Do not use tools.',
    });
    const { channel } = await rpc('channelDm', { slug: bot.slug });
    const { plan } = await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    bots.push({ slug: bot.slug, channelId: channel.id, plan });
  }
  scene = { preset, bots };
  writeFileSync(scenePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
  assert.equal(JSON.parse(readFileSync(legacyFile, 'utf8'))[0].id, preset.id);
  writeFileSync(resolve(evidence, 'legacy-original.json'), readFileSync(legacyFile), {
    mode: 0o600,
  });
} else scene = JSON.parse(readFileSync(scenePath, 'utf8'));
let replyConfirmed = false;
if (phase !== 'prepare') {
  const state = databaseProof();
  assert.equal(state.generation, 54);
  assert.equal(state.cutover, true);
  if (phase === 'migration' && !scene.updated) {
    assert.deepEqual((await rpc('modelPresets')).presets, [scene.preset]);
    const changed = (
      await rpc('modelPresetUpdate', {
        id: scene.preset.id,
        expectedRevision: scene.preset.revision,
        name: 'SQLite migration QA',
        orchestrator: scene.preset.orchestrator,
        assignmentDefault: scene.preset.assignmentDefault,
      })
    ).preset;
    assert.equal(changed.revision, scene.preset.revision + 1);
    scene.updated = changed;
    writeFileSync(scenePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
    writeFileSync(legacyFile, 'intentionally damaged QA source after successful cutover');
  }
  assert.deepEqual((await rpc('modelPresets')).presets, [scene.updated]);
  assert.deepEqual(databaseProof().templates, [scene.updated]);
  for (const bot of scene.bots)
    assert.deepEqual((await rpc('modelPlan', { slug: bot.slug })).plan, bot.plan);
  if (!scene.replyBot) {
    const { bot } = await rpc('create', {
      displayName: 'Migrated preset reply QA',
      persona: 'Use channel_send to reply in this DM when requested. Do not use other tools.',
    });
    const { channel } = await rpc('channelDm', { slug: bot.slug });
    await rpc('modelPresetApply', { slug: bot.slug, presetId: scene.updated.id });
    scene.replyBot = { slug: bot.slug, channelId: channel.id };
    writeFileSync(scenePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
  }
  const acknowledgement = 'MODEL_PRESET_DATABASE_' + phase.toUpperCase() + '_OK';
  await rpc('channelSend', {
    channelId: scene.replyBot.channelId,
    body: 'Call channel_send in this DM to reply with exactly: ' + acknowledgement,
  });
  await waitFor(async () => {
    const { messages } = await rpc('channelMessages', { channelId: scene.replyBot.channelId });
    return messages.some((m) => m.author?.kind === 'bot' && m.body?.includes(acknowledgement));
  }, 'real DSH model acknowledgement');
  replyConfirmed = true;
}
const proof = {
  phase,
  passed: true,
  templateId: scene.preset.id,
  revision: phase === 'prepare' ? scene.preset.revision : scene.updated.revision,
  databaseGeneration: databaseProof().generation,
  databaseCutover: databaseProof().cutover,
  independentBotPlans: scene.bots.map((b) => ({
    slug: b.slug,
    revision: b.plan.revision,
    sha256: hash(b.plan),
  })),
  realModelReply: replyConfirmed,
  browserInteractionVerified: false,
};
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(JSON.stringify(proof));
