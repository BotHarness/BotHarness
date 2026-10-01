import { describe, expect, it } from 'vitest';
import { mountActivityLive, parseActivitySnapshot } from '../src/client/activity-live.js';
import { createStore, type BotSummary } from '../src/client/store.js';

const BOT: BotSummary = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  workspaces: [],
  description: '',
  paused: false,
  aggregateState: 'idle',
  createdAt: '2026-10-01T00:00:00Z',
};
class Source {
  closed = false;
  listener: EventListener | undefined;
  addEventListener(_name: string, listener: EventListener): void {
    this.listener = listener;
  }
  close(): void {
    this.closed = true;
  }
  emit(generation: string, revision: number, state: string): void {
    this.listener?.(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation, revision, bots: [{ slug: 'ada', state }] }),
      }),
    );
  }
}

describe('live PersonaBot activity', () => {
  it('shows Host changes without roster polling, retains them over stale HTTP results, and accepts restart baselines', () => {
    const store = createStore();
    store.setRoster([BOT], []);
    const sources: Source[] = [];
    const dispose = mountActivityLive(store, (url) => {
      expect(url).toBe('/api/botharness/stream?scope=activity');
      const source = new Source();
      sources.push(source);
      return source as unknown as EventSource;
    });
    expect(sources).toHaveLength(0);
    store.setMode('bot');
    sources[0]!.emit('host-one', 3, 'thinking');
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('thinking');
    sources[0]!.emit('host-one', 4, 'working');
    store.setRoster([BOT], []);
    store.upsertBot(BOT);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    sources[0]!.emit('host-one', 2, 'idle');
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    store.setMode('dsh');
    expect(sources[0]?.closed).toBe(true);
    store.setMode('bot');
    sources[1]!.emit('host-two', 0, 'idle');
    sources[0]!.emit('host-one', 99, 'blocked');
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
    dispose();
    expect(sources[1]?.closed).toBe(true);
    sources[1]!.emit('host-two', 2, 'working');
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
  });

  it('keeps a baseline received before initial roster loading and rejects incomplete or ambiguous frames', () => {
    const store = createStore();
    store.applyActivity({
      generation: 'one',
      revision: 1,
      bots: [{ slug: 'ada', state: 'working' }],
    });
    store.setRoster([BOT], []);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    for (const value of [
      null,
      {},
      { generation: 'one', revision: -1, bots: [] },
      { generation: 'one', revision: 1, bots: [{ slug: 'ada', state: 'fake' }] },
      {
        generation: 'one',
        revision: 1,
        bots: [
          { slug: 'ada', state: 'idle' },
          { slug: 'ada', state: 'working' },
        ],
      },
    ]) {
      expect(parseActivitySnapshot(JSON.stringify(value))).toBeUndefined();
    }
    expect(parseActivitySnapshot('{')).toBeUndefined();
  });
});
