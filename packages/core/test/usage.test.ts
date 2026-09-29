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

    expect(await usage.rebuild(ids, readLog)).toEqual({ folded: 2, failed: 0 });
    const rebuilt = usage.activity('ada', SINCE);
    expect(rebuilt).toHaveLength(2);
    for (const bucket of rebuilt) {
      expect(bucket).toMatchObject({ inputTokens: 100, outputTokens: 40 });
    }
  });
});

describe('Usage rebuild races', () => {
  function feedTurn(
    usage: ReturnType<typeof createUsageProjection>,
    sessionId: string,
    base: number,
  ): void {
    usage.handleSessionEvent(sessionId, event('turn/start', base));
    usage.handleSessionEvent(sessionId, event('assistant/message', base + 1));
    usage.handleSessionEvent(sessionId, event('turn/end', base + 2));
  }

  it('keeps live turns that complete or stay buffered while a rebuild reads logs', async () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const snapshotTurn = [
      event('turn/start', TURN_END - 3000),
      event('assistant/message', TURN_END - 2000),
      event('turn/end', TURN_END - 1000),
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readLog = async () => {
      await gate;
      return { events: snapshotTurn, inheritedEventCount: 0 };
    };

    usage.handleSessionEvent('session-2', event('turn/start', TURN_END + 1000));
    const rebuilding = usage.rebuild(['session-1'], readLog);
    await Promise.resolve();

    feedTurn(usage, 'session-1', TURN_END + 2000);
    release();
    expect(await rebuilding).toEqual({ folded: 2, failed: 0 });

    usage.handleSessionEvent('session-2', event('assistant/message', TURN_END + 3000));
    usage.handleSessionEvent('session-2', event('turn/end', TURN_END + 3001));

    const buckets = usage.activity('ada', SINCE);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]).toMatchObject({ inputTokens: 300, outputTokens: 120 });
  });

  it('does not double count a queued turn already present in the snapshot', async () => {
    const { usage } = usageProjection({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const liveTurn = [
      event('turn/start', TURN_END - 1000),
      event('assistant/message', TURN_END - 500),
      event('turn/end', TURN_END),
    ];
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const readLog = async () => {
      await gate;
      return { events: liveTurn, inheritedEventCount: 0 };
    };

    const rebuilding = usage.rebuild(['session-1'], readLog);
    await Promise.resolve();
    for (const queued of liveTurn) usage.handleSessionEvent('session-1', queued);
    release();
    expect(await rebuilding).toEqual({ folded: 1, failed: 0 });
    expect(usage.activity('ada', SINCE)).toHaveLength(1);
    expect(usage.activity('ada', SINCE)[0]).toMatchObject({ inputTokens: 100, outputTokens: 40 });
  });
});
