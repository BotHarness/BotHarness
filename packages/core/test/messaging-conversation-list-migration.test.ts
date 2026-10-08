import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

it('turns revoked explicit conversations without a live replacement into blocks at generation 62', () => {
  const home = createTempRoot('bh1109-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation < 62),
    ),
  });
  const grant = (id: string, conversation: string, origin: string, revokedAt?: string) => ({
    id,
    bindingId: 'binding',
    botSlug: 'ada',
    fingerprint: 'fp',
    targetName: `Name ${conversation}`,
    revision: 2,
    origin,
    receiveScope: { kind: 'group', conversationId: conversation },
    ...(revokedAt ? { revokedAt } : {}),
  });
  attachOperationalModule(prior, 'test').transaction((db) => {
    db.prepare(
      "INSERT INTO messaging_bindings(id,bot_slug,provider_id,platform,account_ref,fingerprint,created_at,enabled) VALUES ('binding','ada','dsh-im/feishu','feishu','lark-app','fp','2026-10-01',1)",
    ).run();
    for (const [id, conversation, origin, revokedAt] of [
      ['revoked', 'oc_gone', 'explicit', '2026-10-05'],
      ['replaced-old', 'oc_back', 'explicit', '2026-10-04'],
      ['replaced-new', 'oc_back', 'explicit', undefined],
      ['implicit-gone', 'oc_unbound', 'implicit', '2026-10-06'],
    ] as const)
      db.prepare(
        'INSERT INTO messaging_grants(id,binding_id,bot_slug,revision,created_at,revoked_at,body) VALUES (?,?,?,?,?,?,?)',
      ).run(
        id,
        'binding',
        'ada',
        2,
        '2026-10-02',
        revokedAt ?? null,
        JSON.stringify(grant(id, conversation, origin, revokedAt)),
      );
  });
  prior.close();
  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  const blocks = port.read((db) =>
    db.prepare('SELECT conversation_id, revision, body FROM messaging_conversation_blocks').all(),
  ) as { conversation_id: string; revision: number; body: string }[];
  expect(blocks.map((row) => [row.conversation_id, row.revision])).toEqual([['oc_gone', 1]]);
  expect(JSON.parse(blocks[0]!.body)).toEqual({
    botSlug: 'ada',
    fingerprint: 'fp',
    conversation: { kind: 'group', id: 'oc_gone' },
    name: 'Name oc_gone',
    blockedAt: '2026-10-05',
    revision: 1,
  });
  expect(
    port.read((db) => db.prepare('SELECT count(*) AS n FROM messaging_held_conversations').get()),
  ).toEqual({ n: 0 });
  current.close();
});
