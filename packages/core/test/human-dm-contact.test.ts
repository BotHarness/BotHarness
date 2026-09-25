import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createCore } from '../src/plugin.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

describe('Human DM selected contact context', () => {
  it('gives the owner current bounded Bot identities without waking the selected contacts', async () => {
    const runs: OrchestratorAgentRun[] = [];
    const agents: BotAgentAdapter = {
      async runOrchestrator(run) {
        runs.push(run);
      },
      async runAssignment() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
      async close() {},
    };
    const core = createCore({
      dshHome: createTempRoot('botharness-human-contact-'),
      agents,
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({
        slug: 'bea',
        displayName: 'Alex',
        description: 'Coordinates release work',
      });
      core.registry.create({
        slug: 'cee',
        displayName: 'Alex',
        description: 'Reviews documentation',
      });
      const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
      const methods = createBridgeMethods({
        registry: core.registry,
        states: core.states,
        channels: core.channels,
        sessions: { list: () => [] },
        ownership: core.ownership,
        roster: core.roster,
        runtime: core.runtime,
      });
      const body = '  @Alex @Alex please coordinate';
      const mentions = [
        { botSlug: 'bea', label: 'Alex', start: 2, end: 7 },
        { botSlug: 'cee', label: 'Alex', start: 8, end: 13 },
      ];
      expect(await methods.channelSend({ channelId: dm.id, body, mentions })).toMatchObject({
        ok: true,
        value: { message: { mentions } },
      });
      await core.runtime.whenIdle();
      expect(runs).toHaveLength(1);
      expect(runs[0]!.bot.slug).toBe('ada');
      expect(runs[0]!.message).toContain('  \u2060@Alex \u2060@Alex');
      expect(runs[0]!.message).toContain('"id":"bea","name":"Alex"');
      expect(runs[0]!.message).toContain('"id":"cee","name":"Alex"');
      expect(runs[0]!.message).toContain('Coordinates release work');
      expect(runs[0]!.message).toContain('Reviews documentation');
      expect(core.channels.list().filter((channel) => channel.type === 'dm')).toHaveLength(1);

      core.registry.update('bea', { displayName: 'Bea New', description: 'Updated role' });
      const renamed = await methods.channelSend({
        channelId: dm.id,
        body: '@Alex ask again',
        mentions: [{ botSlug: 'bea', label: 'Alex', start: 0, end: 5 }],
      });
      expect(renamed.ok).toBe(true);
      await core.runtime.whenIdle();
      expect(runs[1]!.message).toContain('"id":"bea","name":"Bea New"');
      expect(runs[1]!.message).toContain('Updated role');

      expect(
        await methods.channelSend({ channelId: dm.id, body: '@Alex plain text' }),
      ).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(runs[2]!.message).toContain('@Alex plain text');
      expect(runs[2]!.message).not.toContain('Selected PersonaBot contacts');

      core.registry.setPaused('cee', true);
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Alex archived',
          mentions: [{ botSlug: 'cee', label: 'Alex', start: 0, end: 5 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Ghost stale',
          mentions: [{ botSlug: 'ghost', label: 'Ghost', start: 0, end: 6 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        await methods.channelSend({
          channelId: dm.id,
          body: '@Ada self',
          mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
        }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(runs).toHaveLength(3);
      const admissions = attachOperationalModule(
        core.operationalDatabase,
        'human-contact-test',
      ).read(
        (db) =>
          db.prepare('SELECT bot_slug FROM inbox_admissions ORDER BY bot_slug').all() as Array<{
            bot_slug: string;
          }>,
      );
      expect(admissions).toEqual([{ bot_slug: 'ada' }, { bot_slug: 'ada' }, { bot_slug: 'ada' }]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
