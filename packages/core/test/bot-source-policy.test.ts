import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('per-PersonaBot source policy first tracer', () => {
  it('seeds a durable built-in Human DM rule and keeps the real Admission wake path', async () => {
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
      expect(policy).toMatchObject([
        {
          sourceClass: 'human-dm',
          admission: 'admit',
          wake: 'immediate',
          revision: 1,
          lastActor: { kind: 'built-in' },
        },
      ]);
      expect(core.sourcePolicy.list('bea')).toMatchObject([{ revision: 1 }]);
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
      ).toEqual({ count: 1 });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restarted = createCore({ dshHome: home, agents });
    try {
      expect(restarted.sourcePolicy.list('ada')).toMatchObject([
        { sourceClass: 'human-dm', revision: 1, lastActor: { kind: 'built-in' } },
      ]);
    } finally {
      await restarted.runtime.close();
      restarted.operationalDatabase.close();
    }
  });
});
