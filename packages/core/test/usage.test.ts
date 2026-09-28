import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-token-meter/client', () => ({
  deriveTurnTokenUsage: (events: readonly { type: string }[]) => {
    if (events[0]?.type !== 'turn/start' || events.at(-1)?.type !== 'turn/end') return undefined;
    if (!events.some((event) => event.type === 'assistant/message')) return undefined;
    return {
      uncachedInputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      cacheReadTokens: 10,
      cacheWriteTokens: 5,
      routes: [{ provider: 'deepseek', model: 'deepseek-chat' }],
    };
  },
}));

import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createUsageProjection, usageLocalDay } from '../src/usage/usage.js';
import { createTempRoot, createTestOwnership, trackTestOwner } from './helpers.js';

const SINCE = '2000-01-01T00:00:00.000Z';
const TURN_END = Date.parse('2026-09-29T03:00:00.000Z');

function event(type: string, time: number): { type: string; time: number; data: unknown } {
  return { type, time, data: {} };
}

function usageProjection(seeded: Parameters<typeof createTestOwnership>[0]) {
  const owner = trackTestOwner(
    mountOperationalDatabase({
      dshHome: createTempRoot('botharness-usage-'),
      schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
    }),
  );
  const ownership = createTestOwnership(seeded);
  return { usage: createUsageProjection({ ownership, database: owner }), ownership };
}

function expectedDay(time: number): string {
  const date = new Date(time);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

describe('Usage projection', () => {
  it('folds a completed turn into one Host-local daily bucket exactly once', () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    usage.handleSessionEvent('session-1', event('turn/start', TURN_END - 1000));
    usage.handleSessionEvent('session-1', event('assistant/message', TURN_END - 500));
    usage.handleSessionEvent('session-1', event('turn/end', TURN_END));

    expect(usage.activity('ada', SINCE)).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'orchestrator',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
    ]);
    expect(usageLocalDay(TURN_END)).toBe(expectedDay(TURN_END));
    expect(usage.activity('bea', SINCE)).toEqual([]);

    // A second fold of the same turn is impossible: the buffer is consumed.
    usage.handleSessionEvent('session-1', event('assistant/message', TURN_END + 1000));
    usage.handleSessionEvent('session-1', event('turn/end', TURN_END + 1000));
    expect(usage.activity('ada', SINCE)).toHaveLength(1);
  });

  it('keeps fork and subagent provenance as the bucket purpose', () => {
    const { usage, ownership } = usageProjection({
      'session-root': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-fork',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'session-root',
      at: '2026-09-29T00:00:00.000Z',
    });
    usage.handleSessionEvent('session-fork', event('turn/start', TURN_END - 1000));
    usage.handleSessionEvent('session-fork', event('assistant/message', TURN_END - 500));
    usage.handleSessionEvent('session-fork', event('turn/end', TURN_END));

    expect(usage.activity('ada', SINCE)).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'fork',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
    ]);
  });

  it('rebuilds from durable logs, skipping fork-inherited prefixes, and replaces the table', async () => {
    const { usage, ownership } = usageProjection({
      'session-root': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    ownership.claim({
      sessionId: 'session-fork',
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'session-root',
      at: '2026-09-29T00:00:00.000Z',
    });
    const inheritedTurn = [
      event('turn/start', TURN_END - 4000),
      event('assistant/message', TURN_END - 3000),
      event('turn/end', TURN_END - 2000),
    ];
    const ownTurn = [
      event('turn/start', TURN_END - 1000),
      event('assistant/message', TURN_END - 500),
      event('turn/end', TURN_END),
    ];
    const logs = new Map([
      ['session-root', { events: ownTurn, inheritedEventCount: 0 }],
      [
        'session-fork',
        { events: [...inheritedTurn, ...ownTurn], inheritedEventCount: inheritedTurn.length },
      ],
      ['session-unowned', { events: ownTurn, inheritedEventCount: 0 }],
    ]);
    const readLog = async (sessionId: string) => logs.get(sessionId);
    const ids = ['session-root', 'session-fork', 'session-unowned'];

    expect(await usage.rebuild(ids, readLog)).toEqual({ folded: 2, failed: 0 });
    const ordered = [...usage.activity('ada', SINCE)].sort((left, right) =>
      left.purpose.localeCompare(right.purpose),
    );
    expect(ordered).toEqual([
      {
        day: expectedDay(TURN_END),
        purpose: 'fork',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
      {
        day: expectedDay(TURN_END),
        purpose: 'orchestrator',
        provider: 'deepseek',
        model: 'deepseek-chat',
        inputTokens: 100,
        outputTokens: 40,
        cacheReadTokens: 10,
        cacheWriteTokens: 5,
      },
    ]);

    // Rebuild replaces the derived projection instead of doubling it.
    expect(await usage.rebuild(ids, readLog)).toEqual({ folded: 2, failed: 0 });
    const rebuilt = usage.activity('ada', SINCE);
    expect(rebuilt).toHaveLength(2);
    for (const bucket of rebuilt) {
      expect(bucket).toMatchObject({ inputTokens: 100, outputTokens: 40 });
    }
  });
});
