import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountActivityPolling } from '../src/client/activity-poll.js';
import { parseActivitySnapshot, type BridgeCall } from '../src/client/bridge.js';
import { createStore, type BotSummary } from '../src/client/store.js';

const bot: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  aggregateState: 'idle',
  workspaces: [],
  createdAt: '2026-09-23T00:00:00.000Z',
};

afterEach(() => vi.useRealTimers());

describe('authoritative activity snapshot', () => {
  it('rejects malformed or ambiguous wire snapshots', () => {
    expect(
      parseActivitySnapshot({
        generation: 'boot-1',
        revision: 1,
        bots: [{ slug: 'ada', state: 'working' }],
      }),
    ).toEqual({ generation: 'boot-1', revision: 1, bots: [{ slug: 'ada', state: 'working' }] });
    expect(parseActivitySnapshot({ generation: '', revision: 1, bots: [] })).toBeUndefined();
    expect(parseActivitySnapshot({ generation: 'boot-1', revision: -1, bots: [] })).toBeUndefined();
    expect(
      parseActivitySnapshot({
        generation: 'boot-1',
        revision: 1,
        bots: [{ slug: 'ada', state: 'busy' }],
      }),
    ).toBeUndefined();
    expect(
      parseActivitySnapshot({
        generation: 'boot-1',
        revision: 1,
        bots: [
          { slug: 'ada', state: 'working' },
          { slug: 'ada', state: 'idle' },
        ],
      }),
    ).toBeUndefined();
  });

  it('keeps the latest projection across stale roster reads and accepts a restarted Host', () => {
    const store = createStore();
    store.setRoster([bot], []);
    store.setActivitySnapshot({
      generation: 'host-a',
      revision: 4,
      bots: [{ slug: 'ada', state: 'working' }],
    });
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    store.setRoster([{ ...bot, aggregateState: 'idle' }], []);
    store.upsertBot({ ...bot, aggregateState: 'idle' });
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    store.upsertBot({ ...bot, slug: 'new-bot', aggregateState: 'thinking' });
    expect(store.getSnapshot().bots.find((item) => item.slug === 'new-bot')?.aggregateState).toBe(
      'thinking',
    );

    store.setActivitySnapshot({
      generation: 'host-a',
      revision: 3,
      bots: [{ slug: 'ada', state: 'idle' }],
    });
    expect(store.getSnapshot().bots.find((item) => item.slug === 'ada')?.aggregateState).toBe(
      'working',
    );
    store.setActivitySnapshot({
      generation: 'host-b',
      revision: 0,
      bots: [{ slug: 'ada', state: 'thinking' }],
    });
    expect(store.getSnapshot().bots.find((item) => item.slug === 'ada')?.aggregateState).toBe(
      'thinking',
    );
    expect(store.getSnapshot().activityVersion).toEqual({ generation: 'host-b', revision: 0 });
  });

  it('polls only while Bot mode is visible and updates all bot surfaces through one store', async () => {
    vi.useFakeTimers();
    const store = createStore();
    store.setRoster([bot], []);
    let snapshot = { generation: 'host-a', revision: 1, bots: [{ slug: 'ada', state: 'working' }] };
    const call = vi.fn<BridgeCall>(async (endpoint) => {
      expect(endpoint).toBe('activitySnapshot');
      return { ok: true, value: snapshot };
    });
    const dispose = mountActivityPolling(store, call, 1000);
    expect(call).not.toHaveBeenCalled();

    store.setMode('bot');
    await vi.advanceTimersByTimeAsync(0);
    expect(call).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');

    snapshot = { generation: 'host-a', revision: 2, bots: [{ slug: 'ada', state: 'idle' }] };
    await vi.advanceTimersByTimeAsync(1000);
    expect(call).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');

    store.setMode('dsh');
    await vi.advanceTimersByTimeAsync(3000);
    expect(call).toHaveBeenCalledTimes(2);
    dispose();
  });
});
