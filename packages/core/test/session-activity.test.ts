import { describe, expect, it } from 'vitest';
import {
  createBotStateTracker,
  personaBotActivitySnapshot,
  type PersonaBotActivityEvent,
} from '../src/state/bot-state.js';
const tool = {
  effect: 'executing',
  toolKind: 'execute',
  toolName: 'bash',
  startedAt: 1000,
  activeToolCount: 1,
  sources: [{ role: 'assignment', count: 1 }],
} as const;
describe('latest safe activity for each active Session', () => {
  it('replaces each Session latest observation without accumulating eight-item history or merging peers', () => {
    const states = createBotStateTracker();
    const events: PersonaBotActivityEvent[] = [];
    states.onActivity((event) => {
      expect(personaBotActivitySnapshot(['ada'], states).bots[0]?.sessions).toEqual(event.sessions);
      expect(event.revision).toBe(states.version().revision);
      events.push(event);
    });
    states.setSessionState('ada', 'private-first', 'thinking', undefined, 'assignment');
    states.setSessionState('ada', 'private-second', 'working', tool, 'assignment');
    const original = states.sessionActivity('ada');
    expect(original).toHaveLength(2);
    expect(new Set(original.map((row) => row.id)).size).toBe(2);
    expect(original[0]?.id).toMatch(/^activity-/u);
    for (let index = 0; index < 12; index += 1)
      states.setSessionState(
        'ada',
        'private-first',
        index % 2 === 0 ? 'working' : 'thinking',
        index % 2 === 0 ? tool : undefined,
        'assignment',
      );
    expect(states.sessionActivity('ada')).toHaveLength(2);
    expect(states.sessionActivity('ada')[0]).toMatchObject({
      id: original[0]?.id,
      state: 'thinking',
    });
    expect(states.sessionActivity('ada')[0]?.activity).toBeUndefined();
    expect(states.sessionActivity('ada')[1]).toEqual(original[1]);
    const revision = states.version().revision;
    states.setSessionState('ada', 'private-first', 'thinking', undefined, 'assignment');
    expect(states.version().revision).toBe(revision);
    states.setSessionState('ada', 'private-second', 'done', undefined, 'assignment');
    expect(states.sessionActivity('ada')).toHaveLength(1);
    states.clearSession('ada', 'private-first');
    expect(events.at(-1)?.state).toBe('idle');
    expect(events.at(-1)?.sessions).toBeUndefined();
    expect(JSON.stringify(events)).not.toMatch(/private-|trace/u);
  });
  it('keeps Bot isolation and copies only public fields, with mutation-safe snapshots/events', () => {
    const states = createBotStateTracker();
    const poisoned = {
      ...tool,
      arguments: 'private arguments',
      results: 'private result',
      reasoning: 'private thought',
    };
    states.onActivity((event) => {
      if (event.sessions?.[0]?.activity !== undefined)
        event.sessions[0].activity.toolName = 'mutated';
    });
    states.setSessionState('ada', 'native-first', 'working', poisoned, 'assignment');
    states.setSessionState('bob', 'native-second', 'thinking', undefined, 'orchestrator');
    const exposed = states.sessionActivity('ada');
    if (exposed[0]?.activity !== undefined) exposed[0].activity.toolName = 'mutated snapshot';
    expect(states.sessionActivity('ada')[0]?.activity?.toolName).toBe('bash');
    expect(states.sessionActivity('bob')[0]?.role).toBe('orchestrator');
    states.clearSession('bob', 'native-second');
    expect(states.sessionActivity('ada')).toHaveLength(1);
    expect(JSON.stringify(states.sessionActivity('ada'))).not.toMatch(
      /private|native|arguments|results|reasoning/u,
    );
    expect(createBotStateTracker().sessionActivity('ada')).toEqual([]);
  });
  it('atomically publishes complete multi-Bot baselines and advances repeat rebuild revision', () => {
    const states = createBotStateTracker();
    const snapshots: ReturnType<typeof personaBotActivitySnapshot>[] = [];
    states.onActivity(() => snapshots.push(personaBotActivitySnapshot(['ada', 'bob'], states)));
    const rows = [
      { slug: 'ada', sessionId: 'one', state: 'working', activity: tool, role: 'assignment' },
      { slug: 'bob', sessionId: 'two', state: 'thinking', role: 'orchestrator' },
    ] as const;
    states.rebuildSessionStates(rows);
    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]).toEqual(snapshots[1]);
    expect(snapshots[0]?.bots.every((bot) => bot.sessions?.length === 1)).toBe(true);
    const firstRevision = states.version().revision;
    const ids = snapshots[0]?.bots.map((bot) => bot.sessions?.[0]?.id);
    states.rebuildSessionStates(rows);
    expect(states.version().revision).toBeGreaterThan(firstRevision);
    expect(snapshots.at(-1)?.bots.map((bot) => bot.sessions?.[0]?.id)).toEqual(ids);
    expect(snapshots.at(-1)).toEqual(snapshots.at(-2));
  });
});
