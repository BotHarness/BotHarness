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
const session = {
  id: 'activity-11111111-1111-4111-8111-111111111111',
  role: 'assignment',
  name: 'Verify compact activity',
  revision: 2,
  at: 2000,
  state: 'working',
  activity,
};
function snapshot(entries: unknown, state = 'working', revision = 3) {
  return JSON.stringify({
    generation: 'host',
    revision,
    bots: [{ slug: 'ada', state, ...(state === 'working' ? { activity } : {}), sessions: entries }],
  });
}
describe('safe per-Session activity transport', () => {
  it('allowlists current Session fields and keeps separate same-role Sessions', () => {
    const second = { ...session, id: 'activity-22222222-2222-4222-8222-222222222222', revision: 1 };
    const result = parseActivitySnapshot(
      snapshot([
        {
          ...session,
          sessionId: 'private Session',
          arguments: 'private input',
          activity: { ...activity, results: 'private output' },
        },
        second,
      ]),
    );
    expect(result?.bots[0]?.sessions).toEqual([session, second]);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it.each(
    [
      [],
      [session, session],
      [{ ...session, id: 'native-private-session' }],
      [{ ...session, role: 'unknown' }],
      [{ ...session, name: '' }],
      [{ ...session, name: 'bad\nname' }],
      [{ ...session, name: 'x'.repeat(1025) }],
      [{ ...session, revision: 4 }],
      [{ ...session, at: -1 }],
      [{ ...session, at: 8_640_000_000_000_001 }],
      [{ ...session, state: 'idle' }],
      [{ ...session, state: 'thinking' }],
      [{ ...session, activity: { ...activity, publicDetail: 'bad\ntext' } }],
      [{ ...session, activity: { ...activity, sources: [{ role: 'orchestrator', count: 1 }] } }],
    ].map((entries) => [entries]),
  )('rejects invalid Session rows %j', (entries) => {
    expect(parseActivitySnapshot(snapshot(entries))).toBeUndefined();
  });
  it('does not impose an eight-row history cap on active Sessions and accepts earlier per-Session revisions', () => {
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      ...session,
      id: `activity-${String(index).padStart(8, '0')}-1111-4111-8111-111111111111`,
    }));
    expect(parseActivitySnapshot(snapshot(sessions))?.bots[0]?.sessions).toHaveLength(10);
  });
  it('preserves current rows against stale snapshots and clears at idle or Host generation change', () => {
    expect(parseActivitySnapshot(snapshot([session], 'idle'))).toBeUndefined();
    const store = createStore();
    store.setRoster(
      [
        {
          slug: 'ada',
          displayName: 'Ada',
          roles: [],
          aggregateState: 'idle',
          workspaces: [],
          createdAt: '2026-10-03T00:00:00Z',
        },
      ],
      [],
    );
    const current = parseActivitySnapshot(snapshot([session]));
    expect(current).toBeDefined();
    if (current === undefined) return;
    store.applyActivity(current);
    expect(store.getSnapshot().bots[0]?.sessionActivity).toEqual([session]);
    store.applyActivity({
      generation: 'host',
      revision: 2,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.sessionActivity).toEqual([session]);
    store.applyActivity({
      generation: 'host',
      revision: 4,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots[0]?.sessionActivity).toBeUndefined();
    store.applyActivity(current);
    store.applyActivity({
      generation: 'new-host',
      revision: 0,
      bots: [{ slug: 'ada', state: 'thinking' }],
    });
    expect(store.getSnapshot().bots[0]?.sessionActivity).toBeUndefined();
  });
});
