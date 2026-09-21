import { describe, expect, it } from 'vitest';

import { createBotStateTracker } from '../src/state/bot-state.js';
import {
  createDshActivityProjection,
  deriveSessionState,
  sessionStateForEvent,
} from '../src/state/dsh-activity.js';
import { createFakeSessionOwnership } from './helpers.js';

const event = (type: string) => ({ type, time: 1, data: {} });

describe('DSH activity projection', () => {
  it('maps state-bearing Session events and ignores the rest', () => {
    expect(sessionStateForEvent(event('tool/call'))).toBe('working');
    expect(sessionStateForEvent(event('step/start'))).toBe('thinking');
    expect(sessionStateForEvent(event('assistant/message'))).toBe('thinking');
    expect(sessionStateForEvent(event('tool/result'))).toBe('thinking');
    expect(sessionStateForEvent(event('turn/end'))).toBe('done');
    expect(sessionStateForEvent(event('request/header'))).toBeUndefined();
  });

  it('derives the last state-bearing event from a durable log', () => {
    expect(deriveSessionState([event('user/message'), event('tool/call')])).toBe('working');
    expect(deriveSessionState([event('tool/call'), event('turn/end')])).toBe('done');
    expect(deriveSessionState([event('request/header')])).toBeUndefined();
    expect(deriveSessionState([])).toBeUndefined();
  });

  it('publishes owned Sessions and never contaminates unowned ones', () => {
    const states = createBotStateTracker();
    const ownership = createFakeSessionOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    activity.handleSessionEvent('session-1', event('tool/call'));
    activity.handleSessionEvent('unowned', event('tool/call'));

    expect(states.snapshot('ada')).toEqual({
      slug: 'ada',
      state: 'working',
      sessions: { 'session-1': 'working' },
    });
    expect(states.snapshot('bob').sessions).toEqual({});
  });

  it('clears a disposed Session without touching its siblings', () => {
    const states = createBotStateTracker();
    const ownership = createFakeSessionOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'assignment' },
    });
    const activity = createDshActivityProjection({ ownership, states });
    activity.handleSessionEvent('session-1', event('tool/call'));
    activity.handleSessionEvent('session-2', event('step/start'));

    activity.handleSessionDisposed('session-1');
    activity.handleSessionDisposed('unowned');

    expect(states.snapshot('ada').sessions).toEqual({ 'session-2': 'thinking' });
  });

  it('attributes a fork and a Subagent to the owning parent through lineage', () => {
    const states = createBotStateTracker();
    const ownership = createFakeSessionOwnership({
      'root-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    expect(
      activity.handleAgentCreated({
        id: 'fork-1',
        header: { parentSession: 'root-1' },
        snapshotEvents: () => [],
      }),
    ).toBe(true);
    expect(ownership.resolve('fork-1')).toMatchObject({
      botSlug: 'ada',
      rootRole: 'assignment',
      provenance: 'fork',
      parentSessionId: 'root-1',
    });
    expect(ownership.rootsFor('ada', 'assignment')).toEqual([]);

    expect(
      activity.handleAgentCreated({
        id: 'subagent-1',
        header: { parentSession: 'fork-1', origin: 'subagent' },
        snapshotEvents: () => [],
      }),
    ).toBe(true);
    expect(ownership.resolve('subagent-1')).toMatchObject({
      provenance: 'subagent',
      parentSessionId: 'fork-1',
    });
    expect(ownership.descendantsOf('root-1').map((record) => record.sessionId)).toEqual([
      'fork-1',
      'subagent-1',
    ]);

    expect(
      activity.handleAgentCreated({ id: 'orphan', header: {}, snapshotEvents: () => [] }),
    ).toBe(false);
    expect(
      activity.handleAgentCreated({
        id: 'child-of-unowned',
        header: { parentSession: 'nobody' },
        snapshotEvents: () => [],
      }),
    ).toBe(false);
    expect(ownership.resolve('child-of-unowned')).toBeUndefined();
  });

  it('attributes lineage during a cold rebuild before deriving state', () => {
    const states = createBotStateTracker();
    const ownership = createFakeSessionOwnership({
      'root-1': { botSlug: 'ada', rootRole: 'orchestrator' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    const report = activity.rebuild([
      {
        id: 'subagent-1',
        header: { parentSession: 'root-1', origin: 'subagent' },
        snapshotEvents: () => [event('tool/call')],
      },
      { id: 'root-1', header: {}, snapshotEvents: () => [event('turn/end')] },
    ]);

    expect(report).toEqual({ rebuilt: 2, attributed: 1, unowned: 0 });
    expect(ownership.resolve('subagent-1')).toMatchObject({ provenance: 'subagent' });
    expect(states.snapshot('ada').sessions).toEqual({ 'root-1': 'done', 'subagent-1': 'working' });
  });

  it('rebuilds cold state from durable logs, bounded by ownership', () => {
    const states = createBotStateTracker();
    const ownership = createFakeSessionOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'assignment' },
    });
    const activity = createDshActivityProjection({ ownership, states });

    const report = activity.rebuild([
      { id: 'session-1', header: {}, snapshotEvents: () => [event('tool/call')] },
      { id: 'session-2', header: {}, snapshotEvents: () => [event('turn/end')] },
      { id: 'unowned', header: {}, snapshotEvents: () => [event('tool/call')] },
    ]);

    expect(report).toEqual({ rebuilt: 2, attributed: 0, unowned: 1 });
    expect(states.snapshot('ada')).toEqual({
      slug: 'ada',
      state: 'working',
      sessions: { 'session-1': 'working', 'session-2': 'done' },
    });
  });
});
