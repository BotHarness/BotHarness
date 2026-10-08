import { describe, expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';
import { DEEPSEEKBOT_RECIPE } from '../src/onboarding/service.js';

function adapter(
  run: (input: OrchestratorAgentRun) => Promise<void> = async () => {},
): BotAgentAdapter {
  return {
    runOrchestrator: run,
    async runAssignment() {},
    requestAssignment() {
      throw new Error('Unexpected Assignment');
    },
    async close() {},
  };
}
async function withCore(
  test: (core: ReturnType<typeof createCore>) => Promise<void>,
  agents = adapter(),
): Promise<void> {
  const core = createCore({ dshHome: createTempRoot('bh-onboarding-'), agents });
  try {
    await test(core);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}
describe('Bot onboarding through the public Host bridge', () => {
  it('starts only on deliberate entry and prepares one durable Bot, Appearance, Memory and welcome across concurrent calls', async () => {
    await withCore(async (core) => {
      expect(core.registry.list()).toHaveLength(0);
      const bridge = createBridgeMethods({ ...core });
      const calls = await Promise.all(Array.from({ length: 5 }, () => bridge.onboarding({})));
      expect(calls.every((result) => result.ok)).toBe(true);
      const first = calls[0]!;
      if (!first.ok) throw new Error(first.error.message);
      const bot = core.registry.list()[0]!;
      expect(core.registry.list()).toHaveLength(1);
      expect(bot.displayName).toBe('DeepSeek Bot');
      expect(bot.appearance?.recipe).toEqual(DEEPSEEKBOT_RECIPE);
      expect(core.registry.memoryDirFor(bot.slug)).toBeTruthy();
      expect(core.channels.readMessages(first.value.channelId!)).toMatchObject([
        { author: { kind: 'system' }, onboardingWelcome: { version: 1 } },
      ]);
      expect(first.value.completed).toBe(false);
      core.registry.update(bot.slug, { displayName: 'Renamed' });
      await bridge.onboarding({ action: 'restart' });
      expect(core.registry.get(bot.slug)?.appearance?.recipe).toEqual(DEEPSEEKBOT_RECIPE);
      expect(core.channels.readMessages(first.value.channelId!)).toHaveLength(1);
    });
  });
  it('reuses existing Bots, lets the Human select among several, and never resurrects the default Bot', async () => {
    await withCore(async (core) => {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      const bridge = createBridgeMethods({ ...core });
      const initial = await bridge.onboarding({});
      expect(initial).toMatchObject({ ok: true, value: { completed: false } });
      if (!initial.ok) throw new Error(initial.error.message);
      expect(initial.value.channelId).toBeUndefined();
      expect(core.registry.list()).toHaveLength(2);
      expect(await bridge.onboarding({ slug: 'bea' })).toMatchObject({
        ok: true,
        value: { channelId: 'dm-bea' },
      });
      core.registry.setPaused('bea', true);
      expect(await bridge.onboarding({ slug: 'bea' })).toMatchObject({ ok: false });
    });
    await withCore(async (core) => {
      const first = await core.onboarding.enter();
      const preview = core.deletions.preview(first.defaultBotSlug!);
      await core.deletions.confirm(first.defaultBotSlug!, preview.token, false);
      await core.onboarding.enter();
      expect(core.registry.list()).toHaveLength(0);
    });
  });
  it('keeps skip/pause independent from real-reply completion and recovers completion after a Host restart', async () => {
    const home = createTempRoot('bh-onboarding-restart-');
    const core = createCore({
      dshHome: home,
      agents: adapter(async (run) => {
        await run.channels.send({ body: 'I can help.' });
      }),
    });
    let channelId: string;
    let profileId: string;
    try {
      const bridge = createBridgeMethods({ ...core });
      const first = await core.onboarding.enter(undefined, 'skip');
      channelId = first.channelId!;
      profileId = first.profileId;
      await core.channels.appendMessage(channelId, {
        id: 'untrusted-notice',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: first.defaultBotSlug! },
        body: 'System notice without model provenance',
      });
      expect((await core.onboarding.enter()).completed).toBe(false);
      const result = await bridge.channelSend({
        channelId,
        messageId: 'human-00000000-0000-4000-8000-000000000001',
        body: 'What can you do?',
      });
      expect(result, JSON.stringify(result)).toMatchObject({ ok: true });
      await core.runtime.whenIdle();
      expect(await core.onboarding.enter()).toMatchObject({ completed: true, tutorial: 'skipped' });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
    const restored = createCore({ dshHome: home, agents: adapter() });
    try {
      expect(await restored.onboarding.enter(undefined, 'restart')).toMatchObject({
        profileId: profileId!,
        completed: true,
        tutorial: 'active',
        channelId: channelId!,
      });
      expect(restored.registry.list()).toHaveLength(1);
      expect(
        restored.channels.readMessages(channelId!).filter((message) => message.onboardingWelcome),
      ).toHaveLength(1);
    } finally {
      await restored.runtime.close();
      restored.operationalDatabase.close();
    }
  });
  it('keeps one Human message when a pre-side-effect model failure is repaired and manually retried', async () => {
    let repaired = false;
    await withCore(
      async (core) => {
        const bridge = createBridgeMethods({ ...core });
        const first = await core.onboarding.enter();
        const channelId = first.channelId!;
        const sent = await bridge.channelSend({
          channelId,
          messageId: 'human-00000000-0000-4000-8000-000000000002',
          body: 'Hello',
        });
        expect(sent, JSON.stringify(sent)).toMatchObject({ ok: true });
        await core.runtime.whenIdle();
        expect((await core.onboarding.enter()).completed).toBe(false);
        const failure = core.channels
          .readMessages(channelId)
          .find((message) => message.sessionFailure);
        expect(failure?.sessionFailure?.requestMessageId).toBe(
          'human-00000000-0000-4000-8000-000000000002',
        );
        repaired = true;
        expect(
          await bridge.channelRetry({
            channelId,
            messageId: 'human-00000000-0000-4000-8000-000000000002',
          }),
        ).toMatchObject({ ok: true });
        await core.runtime.whenIdle();
        expect(
          core.channels
            .readMessages(channelId)
            .filter((message) => message.author.kind === 'human'),
        ).toHaveLength(1);
        expect((await core.onboarding.enter()).completed).toBe(true);
        expect(
          await bridge.channelRetry({
            channelId,
            messageId: 'human-00000000-0000-4000-8000-000000000002',
          }),
        ).toMatchObject({ ok: false });
      },
      adapter(async (run) => {
        if (!repaired) throw new Error('Credential unavailable');
        await run.channels.send({ body: 'Hello back.' });
      }),
    );
  });
  it('refuses manual replay after a side effect', async () => {
    await withCore(
      async (core) => {
        const first = await core.onboarding.enter();
        const bridge = createBridgeMethods({ ...core });
        expect(
          await bridge.channelSend({
            channelId: first.channelId!,
            messageId: 'human-00000000-0000-4000-8000-000000000002',
            body: 'Hello',
          }),
        ).toMatchObject({ ok: true });
        await core.runtime.whenIdle();
        expect(
          await bridge.channelRetry({
            channelId: first.channelId!,
            messageId: 'human-00000000-0000-4000-8000-000000000002',
          }),
        ).toMatchObject({ ok: false });
      },
      adapter(async (run) => {
        await run.channels.send({ body: 'Already sent.' });
        throw new Error('Later failure');
      }),
    );
  });
  it('saves native Profile defaults with readback, keeps fixed Bots fixed, and checks revisions when returning to inheritance', async () => {
    await withCore(async (core) => {
      const first = await core.onboarding.enter();
      const slug = first.defaultBotSlug!;
      let current = { provider: 'deepseek', model: 'old' };
      const bridge = createBridgeMethods({
        ...core,
        modelCatalog: {
          async list() {
            return [];
          },
          async validate() {},
        },
        defaultModel: {
          currentSelection: () => current,
          async saveSelection(route) {
            current = { ...route };
          },
        },
      });
      const route = { provider: 'deepseek', model: 'new' };
      expect(
        await bridge.onboardingModel({ slug, expectedRevision: 0, route, globalDefault: false }),
      ).toMatchObject({ ok: true });
      expect(current.model).toBe('old');
      expect(core.registry.get(slug)?.modelPlan?.orchestrator).toEqual(route);
      expect(
        await bridge.onboardingModel({ slug, expectedRevision: 1, route, globalDefault: true }),
      ).toMatchObject({ ok: true });
      expect(current.model).toBe('new');
      expect(core.registry.get(slug)?.modelPlan).toBeUndefined();
      expect(core.registry.get(slug)?.modelPlanRevision).toBe(2);
      expect(
        await bridge.onboardingModel({ slug, expectedRevision: 0, route, globalDefault: false }),
      ).toMatchObject({ ok: false });
      const noWriter = createBridgeMethods({
        ...core,
        modelCatalog: {
          async list() {
            return [];
          },
          async validate() {},
        },
        defaultModel: { currentSelection: () => current, async saveSelection() {} },
      });
      expect(
        await noWriter.onboardingModel({
          slug,
          expectedRevision: 2,
          route: { provider: 'other', model: 'unsaved' },
          globalDefault: true,
        }),
      ).toMatchObject({ ok: false });
    });
  });
});

it('upgrades main generation 70 without changing qualified defaults or purge fences', () => {
  const dshHome = createTempRoot('bh-onboarding-main-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((m) => m.generation <= 70),
    ),
  });
  try {
    expect(prior.generation).toBe(70);
    attachOperationalModule(prior, 'messaging').transaction((db) => {
      db.prepare(
        'INSERT INTO messaging_default_revisions (platform, revision, body) VALUES (?, ?, ?)',
      ).run('weixin', 1, '{"identityEnabled":false,"typingEnabled":false}');
    });
  } finally {
    prior.close();
  }
  const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    expect(upgraded.mode).toBe('ready');
    expect(upgraded.generation).toBe(71);
    const port = attachOperationalModule(upgraded, 'onboarding-upgrade-check');
    expect(
      port.read((db) =>
        db.prepare('SELECT platform, revision, body FROM messaging_default_revisions').all(),
      ),
    ).toEqual([
      { platform: 'weixin', revision: 1, body: '{"identityEnabled":false,"typingEnabled":false}' },
    ]);
    expect(
      port.read((db) => db.prepare('SELECT COUNT(*) AS count FROM bot_onboarding').get()),
    ).toEqual({ count: 0 });
    expect(
      port.read((db) => db.prepare('SELECT COUNT(*) AS count FROM channel_output_origins').get()),
    ).toEqual({ count: 0 });
    expect(
      port.read((db) =>
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = 'messaging_purge_file_binding_insert'",
          )
          .get(),
      ),
    ).toEqual({ name: 'messaging_purge_file_binding_insert' });
  } finally {
    upgraded.close();
  }
});
