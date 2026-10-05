import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zh, en } from '../packages/client/src/client/locale.ts';
import { assignmentProbe } from './e2e-assignment-probe.mjs';

const { BH_E2E_ORIGIN: origin, BH_E2E_HOME: home, BH_E2E_EVIDENCE: evidence } = process.env;
assert.ok(origin && home && evidence);
const phase = process.argv[2] ?? 'prepare';
assert.ok(['prepare', 'restart'].includes(phase));
mkdirSync(evidence, { recursive: true });
const scenePath = resolve(evidence, 'scene.json');
const { rpc } = assignmentProbe({ origin, home });
let scene;
if (phase === 'prepare') {
  assert.ok(!existsSync(scenePath), 'Use a fresh scene; do not create duplicate QA Bots.');
  scene = [];
  for (const [kind, persona] of [
    ['colleague', zh['bot.create.persona.colleague.seed'].replace('[名字]', 'Ada')],
    ['roleplay', en['bot.create.persona.roleplay.seed'].replace('[name]', 'Lunar librarian')],
    ['blank', ''],
  ]) {
    const { bot } = await rpc('create', {
      displayName: 'Persona starting point QA: ' + kind,
      roles: [],
      persona,
    });
    const { channel } = await rpc('channelDm', { slug: bot.slug });
    scene.push({ kind, slug: bot.slug, channelId: channel.id, persona });
    writeFileSync(scenePath, JSON.stringify(scene, null, 2), { mode: 0o600 });
  }
} else scene = JSON.parse(readFileSync(scenePath, 'utf8'));
assert.equal(scene.length, 3);
const proof = [];
for (const entry of scene) {
  const { bot } = await rpc('get', { slug: entry.slug });
  assert.equal(bot.displayName, 'Persona starting point QA: ' + entry.kind);
  assert.deepEqual(bot.roles, []);
  assert.deepEqual(bot.workspaces, []);
  assert.equal(bot.preset, undefined);
  const file = resolve(home, 'botharness', 'bots', entry.slug, 'memory', 'PERSONA.md');
  if (entry.persona === '')
    assert.ok(!existsSync(file), 'Blank preserves the existing empty-memory creation path.');
  else
    assert.equal(
      readFileSync(file, 'utf8'),
      entry.persona,
      'Exact Human-edited seed is canonical, not preset metadata.',
    );
  proof.push({
    kind: entry.kind,
    slug: entry.slug,
    channelId: entry.channelId,
    exactPersona: true,
    personaBytes: Buffer.byteLength(entry.persona),
    personaSha256: createHash('sha256').update(entry.persona).digest('hex'),
    noModelPreset: true,
    noWorkspaceGrants: true,
  });
}
if (phase === 'restart')
  assert.deepEqual(proof, JSON.parse(readFileSync(resolve(evidence, 'prepare.json'), 'utf8')));
writeFileSync(resolve(evidence, phase + '.json'), JSON.stringify(proof, null, 2) + '\n');
console.log(
  JSON.stringify({ phase, bots: proof.length, passed: true, browserInteractionVerified: false }),
);
