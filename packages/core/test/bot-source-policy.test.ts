import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { BOT_SOURCE_DEFAULTS, createBotSourcePolicyStore } from '../src/runtime/source-policy.js';
import { createTempRoot } from './helpers.js';

describe('per-PersonaBot source policy defaults', () => {
  it('upgrades a prior Host without changing historical Admission facts', () => {
    const home = createTempRoot('botharness-source-policy-upgrade-');
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(BOT_HARNESS_SCHEMA_PLAN.migrations.slice(0, -1)),
    });
    attachOperationalModule(prior, 'source-policy-prior').transaction((db) => {
      db.prepare(`
        INSERT INTO source_events
          (source_event_id, source_kind, bot_slug, body, created_at,
           handled_at, attempt_state, payload_json)
        VALUES ('historical-report', 'assignment-report', 'ada', 'Done',
                '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:01.000Z',
                'handled', '{"assignmentReport":{"state":"completed"}}')
      `).run();
      db.prepare(`
        INSERT INTO inbox_admissions (source_event_id, bot_slug, reason,
                                      attempt_state, handled_at)
        VALUES ('historical-report', 'ada', 'assignment-report',
                'handled', '2026-01-01T00:00:01.000Z')
      `).run();
    });
    prior.close();

    const upgraded = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      expect(upgraded.mode).toBe('ready');
      const module = attachOperationalModule(upgraded, 'source-policy-upgraded');
      expect(createBotSourcePolicyStore(module).list('ada')).toHaveLength(9);
      expect(
        module.read((db) =>
          db
            .prepare(`
            SELECT reason, attempt_state, handled_at, source_policy_revision,
                   source_policy_wake_mode
              FROM inbox_admissions WHERE source_event_id = 'historical-report'
          `)
            .get(),
        ),
      ).toEqual({
        reason: 'assignment-report',
        attempt_state: 'handled',
        handled_at: '2026-01-01T00:00:01.000Z',
        source_policy_revision: null,
        source_policy_wake_mode: null,
      });
    } finally {
      upgraded.close();
    }
  });

  it('seeds every built-in rule per Bot and keeps the Human DM Admission wake path', async () => {
    const home = createTempRoot('botharness-source-policy-');
    const turns: string[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        turns.push(run.bot.slug);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({ dshHome: home, agents });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const dm = core.channels.getOrCreateDm('ada', 'Ada');
      expect(dm).toBeDefined();
      if (dm === undefined) throw new Error('Human DM unavailable');
      const policy = core.sourcePolicy.list('ada');
      expect(policy).toHaveLength(Object.keys(BOT_SOURCE_DEFAULTS).length);
      for (const rule of policy) {
        expect(rule).toMatchObject({
          admission: 'admit',
          wake: BOT_SOURCE_DEFAULTS[rule.sourceClass].wake,
          revision: 1,
          lastActor: { kind: 'built-in' },
        });
      }
      expect(policy.find((rule) => rule.sourceClass === 'group-ordinary')).toMatchObject({
        digestCount: 5,
        digestIntervalSeconds: 30,
      });
      expect(core.sourcePolicy.list('bea')).toHaveLength(policy.length);
      expect(createBridgeMethods({ ...core }).botSourcePolicies({ slug: 'ada' })).toMatchObject({
        ok: true,
        value: { policies: policy },
      });
      await core.channels.appendMessage(dm.id, {
        id: 'source-policy-human-dm',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Hello Ada',
      });
      const admitted = core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'source-policy-human-dm',
        body: 'Hello Ada',
      });
      expect(admitted.admitted).toBe(true);
      await core.runtime.whenIdle();
      expect(turns).toEqual(['ada']);
      const database = attachOperationalModule(core.operationalDatabase, 'source-policy-test');
      expect(
        database.read((db) =>
          db
            .prepare(`
              SELECT a.reason, a.source_policy_revision, a.source_policy_wake_mode,
                     a.attempt_state
                FROM inbox_admissions a
                JOIN source_events e ON e.source_event_id = a.source_event_id
               WHERE e.message_id = 'source-policy-human-dm'
            `)
            .get(),
        ),
      ).toMatchObject({
        reason: 'human-dm',
        source_policy_revision: 1,
        source_policy_wake_mode: 'immediate',
        attempt_state: 'handled',
      });
      expect(
        database.read((db) =>
          db
            .prepare('SELECT COUNT(*) AS count FROM bot_source_policy_revisions WHERE bot_slug = ?')
            .get('ada'),
        ),
      ).toEqual({ count: policy.length });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restarted = createCore({ dshHome: home, agents });
    try {
      expect(restarted.sourcePolicy.list('ada')).toHaveLength(
        Object.keys(BOT_SOURCE_DEFAULTS).length,
      );
    } finally {
      await restarted.runtime.close();
      restarted.operationalDatabase.close();
    }
  });
});
