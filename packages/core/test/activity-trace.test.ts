import { describe, expect, it } from 'vitest';
import {
  createBotStateTracker,
  MAX_ACTIVITY_TRACE_ENTRIES,
  personaBotActivitySnapshot,
  type PersonaBotActivityEvent,
} from '../src/state/bot-state.js';

const tool = {
  effect: 'executing',
  toolKind: 'execute',
  toolName: 'bash',
  startedAt: 1000,
  activeToolCount: 1,
  sources: [{ role: 'orchestrator', count: 1 }],
} as const;

describe('bounded safe current Activity trace', () => {
  it('commits before one notification, ignores repeated aggregate facts, and clears at idle', () => {
    const states = createBotStateTracker();
    const events: PersonaBotActivityEvent[] = [];
    states.onActivity((event) => {
      expect(personaBotActivitySnapshot(['ada'], states).bots[0]?.trace).toEqual(event.trace);
      expect(event.revision).toBe(states.version().revision);
      events.push(event);
    });
    states.setSessionState('ada', 'one', 'thinking');
    states.setSessionState('ada', 'two', 'thinking');
    expect(states.trace('ada')).toHaveLength(1);
    states.setSessionState('ada', 'one', 'working', tool);
    states.setSessionState('ada', 'one', 'working', tool);
    expect(states.trace('ada').map((entry) => entry.state)).toEqual(['thinking', 'working']);
    expect(events).toHaveLength(3);
    states.setSessionState('ada', 'one', 'done');
    expect(states.trace('ada').map((entry) => entry.state)).toEqual([
      'thinking',
      'working',
      'thinking',
    ]);
    states.clearSession('ada', 'two');
    expect(states.trace('ada')).toEqual([]);
    expect(personaBotActivitySnapshot(['ada'], states).bots[0]).toEqual({
      slug: 'ada',
      state: 'idle',
    });
    expect(events.at(-1)?.trace).toBeUndefined();
    states.setSessionState('ada', 'one', 'thinking');
    expect(states.trace('ada')).toHaveLength(1);
  });

  it('evicts oldest entries, isolates Bots and starts a fresh process-local baseline', () => {
    const states = createBotStateTracker();
    for (let index = 0; index < 20; index++)
      states.setSessionState('ada', 'one', index % 2 === 0 ? 'thinking' : 'working', tool);
    const trace = states.trace('ada');
    expect(trace).toHaveLength(MAX_ACTIVITY_TRACE_ENTRIES);
    expect(trace.map((entry) => entry.revision)).toEqual([13, 14, 15, 16, 17, 18, 19, 20]);
    expect(trace.every((entry) => Number.isSafeInteger(entry.at) && entry.at >= 0)).toBe(true);
    states.setSessionState('bob', 'other', 'working', tool);
    expect(states.trace('bob')).toHaveLength(1);
    states.clearSession('bob', 'other');
    expect(states.trace('ada')).toEqual(trace);
    expect(createBotStateTracker().trace('ada')).toEqual([]);
  });

  it('copies only safe projection fields and isolates notification/snapshot consumers', () => {
    const states = createBotStateTracker();
    const poisoned = {
      ...tool,
      arguments: 'private argument',
      result: 'private result',
      reasoning: 'private reasoning',
    };
    states.onActivity((event) => {
      if (event.activity !== undefined) event.activity.toolName = 'consumer mutation';
      if (event.trace?.[0]?.activity !== undefined)
        event.trace[0].activity.toolName = 'trace mutation';
    });
    states.setSessionState('ada', 'one', 'working', poisoned);
    expect(states.trace('ada')[0]?.activity?.toolName).toBe('bash');
    const exposed = states.trace('ada');
    if (exposed[0]?.activity !== undefined) exposed[0].activity.toolName = 'snapshot mutation';
    expect(states.trace('ada')[0]?.activity?.toolName).toBe('bash');
    expect(JSON.stringify(states.trace('ada'))).not.toMatch(
      /private|arguments|result|reasoning|one/,
    );
  });
});

it('publishes one final multi-Session baseline on rebuild instead of invented recovery history', () => {
  const states = createBotStateTracker();
  const events: PersonaBotActivityEvent[] = [];
  states.onActivity((event) => events.push(event));
  states.on(() => {
    expect(states.trace('ada')[0]?.activity?.sources).toEqual([{ role: 'orchestrator', count: 2 }]);
  });
  states.rebuildSessionStates([
    { slug: 'ada', sessionId: 'one', state: 'working', activity: tool },
    { slug: 'ada', sessionId: 'two', state: 'working', activity: tool },
  ]);
  expect(events).toHaveLength(1);
  expect(states.trace('ada')).toHaveLength(1);
  expect(states.trace('ada')[0]?.activity?.sources).toEqual([{ role: 'orchestrator', count: 2 }]);
  expect(states.trace('ada')[0]?.revision).toBe(3);
});

it('commits all Bot baselines before publishing and versions repeated baseline resets', () => {
  const states = createBotStateTracker();
  const snapshots: ReturnType<typeof personaBotActivitySnapshot>[] = [];
  states.onActivity(() => snapshots.push(personaBotActivitySnapshot(['ada', 'bob'], states)));
  const rows = [
    { slug: 'ada', sessionId: 'one', state: 'working', activity: tool },
    { slug: 'bob', sessionId: 'two', state: 'thinking' },
  ] as const;
  states.rebuildSessionStates(rows);
  expect(snapshots).toHaveLength(2);
  expect(snapshots[0]).toEqual(snapshots[1]);
  expect(snapshots[0]?.bots.every((bot) => bot.trace?.length === 1)).toBe(true);
  const firstRevision = states.version().revision;
  states.rebuildSessionStates(rows);
  expect(states.version().revision).toBeGreaterThan(firstRevision);
  expect(snapshots.at(-1)?.bots.every((bot) => bot.trace?.length === 1)).toBe(true);
});
