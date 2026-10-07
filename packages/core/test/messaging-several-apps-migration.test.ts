import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

it('drops the one-app-per-platform index at generation 63 and keeps one app per Bot', () => {
  const home = createTempRoot('bh1110-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 63),
    ),
  });
  const insert =
    'INSERT INTO messaging_bindings(id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled) VALUES (?,?,?,?,?,?,?,1)';
  attachOperationalModule(prior, 'test').transaction((db) => {
    db.prepare(insert).run('one', 'ada', 'dsh-im/feishu', 'feishu', 'app-1', 'f1', '2026-10-01');
    expect(() =>
      db.prepare(insert).run('two', 'ada', 'dsh-im/feishu', 'feishu', 'app-2', 'f2', '2026-10-01'),
    ).toThrow();
  });
  prior.close();
  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  port.transaction((db) =>
    db.prepare(insert).run('two', 'ada', 'dsh-im/feishu', 'feishu', 'app-2', 'f2', '2026-10-02'),
  );
  expect(() =>
    port.transaction((db) =>
      db
        .prepare(insert)
        .run('three', 'bea', 'dsh-im/feishu', 'feishu', 'app-1', 'f3', '2026-10-02'),
    ),
  ).toThrow();
  expect(
    port.read((db) => db.prepare('SELECT id FROM messaging_bindings ORDER BY id').all()),
  ).toEqual([{ id: 'one' }, { id: 'two' }]);
  current.close();
});
