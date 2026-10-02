import { describe, expect, it } from 'vitest';
import { createBotStateTracker, type PersonaBotToolActivity } from '../src/index.js';
import { personaBotActivitySnapshot } from '../src/state/bot-state.js';

const executing: PersonaBotToolActivity = {
  effect: 'executing',
  toolKind: 'execute',
  toolName: 'bash',
  startedAt: 10,
  activeToolCount: 1,
};
const searching: PersonaBotToolActivity = {
  effect: 'searching',
  toolKind: 'search',
  toolName: 'grep',
  startedAt: 20,
  activeToolCount: 1,
};

describe('Orchestrator-owned PersonaBot presentation', () => {
  it('keeps active Orchestrator thinking while an Assignment executes', () => {
    const states = createBotStateTracker();
    states.setSessionState('ada', 'orch', 'thinking', undefined, 'orchestrator');
    states.setSessionState('ada', 'assignment', 'working', executing, 'assignment');
    expect(states.snapshot('ada').state).toBe('thinking');
    expect(states.activity('ada')).toBeUndefined();
    expect(states.sessionActivity('ada').map(({ role, state }) => ({ role, state }))).toEqual([
      { role: 'orchestrator', state: 'thinking' },
      { role: 'assignment', state: 'working' },
    ]);
  });

  it('selects Orchestrator Tool facts without mixing concurrent Assignment tools', () => {
    const states = createBotStateTracker();
    states.setSessionState('ada', 'assignment', 'working', searching, 'assignment');
    states.setSessionState('ada', 'orch', 'working', executing, 'orchestrator');
    expect(states.snapshot('ada').state).toBe('working');
    expect(states.activity('ada')).toEqual(executing);
  });

  it('hands off to the remaining Assignment on completion, then returns to idle', () => {
    const states = createBotStateTracker();
    states.setSessionState('ada', 'orch', 'thinking', undefined, 'orchestrator');
    states.setSessionState('ada', 'assignment', 'working', searching, 'assignment');
    states.setSessionState('ada', 'orch', 'done', undefined, 'orchestrator');
    expect(states.activity('ada')).toEqual(searching);
    expect(states.snapshot('ada').state).toBe('working');
    states.clearSession('ada', 'assignment');
    expect(states.snapshot('ada').state).toBe('idle');
    expect(states.activity('ada')).toBeUndefined();
  });

  it('does not let an Assignment attention state replace active Orchestrator work', () => {
    const states = createBotStateTracker();
    states.setSessionState('ada', 'orch', 'working', executing, 'orchestrator');
    states.setSessionState('ada', 'assignment', 'blocked', undefined, 'assignment');
    expect(states.snapshot('ada').state).toBe('working');
    expect(states.snapshot('ada').sessions.assignment).toBe('blocked');
    expect(states.activity('ada')).toEqual(executing);
  });

  it('publishes the committed role selection and restores Assignment activity on Orchestrator disposal', () => {
    const states = createBotStateTracker();
    const notifications: unknown[] = [];
    states.onActivity((event) => notifications.push(event));
    states.setSessionState('ada', 'first', 'working', executing, 'assignment');
    states.setSessionState('ada', 'second', 'working', searching, 'assignment');
    states.setSessionState('ada', 'first', 'working', executing, 'orchestrator');
    const selected = personaBotActivitySnapshot(['ada'], states);
    expect(notifications.at(-1)).toMatchObject({
      ...selected.bots[0],
      revision: selected.revision,
    });
    expect(selected.bots[0]?.activity).toEqual(executing);
    states.clearSession('ada', 'first');
    expect(states.activity('ada')).toEqual(searching);
    expect(notifications.at(-1)).toMatchObject({ state: 'working', activity: searching });
  });

  it.each([false, true])(
    'rebuild and notification use the same selection, reversed=%s',
    (reverse) => {
      const states = createBotStateTracker();
      const notifications: unknown[] = [];
      states.onActivity((event) => notifications.push(event));
      const rows = [
        {
          slug: 'ada',
          sessionId: 'orch',
          state: 'thinking' as const,
          role: 'orchestrator' as const,
        },
        {
          slug: 'ada',
          sessionId: 'assignment',
          state: 'working' as const,
          role: 'assignment' as const,
          activity: searching,
        },
      ];
      states.rebuildSessionStates(reverse ? rows.reverse() : rows);
      const snapshot = personaBotActivitySnapshot(['ada'], states);
      expect(snapshot.bots[0]?.state).toBe('thinking');
      expect(snapshot.bots[0]?.activity).toBeUndefined();
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        generation: snapshot.generation,
        revision: snapshot.revision,
        ...snapshot.bots[0],
      });
    },
  );
});
