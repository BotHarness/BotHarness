import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createCore } from '../src/plugin.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import {
  BOT_SCHEDULE_ENABLED_LIMIT,
  createBotScheduleStore,
  type BotScheduleStore,
} from '../src/schedules/bot-schedules.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function storeAt(
  start: string,
  options: { active?: (slug: string) => boolean } = {},
): {
  store: BotScheduleStore;
  owner: OperationalDatabaseOwner;
  clock: { now: Date };
  admitted: string[];
} {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('bh-schedules-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const clock = { now: new Date(start) };
  const admitted: string[] = [];
  let next = 0;
  const store = createBotScheduleStore({
    database: attachOperationalModule(owner, 'bot-schedules'),
    isBotActive: options.active ?? (() => true),
    onAdmitted: (_slug, sourceEventId) => admitted.push(sourceEventId),
    now: () => clock.now,
    createId: () => `id-${++next}`,
  });
  return { store, owner, clock, admitted };
}

function sourceEvents(owner: OperationalDatabaseOwner): Array<{ id: string; body: string }> {
  return attachOperationalModule(owner, 'schedule-test').read(
    (db) =>
      db
        .prepare(
          "SELECT source_event_id AS id, body FROM source_events WHERE source_kind = 'schedule' ORDER BY rowid",
        )
        .all() as unknown as Array<{ id: string; body: string }>,
  );
}

describe('Bot Schedule store', () => {
  it('validates input, creates every and daily schedules, and keeps targets in the future', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const hourly = store.create(
      'ada',
      { title: 'Check X', prompt: 'Look at X', trigger: { kind: 'every', everySeconds: 3600 } },
      'human',
    );
    expect(hourly).toMatchObject({
      title: 'Check X',
      enabled: true,
      creator: 'human',
      locked: false,
      trigger: { kind: 'every', everySeconds: 3600 },
      nextRunAt: '2026-10-06T01:00:00.000Z',
    });
    const daily = store.create(
      'ada',
      {
        title: 'Morning',
        prompt: 'Summarize',
        trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' },
      },
      'human',
    );
    expect(daily.trigger).toEqual({ kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' });
    expect(daily.nextRunAt).toBe('2026-10-06T01:00:00.000Z');
    expect(() =>
      store.create(
        'ada',
        { title: 'Fast', prompt: 'x', trigger: { kind: 'every', everySeconds: 30 } },
        'human',
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(() =>
      store.create(
        'ada',
        { title: ' ', prompt: 'x', trigger: { kind: 'every', everySeconds: 60 } },
        'human',
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(() =>
      store.create(
        'ada',
        {
          title: 'Bad zone',
          prompt: 'x',
          trigger: { kind: 'daily', time: '09:00', timeZone: 'Mars/Base' },
        },
        'human',
      ),
    ).toThrow(expect.objectContaining({ code: 'invalid-input' }));
    expect(store.list('ada').map((row) => row.title)).toEqual(['Check X', 'Morning']);
    expect(store.list('grace')).toEqual([]);
  });

  it('caps enabled schedules per PersonaBot and lets paused ones exceed it', () => {
    const { store } = storeAt('2026-10-06T00:00:00.000Z');
    const every = { kind: 'every', everySeconds: 60 } as const;
    for (let index = 0; index < BOT_SCHEDULE_ENABLED_LIMIT; index += 1)
      store.create('ada', { title: `T${index}`, prompt: 'p', trigger: every }, 'human');
    expect(() =>
      store.create('ada', { title: 'one more', prompt: 'p', trigger: every }, 'human'),
    ).toThrow(expect.objectContaining({ code: 'limit-reached' }));
    const paused = store.create(
      'ada',
      { title: 'paused', prompt: 'p', trigger: every, enabled: false },
      'human',
    );
    expect(paused.enabled).toBe(false);
    expect(paused.nextRunAt).toBeUndefined();
    expect(() => store.update('ada', paused.id, { enabled: true }, 'human')).toThrow(
      expect.objectContaining({ code: 'limit-reached' }),
    );
    store.create('grace', { title: 'other bot', prompt: 'p', trigger: every }, 'human');
  });

  it('fires due schedules into the Bot Inbox and coalesces an unobserved earlier firing', () => {
    const { store, owner, clock, admitted } = storeAt('2026-10-06T00:00:00.000Z');
    const schedule = store.create(
      'ada',
      { title: 'Ping', prompt: 'Say hi', trigger: { kind: 'every', everySeconds: 60 } },
      'human',
    );
    clock.now = new Date('2026-10-06T00:01:05.000Z');
    store.tick();
    expect(admitted).toHaveLength(1);
    expect(sourceEvents(owner)).toEqual([{ id: admitted[0], body: 'Ping' }]);
    expect(store.list('ada')[0]?.nextRunAt).toBe('2026-10-06T00:02:00.000Z');

    clock.now = new Date('2026-10-06T00:02:01.000Z');
    store.tick();
    expect(admitted).toHaveLength(1);
    expect(sourceEvents(owner)).toHaveLength(1);
    const history = store.history('ada', schedule.id);
    expect(history.map((row) => [row.occurrenceAt, row.state])).toEqual([
      ['2026-10-06T00:02:00.000Z', 'coalesced'],
      ['2026-10-06T00:01:00.000Z', 'pending'],
    ]);
    const payload = attachOperationalModule(owner, 'schedule-test').read(
      (db) =>
        (
          db
            .prepare('SELECT payload_json FROM source_events WHERE source_event_id = ?')
            .get(admitted[0]!) as { payload_json: string }
        ).payload_json,
    );
    expect(JSON.parse(payload)).toMatchObject({
      schedule: { id: schedule.id, prompt: 'Say hi', occurrenceAt: '2026-10-06T00:02:00.000Z' },
    });
  });

  it('fires only the latest missed occurrence after downtime', () => {
    const { store, clock, admitted } = storeAt('2026-10-06T00:00:00.000Z');
    const schedule = store.create(
      'ada',
      { title: 'Ping', prompt: 'p', trigger: { kind: 'every', everySeconds: 60 } },
      'human',
    );
    clock.now = new Date('2026-10-06T00:10:30.000Z');
    store.start();
    store.close();
    expect(admitted).toHaveLength(1);
    expect(store.history('ada', schedule.id).map((row) => row.occurrenceAt)).toEqual([
      '2026-10-06T00:10:00.000Z',
    ]);
    expect(store.list('ada')[0]?.nextRunAt).toBe('2026-10-06T00:11:00.000Z');
  });

  it('skips firings of an inactive PersonaBot without backfilling later', () => {
    let active = false;
    const { store, owner, clock, admitted } = storeAt('2026-10-06T00:00:00.000Z', {
      active: () => active,
    });
    const schedule = store.create(
      'ada',
      { title: 'Ping', prompt: 'p', trigger: { kind: 'every', everySeconds: 60 } },
      'human',
    );
    clock.now = new Date('2026-10-06T00:01:00.000Z');
    store.tick();
    expect(admitted).toEqual([]);
    expect(sourceEvents(owner)).toEqual([]);
    expect(store.history('ada', schedule.id)[0]?.state).toBe('skipped');
    active = true;
    clock.now = new Date('2026-10-06T00:01:30.000Z');
    store.tick();
    expect(admitted).toEqual([]);
    clock.now = new Date('2026-10-06T00:02:00.000Z');
    store.tick();
    expect(admitted).toHaveLength(1);
  });

  it('restarts the cadence on re-enable and edit, and refuses PersonaBot edits to locked schedules', () => {
    const { store, owner, clock } = storeAt('2026-10-06T00:00:00.000Z');
    const schedule = store.create(
      'ada',
      { title: 'Ping', prompt: 'p', trigger: { kind: 'every', everySeconds: 60 } },
      'personabot',
    );
    expect(schedule.creator).toBe('personabot');
    store.update('ada', schedule.id, { enabled: false }, 'human');
    clock.now = new Date('2026-10-06T01:00:30.000Z');
    store.tick();
    expect(store.history('ada', schedule.id)).toEqual([]);
    const resumed = store.update('ada', schedule.id, { enabled: true }, 'human');
    expect(resumed.nextRunAt).toBe('2026-10-06T01:01:30.000Z');
    const retitled = store.update('ada', schedule.id, { title: 'Pong' }, 'personabot');
    expect(retitled).toMatchObject({ title: 'Pong', nextRunAt: '2026-10-06T01:01:30.000Z' });
    const hourly = store.update(
      'ada',
      schedule.id,
      { trigger: { kind: 'every', everySeconds: 3600 } },
      'human',
    );
    expect(hourly.nextRunAt).toBe('2026-10-06T02:00:30.000Z');

    expect(() => store.update('ada', schedule.id, { locked: true }, 'personabot')).toThrow(
      expect.objectContaining({ code: 'locked' }),
    );
    expect(store.update('ada', schedule.id, { locked: true }, 'human').locked).toBe(true);
    expect(() => store.update('ada', schedule.id, { title: 'x' }, 'personabot')).toThrow(
      expect.objectContaining({ code: 'locked' }),
    );
    expect(() => store.remove('ada', schedule.id, 'personabot')).toThrow(
      expect.objectContaining({ code: 'locked' }),
    );
    expect(store.update('ada', schedule.id, { title: 'Human edit' }, 'human').title).toBe(
      'Human edit',
    );
    expect(store.update('ada', schedule.id, { locked: false }, 'human').locked).toBe(false);
    expect(store.update('ada', schedule.id, { title: 'Bot edit' }, 'personabot').title).toBe(
      'Bot edit',
    );
    expect(store.remove('ada', schedule.id, 'human')).toBe(true);
    expect(store.remove('ada', schedule.id, 'human')).toBe(false);
    expect(
      store.create(
        'ada',
        { title: 'Kept', prompt: 'p', trigger: { kind: 'every', everySeconds: 60 }, locked: true },
        'human',
      ).locked,
    ).toBe(true);
    expect(() =>
      store.create(
        'ada',
        {
          title: 'Sneaky',
          prompt: 'p',
          trigger: { kind: 'every', everySeconds: 60 },
          locked: true,
        },
        'personabot',
      ),
    ).toThrow(expect.objectContaining({ code: 'locked' }));
    expect(() => store.history('ada', schedule.id)).toThrow(
      expect.objectContaining({ code: 'not-found' }),
    );
  });
});

describe('Bot Schedule firing', () => {
  it('wakes the Orchestrator through the Bot Inbox and records the handling Session', async () => {
    const runs: OrchestratorAgentRun[] = [];
    const core = createCore({
      dshHome: createTempRoot('bh-schedule-wake-'),
      agents: {
        async runOrchestrator(run) {
          runs.push(run);
        },
        async runAssignment() {},
        requestAssignment() {
          throw new Error('No Assignment expected');
        },
        async close() {},
      },
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.channels.getOrCreateDm('ada', 'Ada');
      const schedule = core.schedules.create(
        'ada',
        {
          title: 'Hourly check',
          prompt: 'Check the build status',
          trigger: { kind: 'every', everySeconds: 3600 },
        },
        'human',
      );
      attachOperationalModule(core.operationalDatabase, 'schedule-test').transaction((db) =>
        db
          .prepare(
            "UPDATE bot_schedules SET record_json = json_set(record_json, '$.scheduledAt', ?) WHERE schedule_id = ?",
          )
          .run(new Date(Date.now() - 1000).toISOString(), schedule.id),
      );
      core.schedules.tick();
      await core.runtime.whenIdle();

      expect(runs).toHaveLength(1);
      const botCreated = runs[0]?.schedules?.create({
        title: 'Check X',
        prompt: 'Check X',
        trigger: { kind: 'every', everySeconds: 3600 },
      });
      expect(botCreated).toMatchObject({ botSlug: 'ada', creator: 'personabot' });
      expect(runs[0]?.schedules?.list().map((row) => row.title)).toEqual([
        'Hourly check',
        'Check X',
      ]);
      const methods = createBridgeMethods({ ...core });
      expect(
        await methods.scheduleUpdate({ slug: 'ada', id: schedule.id, locked: 'yes' }),
      ).toMatchObject({ ok: false });
      expect(
        await methods.scheduleUpdate({ slug: 'ada', id: schedule.id, locked: true }),
      ).toMatchObject({ ok: true, value: { schedule: { locked: true } } });
      expect(() => runs[0]?.schedules?.remove(schedule.id)).toThrow(
        expect.objectContaining({ code: 'locked' }),
      );
      core.schedules.update('ada', schedule.id, { locked: false }, 'human');
      expect(runs[0]?.schedules?.remove(botCreated!.id)).toBe(true);
      expect(runs[0]?.inbox).toContain('Bot Schedule "Hourly check"');
      expect(runs[0]?.inbox).toContain('"Check the build status"');
      const [firing] = core.schedules.history('ada', schedule.id);
      expect(firing).toMatchObject({ state: 'handled', sessionId: runs[0]?.sessionId });
      expect(core.schedules.list('ada')[0]?.lastFiring?.state).toBe('handled');
      expect(
        core.attention.list({ botSlug: 'ada' }).items.find((item) => item.reason === 'schedule'),
      ).toMatchObject({
        sourceKind: 'schedule',
        state: 'handled',
        summary: 'Hourly check',
        scheduleId: schedule.id,
        sourceAvailable: true,
      });
      core.schedules.remove('ada', schedule.id, 'human');
      expect(
        core.attention.list({ botSlug: 'ada' }).items.find((item) => item.reason === 'schedule'),
      ).toMatchObject({ scheduleId: schedule.id, sourceAvailable: false });
    } finally {
      core.schedules.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});

it('upgrades existing Source Events and admissions to accept schedule firings', () => {
  const home = createTempRoot('bh-schedule-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 57),
    ),
  });
  attachOperationalModule(prior, 'bot-inbox').transaction((db) => {
    db.prepare(
      "INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at) VALUES ('m1', 'memory-change', 'ada', 'changed', '2026-10-06T00:00:00Z')",
    ).run();
    db.prepare(
      "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, external_default_revision) VALUES ('m1', 'ada', 'memory-change', 3)",
    ).run();
  });
  prior.close();
  const next = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  expect(next.mode).toBe('ready');
  const port = attachOperationalModule(next, 'bot-inbox');
  port.transaction((db) => {
    db.prepare(
      "INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at) VALUES ('s1', 'schedule', 'ada', 'tick', '2026-10-06T00:01:00Z')",
    ).run();
    db.prepare(
      "INSERT INTO inbox_admissions (source_event_id, bot_slug, reason) VALUES ('s1', 'ada', 'schedule')",
    ).run();
  });
  expect(
    port.read((db) =>
      db
        .prepare(
          'SELECT source_event_id, reason, external_default_revision FROM inbox_admissions ORDER BY rowid',
        )
        .all(),
    ),
  ).toEqual([
    { source_event_id: 'm1', reason: 'memory-change', external_default_revision: 3 },
    { source_event_id: 's1', reason: 'schedule', external_default_revision: null },
  ]);
  const indexes = port.read(
    (db) =>
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ('source_events', 'inbox_admissions') AND sql IS NOT NULL ORDER BY name",
        )
        .all() as unknown as Array<{ name: string }>,
  );
  expect(indexes.map((row) => row.name)).toContain('inbox_admissions_bot_pending');
  expect(indexes.map((row) => row.name)).toContain('source_events_bot_created');
});
