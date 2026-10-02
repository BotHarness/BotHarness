import { describe, expect, it } from 'vitest';
import { parseActivitySnapshot } from '../src/client/activity-live.js';
import { createStore } from '../src/client/store.js';

const activity = {
  effect: 'executing',
  toolKind: 'execute',
  toolName: 'bash',
  startedAt: 1000,
  activeToolCount: 1,
  publicDetail: 'Running a public operation',
};
const trace = [
  { revision: 1, at: 1000, state: 'thinking' },
  { revision: 2, at: 2000, state: 'working', activity },
];
function snapshot(entries: unknown, state = 'working', revision = 3) {
  return JSON.stringify({
    generation: 'host',
    revision,
    bots: [{ slug: 'ada', state, ...(state === 'working' ? { activity } : {}), trace: entries }],
  });
}

describe('safe Activity trace transport', () => {
  it('allowlists trace fields and retained tool detail rather than accepting native payloads', () => {
    const result = parseActivitySnapshot(
      snapshot([
        { ...trace[0], arguments: 'private input', sessionId: 'private session' },
        {
          ...trace[1],
          activity: { ...activity, results: 'private output', reasoning: 'private thought' },
        },
      ]),
    );
    expect(result?.bots[0]?.trace).toEqual(trace);
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it.each(
    [
      [],
      Array(9).fill(trace[0]),
      [{ ...trace[0], revision: 4 }],
      [trace[1], trace[0]],
      [trace[0], trace[0]],
      [{ ...trace[0], revision: -1 }],
      [{ ...trace[0], at: -1 }],
      [{ ...trace[0], at: 8_640_000_000_000_001 }],
      [{ ...trace[0], state: 'idle' }],
      [{ ...trace[0], state: 'thinking', activity }],
      [{ ...trace[1], activity: { ...activity, publicDetail: 'bad\ntext' } }],
    ].map((entries) => [entries]),
  )('fails closed on invalid trace %j', (entries) => {
    expect(parseActivitySnapshot(snapshot(entries))).toBeUndefined();
  });

  it('rejects idle history, preserves old snapshots, and drops history after idle/restart', () => {
    expect(parseActivitySnapshot(snapshot(trace, 'idle'))).toBeUndefined();
    const store = createStore();
    store.setRoster(
      [
        {
          slug: 'ada',
          displayName: 'Ada',
          roles: [],
          aggregateState: 'idle',
          workspaces: [],
          createdAt: '2026-10-02T00:00:00Z',
        },
      ],
      [],
    );
    const current = parseActivitySnapshot(snapshot(trace));
    expect(current).toBeDefined();
    if (current === undefined) return;
    store.applyActivity(current);
    expect(store.getSnapshot().bots[0]?.activityTrace).toEqual(trace);
    store.applyActivity({
      generation: 'host',
      revision: 2,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activityTrace).toEqual(trace);
    store.applyActivity({
      generation: 'host',
      revision: 4,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.activityTrace).toBeUndefined();
    store.applyActivity({
      generation: 'new-host',
      revision: 0,
      bots: [{ slug: 'ada', state: 'thinking' }],
    });
    expect(store.getSnapshot().bots[0]?.activityTrace).toBeUndefined();
    expect(
      parseActivitySnapshot(
        JSON.stringify({
          generation: 'old-host',
          revision: 1,
          bots: [{ slug: 'ada', state: 'working', activity }],
        }),
      )?.bots[0]?.trace,
    ).toBeUndefined();
  });
});
