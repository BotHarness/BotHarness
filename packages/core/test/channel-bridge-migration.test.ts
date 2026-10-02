import { expect, it } from 'vitest';
import { mountOperationalDatabase, attachOperationalModule } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot } from './helpers.js';
it('generation 50 preserves legacy placements, grant revisions and policies, and prevents older intake code from reopening', () => {
  const home = createTempRoot('bridge-migration-');
  const priorPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 50),
  );
  const prior = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  attachOperationalModule(prior, 'seed').transaction((db) => {
    db.prepare(
      "INSERT INTO messaging_bindings (id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at) VALUES ('binding','ada','qa','feishu','app','fingerprint','2026-10-03')",
    ).run();
    for (const [id, scope, target] of [
      ['on', true, true],
      ['off', false, true],
      ['inbox', true, false],
    ] as const) {
      const body = {
        id,
        bindingId: 'binding',
        revision: 7,
        targetName: 'QA group',
        ...(scope ? { receiveScope: { kind: 'group', conversationId: 'chat' } } : {}),
        ...(target ? { receiveTargetChannelId: 'local-group' } : {}),
      };
      db.prepare(
        "INSERT INTO messaging_grants (id,binding_id,bot_slug,revision,created_at,body) VALUES (?,'binding','ada',7,'2026-10-03',?)",
      ).run(id, JSON.stringify(body));
      db.prepare(
        'INSERT INTO messaging_group_policy_revisions (grant_id,revision,body) VALUES (?,2,?)',
      ).run(id, JSON.stringify({ collection: 'all', wake: 'digest', count: 3 }));
    }
  });
  prior.close();
  const next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  const rows = attachOperationalModule(next, 'check').read((db) =>
    db.prepare('SELECT id,revision,body FROM messaging_grants ORDER BY id').all(),
  ) as { id: string; revision: number; body: string }[];
  expect(rows.map((r) => r.revision)).toEqual([7, 7, 7]);
  expect(JSON.parse(rows.find((r) => r.id === 'on')!.body).channelBridge).toEqual({
    name: 'QA group',
    enabled: true,
    collection: 'all',
    revision: 1,
  });
  expect(JSON.parse(rows.find((r) => r.id === 'off')!.body).channelBridge.enabled).toBe(false);
  expect(JSON.parse(rows.find((r) => r.id === 'inbox')!.body)).not.toHaveProperty('channelBridge');
  expect(
    attachOperationalModule(next, 'check').read((db) =>
      db.prepare('SELECT * FROM messaging_group_policy_revisions').all(),
    ),
  ).toHaveLength(3);
  next.close();
  const old = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  expect(old.mode).toBe('recovery');
  expect(old.recovery).toMatchObject({ code: 'upgrade-required' });
  old.close();
});
