import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { messagingDefaults, commitMessagingDefaults } from '../src/messaging/defaults.js';
import { readMessagingIdentity } from '../src/messaging/identity.js';
import { groupReceptionPolicy } from '../src/messaging/group-policy.js';
import { createTempRoot } from './helpers.js';
it('upgrades legacy choices without reinterpreting identity, group policy, or Human Thread overrides', () => {
  const home = createTempRoot('bh-defaults-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 51),
    ),
  });
  const at = '2026-10-03T00:00:00Z';
  attachOperationalModule(prior, 'messaging').transaction((db) => {
    db.prepare(
      'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, enabled, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ).run('identity', 'ada', 'lark', 'feishu', 'app', 'a'.repeat(64), at, 0, 'QA');
    db.prepare(
      'INSERT INTO messaging_grants (id, binding_id, bot_slug, body, revision, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run('grant', 'identity', 'ada', JSON.stringify({ platform: 'feishu' }), 1, at);
    db.prepare(
      'INSERT INTO messaging_group_policy_revisions (grant_id, revision, body) VALUES (?, ?, ?)',
    ).run(
      'grant',
      2,
      JSON.stringify({
        collection: 'all',
        wake: 'silent',
        count: 7,
        intervalSeconds: 42,
        revision: 2,
        editor: { kind: 'human' },
        changedAt: at,
      }),
    );
    db.prepare(
      'INSERT INTO messaging_thread_policy_revisions (grant_id, thread_id, revision, body) VALUES (?, ?, ?, ?)',
    ).run('grant', 'topic', 1, JSON.stringify({ mode: 'exclude', editor: { kind: 'human' } }));
  });
  prior.close();
  const next = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(next.mode).toBe('ready');
    const port = attachOperationalModule(next, 'messaging');
    port.transaction((db) => {
      const { revision, changedAt: _at, ...preferences } = messagingDefaults(db);
      commitMessagingDefaults(db, {
        ...preferences,
        expectedRevision: revision,
        collection: 'mentions',
        identityEnabled: true,
      });
    });
    expect(port.read((db) => readMessagingIdentity(db, 'identity'))).toMatchObject({
      enabled: false,
      enabledInheritance: 'custom',
      revision: 1,
    });
    expect(port.read((db) => groupReceptionPolicy(db, 'grant'))).toMatchObject({
      collection: 'all',
      wake: 'silent',
      count: 7,
      inheritance: 'custom',
      revision: 2,
    });
    expect(
      port.read((db) => db.prepare('SELECT body FROM messaging_thread_policy_revisions').get()),
    ).toEqual({ body: '{"mode":"exclude","editor":{"kind":"human"}}' });
  } finally {
    next.close();
  }
});
