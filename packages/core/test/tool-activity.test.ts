import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { createBotStateTracker, personaBotActivitySnapshot } from '../src/state/bot-state.js';
import { createDshActivityProjection } from '../src/state/dsh-activity.js';
import {
  activityEffectForToolKind,
  type PersonaBotToolActivity,
} from '../src/state/tool-activity.js';
import { createTestOwnership } from './helpers.js';

const call = (id: string, name = 'search') => ({
  type: 'tool/call',
  time: 1000,
  data: {
    callId: id,
    name,
    arguments: JSON.stringify({
      secret: 'private-token',
      text: 'private reasoning',
      command: 'private-command',
    }),
  },
});
const result = (id: string) => ({
  type: 'tool/result',
  time: 2000,
  data: { message: { toolCallId: id, content: [{ type: 'text', text: 'private-result' }] } },
});
function setup() {
  const states = createBotStateTracker();
  const ownership = createTestOwnership({
    root: { botSlug: 'ada', rootRole: 'orchestrator' },
    child: { botSlug: 'ada', rootRole: 'assignment' },
  });
  const projection = createDshActivityProjection({
    states,
    ownership,
    describeCall: (_id, name) =>
      name === 'unknown'
        ? undefined
        : name === 'broken'
          ? (() => {
              throw Error('private failure');
            })()
          : {
              name,
              view:
                name === 'shell'
                  ? { card: 'terminal', title: 'private-command', cwd: 'private-path' }
                  : {
                      card: 'generic',
                      kind: 'search',
                      title: 'private title',
                      rawInput: 'private-token',
                    },
            },
  });
  return { states, projection };
}
describe('safe tool Activity', () => {
  it.each([
    ['read', 'coding'],
    ['edit', 'coding'],
    ['delete', 'coding'],
    ['move', 'coding'],
    ['search', 'searching'],
    ['fetch', 'searching'],
    ['execute', 'executing'],
    ['other', 'generic-working'],
    ['future', 'generic-working'],
    [undefined, 'generic-working'],
  ])('maps %s with a safe fallback', (kind, effect) =>
    expect(activityEffectForToolKind(kind)).toBe(effect),
  );
  it('pairs concurrent calls; one result cannot hide another active tool; changes same-state revisions', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a'));
    projection.handleSessionEvent('root', call('b'));
    expect(states.activity('ada')).toMatchObject({
      toolKind: 'search',
      effect: 'searching',
      activeToolCount: 2,
    });
    expect(states.version().revision).toBe(2);
    projection.handleSessionEvent('root', result('a'));
    expect(states.snapshot('ada').state).toBe('working');
    expect(states.activity('ada')?.activeToolCount).toBe(1);
    projection.handleSessionEvent('root', result('b'));
    expect(states.snapshot('ada').state).toBe('thinking');
    expect(states.activity('ada')).toBeUndefined();
  });
  it('coalesces mixed tool kinds across owned Sessions; removal restores the remaining effect', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a'));
    projection.handleSessionEvent('child', call('b', 'shell'));
    expect(states.activity('ada')).toMatchObject({
      toolKind: 'other',
      effect: 'generic-working',
      activeToolCount: 2,
    });
    projection.handleSessionDisposed('child');
    expect(states.activity('ada')?.effect).toBe('searching');
    projection.handleSessionEvent('root', { type: 'turn/end', time: 3000, data: {} });
    expect(states.activity('ada')).toBeUndefined();
  });
  it('fails closed on unregistered or throwing presenters; does not expose model-provided names', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a', 'unknown'));
    expect(states.activity('ada')).toMatchObject({ toolKind: 'other', effect: 'generic-working' });
    expect(states.activity('ada')?.toolName).toBeUndefined();
    projection.handleSessionEvent('root', call('b', 'broken'));
    expect(states.activity('ada')?.effect).toBe('generic-working');
    projection.handleSessionEvent('unowned', call('c', 'shell'));
    expect(states.version().revision).toBe(2);
  });
  it('notifies a Cordis plugin consumer once after commit with snapshot revision; no payload contains private data', () => {
    const { states, projection } = setup();
    const ctx = new Context();
    const notifications: unknown[] = [];
    ctx.on('botharness/personabot/activity', (event) => {
      expect(personaBotActivitySnapshot(['ada'], states).revision).toBe(event.revision);
      expect(personaBotActivitySnapshot(['ada'], states).bots[0]).toEqual({
        slug: event.slug,
        state: event.state,
        activity: event.activity,
      });
      notifications.push(event);
    });
    const stop = states.onActivity((event) => ctx.emit('botharness/personabot/activity', event));
    projection.handleSessionEvent('root', call('a', 'shell'));
    projection.handleSessionEvent('root', call('a', 'shell'));
    expect(notifications).toHaveLength(1);
    expect(JSON.stringify(notifications)).not.toMatch(
      /private|arguments|content|rawInput|cwd|reasoning/,
    );
    expect(JSON.stringify(personaBotActivitySnapshot(['ada'], states))).not.toMatch(
      /private|arguments|content/,
    );
    stop();
    projection.handleSessionEvent('root', result('a'));
    expect(notifications).toHaveLength(1);
  });
  it('rebuilds pending tool facts and clears them at a durable Turn end', () => {
    const { states, projection } = setup();
    projection.rebuild([
      {
        id: 'root',
        header: {},
        snapshotEvents: () => [call('a', 'shell'), call('b'), result('a')],
      },
    ]);
    expect(states.activity('ada')).toMatchObject({ effect: 'searching', activeToolCount: 1 });
    projection.rebuild([
      {
        id: 'root',
        header: {},
        snapshotEvents: () => [call('a', 'shell'), { type: 'turn/end', time: 3000, data: {} }],
      },
    ]);
    expect(states.snapshot('ada').state).toBe('idle');
    expect(states.activity('ada')).toBeUndefined();
  });
  it('keeps the outgoing authority allowlisted even when a trusted caller carries extra fields', () => {
    const states = createBotStateTracker();
    const activity = {
      effect: 'executing',
      toolKind: 'execute',
      startedAt: 1000,
      activeToolCount: 1,
      arguments: 'private',
    } satisfies PersonaBotToolActivity & { arguments: string };
    states.setSessionState('ada', 's', 'working', activity);
    expect(JSON.stringify(personaBotActivitySnapshot(['ada'], states))).not.toContain('private');
  });
});
