import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

it('moves every binding to automatic admission and marks existing grants explicit at generation 61', () => {
  const home = createTempRoot('bh1108-upgrade-');
  const priorPlan = defineSchemaPlan(
    BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 61),
  );
  const prior = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  const seed = attachOperationalModule(prior, 'test');
  const grant = (id: string, revoked: boolean) => ({
    id,
    bindingId: 'binding',
    botSlug: 'ada',
    targetRef: id,
    revision: 3,
    receiveScope: { kind: 'group', conversationId: `oc_${id}` },
    ...(revoked ? { revokedAt: '2026-10-05' } : {}),
  });
  seed.transaction((db) => {
    db.prepare(
      "INSERT INTO messaging_bindings(id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled) VALUES ('binding','ada','dsh-im/feishu','feishu','lark-app','fp','2026-10-01',0)",
    ).run();
    for (const [id, revoked] of [
      ['live', false],
      ['gone', true],
    ] as const)
      db.prepare(
        'INSERT INTO messaging_grants(id,binding_id,bot_slug,revision,created_at,revoked_at,body) VALUES (?,?,?,?,?,?,?)',
      ).run(
        id,
        'binding',
        'ada',
        3,
        '2026-10-02',
        revoked ? '2026-10-05' : null,
        JSON.stringify(grant(id, revoked)),
      );
  });
  prior.close();
  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  expect(
    port.read((db) =>
      db.prepare('SELECT enabled, new_conversations FROM messaging_bindings').all(),
    ),
  ).toEqual([{ enabled: 0, new_conversations: 'auto' }]);
  const rows = port.read((db) =>
    db.prepare('SELECT id, revision, revoked_at, body FROM messaging_grants ORDER BY id').all(),
  ) as { id: string; revision: number; revoked_at: string | null; body: string }[];
  expect(rows.map((row) => [row.id, row.revision, row.revoked_at])).toEqual([
    ['gone', 3, '2026-10-05'],
    ['live', 3, null],
  ]);
  for (const row of rows)
    expect(JSON.parse(row.body)).toEqual({
      ...grant(row.id, row.revoked_at !== null),
      origin: 'explicit',
    });
  expect(() =>
    port.transaction((db) =>
      db.prepare("UPDATE messaging_bindings SET new_conversations = 'sometimes'").run(),
    ),
  ).toThrow();
  const implicit = (id: string) =>
    JSON.stringify({
      id,
      origin: 'implicit',
      receiveScope: { kind: 'dm', conversationId: 'oc_a' },
    });
  port.transaction((db) =>
    db
      .prepare(
        "INSERT INTO messaging_grants(id,binding_id,bot_slug,revision,created_at,body) VALUES ('i1','binding','ada',1,'2026-10-07',?)",
      )
      .run(implicit('i1')),
  );
  expect(() =>
    port.transaction((db) =>
      db
        .prepare(
          "INSERT INTO messaging_grants(id,binding_id,bot_slug,revision,created_at,body) VALUES ('i2','binding','ada',1,'2026-10-07',?)",
        )
        .run(implicit('i2')),
    ),
  ).toThrow();
  expect(port.read((db) => db.prepare('PRAGMA foreign_key_check').all())).toEqual([]);
  current.close();
  const old = mountOperationalDatabase({ dshHome: home, schemaPlan: priorPlan });
  expect(old.mode).toBe('recovery');
  expect(old.recovery?.code).toBe('upgrade-required');
  old.close();
});
