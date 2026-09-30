import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createChannelStore } from '../src/channels/store.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createRosterStore } from '../src/roster/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createUsageProjection, usageLocalDay } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';
import type { DshSessionEvent } from '../src/sessions/source.js';

function setup() {
  const root = createTempRoot('botharness-model-usage-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: root, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const ownership = createTestOwnership({
    'actual-session': { botSlug: 'ada', rootRole: 'orchestrator' },
  });
  const usage = createUsageProjection({ ownership, database: owner });
  const registry = createPersonaBotRegistry({ rootDir: join(root, 'bots') });
  registry.create({ slug: 'ada', displayName: 'Ada', model: 'configured-but-never-called' });
  const channels = createChannelStore({ rootDir: join(root, 'channels') });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const methods = createBridgeMethods({
    registry,
    channels,
    ownership,
    usage,
    states: createBotStateTracker(),
    roster: createRosterStore(),
  });
  const time = Date.now();
  const fold = (
    reported?: Record<string, number>,
    next?: Record<string, number>,
    nextModel = 'actual-model',
  ): void => {
    const events: DshSessionEvent[] = [
      { type: 'turn/start', time, data: { turn: 1 } },
      { type: 'step/start', time, data: { turn: 1, step: 1 } },
      {
        type: 'assistant/message',
        time,
        data: {
          turn: 1,
          step: 1,
          message: { source: { provider: 'actual-provider', model: 'actual-model' } },
          stream: [],
          ...(reported === undefined ? {} : { usage: reported }),
        },
      },
      { type: 'step/end', time, data: { turn: 1, step: 1 } },
      { type: 'turn/end', time, data: { turn: 1 } },
    ];
    if (next)
      events.splice(
        events.length - 1,
        0,
        { type: 'step/start', time, data: { turn: 1, step: 2 } },
        {
          type: 'assistant/message',
          time,
          data: {
            turn: 1,
            step: 2,
            message: { source: { provider: 'actual-provider', model: nextModel } },
            stream: [],
            usage: next,
          },
        },
        { type: 'step/end', time, data: { turn: 1, step: 2 } },
      );
    for (const event of events) usage.handleSessionEvent('actual-session', event);
  };
  return { methods, channels, dm, fold, time };
}

describe('observed model usage through the Profile query', () => {
  it('attributes four provider buckets and exact total independently of the configured model', () => {
    const { methods, dm, fold, time } = setup();
    fold({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      totalTokens: 155,
    });
    const result = methods.profileActivity({ channelId: dm.id });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageStatus).toBe('ready');
    expect(result.value.modelUsageRows).toEqual([
      {
        day: usageLocalDay(time),
        purpose: 'orchestrator',
        provider: 'actual-provider',
        model: 'actual-model',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
    ]);
  });

  it('keeps a reported exact total when a cache bucket is unknown', () => {
    const { methods, dm, fold } = setup();
    fold({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, totalTokens: 155 });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: null,
      totalTokens: 155,
    });
  });

  it('does not accept a total that contradicts the reported buckets', () => {
    const { methods, dm, fold } = setup();
    fold({ inputTokens: 100, outputTokens: 40, cacheReadTokens: 10, totalTokens: 10 });
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      cacheReadTokens: 10,
      cacheWriteTokens: null,
      totalTokens: null,
    });
  });

  it('preserves reported buckets across same-route settlements with incomplete usage', () => {
    const { methods, dm, fold } = setup();
    fold(
      {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
      { outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5, totalTokens: 155 },
    );
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'actual-provider',
      model: 'actual-model',
      inputTokens: null,
      outputTokens: 80,
      cacheReadTokens: 20,
      cacheWriteTokens: 10,
      totalTokens: 310,
    });
  });

  it('does not assign incomplete multi-route usage to one successful route', () => {
    const { methods, dm, fold } = setup();
    fold(
      {
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
        totalTokens: 155,
      },
      { outputTokens: 40, cacheReadTokens: 10, cacheWriteTokens: 5, totalTokens: 155 },
      'other-model',
    );
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'mixed',
      model: 'mixed',
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: null,
    });
  });

  it('shows an actual route with unknown usage instead of a fabricated zero', () => {
    const { methods, dm, fold } = setup();
    fold();
    const result = methods.profileActivity({ channelId: dm.id });
    if (!result.ok) throw new Error(result.error.message);
    expect(result.value.modelUsageRows[0]).toMatchObject({
      provider: 'actual-provider',
      model: 'actual-model',
      inputTokens: null,
      outputTokens: null,
      cacheReadTokens: null,
      cacheWriteTokens: null,
      totalTokens: null,
    });
  });

  it('rejects a non-DM channel rather than exposing other usage', () => {
    const { methods, channels } = setup();
    const group = channels.createGroup({ name: 'Group', members: [] });
    expect(methods.profileActivity({ channelId: group.id }).ok).toBe(false);
  });
});
