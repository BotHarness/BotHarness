import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { commitMessagingDefaults, messagingDefaults } from '../src/messaging/defaults.js';
import { readMessagingIdentity } from '../src/messaging/identity.js';
import { createTempRoot } from './helpers.js';

it('keeps apps set to ask as custom and lets every other app follow the platform default', () => {
  const home = createTempRoot('bh1134-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 65),
    ),
  });
  const insert =
    'INSERT INTO messaging_bindings(id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled,new_conversations) VALUES (?,?,?,?,?,?,?,1,?)';
  attachOperationalModule(prior, 'test').transaction((db) => {
    db.prepare(insert).run(
      'auto-app',
      'ada',
      'dsh-im/feishu',
      'feishu',
      'a1',
      'f1',
      '2026-10-01',
      'auto',
    );
    db.prepare(insert).run(
      'ask-app',
      'bea',
      'dsh-im/feishu',
      'feishu',
      'a2',
      'f2',
      '2026-10-01',
      'ask',
    );
  });
  prior.close();
  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  port.transaction((db) => {
    expect(messagingDefaults(db, 'feishu').newConversations).toBe('auto');
    expect(readMessagingIdentity(db, 'auto-app')).toMatchObject({
      newConversations: 'auto',
      newConversationsInheritance: 'inherit',
    });
    expect(readMessagingIdentity(db, 'ask-app')).toMatchObject({
      newConversations: 'ask',
      newConversationsInheritance: 'custom',
    });
    const before = messagingDefaults(db, 'feishu');
    commitMessagingDefaults(db, {
      platform: 'feishu',
      expectedRevision: before.revision,
      collection: before.collection,
      wake: before.wake,
      count: before.count,
      intervalSeconds: before.intervalSeconds,
      identityEnabled: before.identityEnabled,
      newConversations: 'ask',
    });
    expect(readMessagingIdentity(db, 'auto-app').newConversations).toBe('ask');
    const after = messagingDefaults(db, 'feishu');
    commitMessagingDefaults(db, {
      platform: 'feishu',
      expectedRevision: after.revision,
      collection: after.collection,
      wake: after.wake,
      count: after.count,
      intervalSeconds: after.intervalSeconds,
      identityEnabled: after.identityEnabled,
    });
    expect(messagingDefaults(db, 'feishu').newConversations).toBe('ask');
  });
  current.close();
});
