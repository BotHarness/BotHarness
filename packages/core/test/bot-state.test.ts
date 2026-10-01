import { describe, expect, it } from 'vitest';

import { aggregateSessionStates, createBotStateTracker, type BotStateEvent } from '../src/index.js';

describe('aggregateSessionStates', () => {
  it('applies the precedence blocked > waiting > working > thinking > idle', () => {
    expect(aggregateSessionStates({})).toBe('idle');
    expect(aggregateSessionStates({ a: 'thinking' })).toBe('thinking');
    expect(aggregateSessionStates({ a: 'thinking', b: 'working' })).toBe('working');
    expect(aggregateSessionStates({ a: 'working', b: 'waiting' })).toBe('waiting');
    expect(aggregateSessionStates({ a: 'waiting', b: 'blocked' })).toBe('blocked');
    expect(aggregateSessionStates({ a: 'blocked', b: 'working', c: 'waiting' })).toBe('blocked');
  });

  it('ignores done sessions', () => {
    expect(aggregateSessionStates({ a: 'done' })).toBe('idle');
    expect(aggregateSessionStates({ a: 'done', b: 'working' })).toBe('working');
  });
});

describe('createBotStateTracker', () => {
  it('increments revision only for changed Session projection facts', () => {
    const tracker = createBotStateTracker();
    const initial = tracker.version();
    expect(initial.revision).toBe(0);
    tracker.setSessionState('ada', 'owned-1', 'thinking');
    tracker.setSessionState('ada', 'owned-1', 'thinking');
    expect(tracker.version()).toEqual({ generation: initial.generation, revision: 1 });
    tracker.setSessionState('ada', 'owned-1', 'working');
    tracker.clearSession('ada', 'missing');
    tracker.clearSession('ada', 'owned-1');
    expect(tracker.version()).toEqual({ generation: initial.generation, revision: 3 });
    expect(createBotStateTracker().version().generation).not.toBe(initial.generation);
  });

  it('reports snapshots with session detail', () => {
    const tracker = createBotStateTracker();
    tracker.setSessionState('research', 's1', 'working');
    tracker.setSessionState('research', 's2', 'waiting');

    expect(tracker.snapshot('research')).toEqual({
      slug: 'research',
      state: 'waiting',
      sessions: { s1: 'working', s2: 'waiting' },
    });
    expect(tracker.snapshot('unknown')).toEqual({ slug: 'unknown', state: 'idle', sessions: {} });
  });

  it('emits aggregate-changed only when the aggregate changes', () => {
    const tracker = createBotStateTracker();
    const events: BotStateEvent[] = [];
    tracker.on((event) => events.push(event));

    tracker.setSessionState('research', 's1', 'thinking');
    tracker.setSessionState('research', 's2', 'thinking');
    tracker.setSessionState('research', 's2', 'working');

    expect(events.map((event) => event.type)).toEqual([
      'session-changed',
      'aggregate-changed',
      'session-changed',
      'session-changed',
      'aggregate-changed',
    ]);
    const aggregates = events.filter((event) => event.type === 'aggregate-changed');
    expect(aggregates[0]).toMatchObject({ state: 'thinking', previous: 'idle' });
    expect(aggregates[1]).toMatchObject({ state: 'working', previous: 'thinking' });
  });

  it('emits session-changed even when the aggregate does not move', () => {
    const tracker = createBotStateTracker();
    const events: BotStateEvent[] = [];
    tracker.setSessionState('research', 's1', 'thinking');
    tracker.setSessionState('research', 's2', 'blocked');
    tracker.on((event) => events.push(event));

    tracker.setSessionState('research', 's1', 'working');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'session-changed',
      slug: 'research',
      sessionId: 's1',
      state: 'working',
    });
    expect(tracker.snapshot('research').state).toBe('blocked');
  });

  it('does not emit when a session state is repeated', () => {
    const tracker = createBotStateTracker();
    const events: BotStateEvent[] = [];
    tracker.setSessionState('research', 's1', 'working');
    tracker.on((event) => events.push(event));

    tracker.setSessionState('research', 's1', 'working');

    expect(events).toEqual([]);
  });

  it('reports done as a session event while the aggregate returns to idle', () => {
    const tracker = createBotStateTracker();
    const events: BotStateEvent[] = [];
    tracker.setSessionState('research', 's1', 'working');
    tracker.on((event) => events.push(event));

    tracker.setSessionState('research', 's1', 'done');

    expect(events.map((event) => event.type)).toEqual(['session-changed', 'aggregate-changed']);
    expect(events[0]).toMatchObject({ type: 'session-changed', sessionId: 's1', state: 'done' });
    expect(tracker.snapshot('research').state).toBe('idle');
  });

  it('clears sessions and recomputes the aggregate', () => {
    const tracker = createBotStateTracker();
    const events: BotStateEvent[] = [];
    tracker.setSessionState('research', 's1', 'working');
    tracker.setSessionState('research', 's2', 'blocked');
    tracker.on((event) => events.push(event));

    tracker.clearSession('research', 's2');

    expect(tracker.snapshot('research').state).toBe('working');
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: 'session-removed', sessionId: 's2' });
    expect(events[1]).toMatchObject({
      type: 'aggregate-changed',
      state: 'working',
      previous: 'blocked',
    });
  });

  it('unsubscribes listeners', () => {
    const tracker = createBotStateTracker();
    let count = 0;
    const off = tracker.on(() => {
      count += 1;
    });
    tracker.setSessionState('research', 's1', 'thinking');
    off();
    tracker.setSessionState('research', 's2', 'working');

    expect(count).toBe(2);
  });
});
