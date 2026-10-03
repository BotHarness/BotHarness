import { afterEach, describe, expect, it, vi } from 'vitest';
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
  listeners = new Map<string, EventListener>();
  readyState = 1;
  addEventListener(name: string, listener: EventListener): void {
    this.listeners.set(name, listener);
  }
  close(): void {
    this.closed = true;
  }
  emit(generation: string, revision: number, state: string): void {
    this.listeners.get('activity/snapshot')?.(
      new MessageEvent('activity/snapshot', {
        data: JSON.stringify({ generation, revision, bots: [{ slug: 'ada', state }] }),
      }),
    );
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

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

  it('refreshes only during stream failure and cancels recovery on mode exit', async () => {
    vi.useFakeTimers();
    const store = createStore();
    store.setRoster([BOT], []);
    store.setMode('bot');
    const source = new Source();
    let revision = 1;
    const read = vi.fn(async () => ({
      generation: 'host',
      revision: revision++,
      bots: [{ slug: 'ada', state: 'idle' }],
    }));
    const dispose = mountActivityLive(store, () => source as unknown as EventSource, read);
    await vi.advanceTimersByTimeAsync(0);
    source.emit('host', 2, 'working');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(1);
    revision = 3;
    source.listeners.get('error')?.(new Event('error'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
    expect(read).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(3);
    source.emit('host', 5, 'thinking');
    const recoveredCalls = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(recoveredCalls);
    store.setMode('dsh');
    expect(source.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(recoveredCalls);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('refetches revision gaps and ignores late replies from a previous Host generation', async () => {
    vi.useFakeTimers();
    const store = createStore();
    store.setRoster([BOT], []);
    const source = new Source();
    const pending: { signal: AbortSignal; resolve: (value: unknown) => void }[] = [];
    const read = vi.fn(
      (signal: AbortSignal) => new Promise<unknown>((resolve) => pending.push({ signal, resolve })),
    );
    const dispose = mountActivityLive(store, () => source as unknown as EventSource, read);
    store.setMode('bot');
    pending[0]!.resolve({ generation: 'one', revision: 1, bots: [{ slug: 'ada', state: 'idle' }] });
    await vi.advanceTimersByTimeAsync(0);
    source.emit('one', 4, 'working');
    expect(read).toHaveBeenCalledTimes(2);
    source.emit('two', 0, 'idle');
    pending[1]!.resolve({
      generation: 'one',
      revision: 99,
      bots: [{ slug: 'ada', state: 'blocked' }],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
    source.emit('two', 4, 'working');
    expect(read).toHaveBeenCalledTimes(3);
    store.setMode('dsh');
    expect(pending[2]?.signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    pending[2]!.resolve({
      generation: 'two',
      revision: 5,
      bots: [{ slug: 'ada', state: 'blocked' }],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    dispose();
  });

  it('uses bounded snapshot recovery when stream construction fails, including stalled queries', async () => {
    vi.useFakeTimers();
    const store = createStore();
    store.setRoster([BOT], []);
    store.setMode('bot');
    const read = vi.fn((signal: AbortSignal) => {
      if (read.mock.calls.length === 1) return new Promise<unknown>(() => {});
      expect(signal.aborted).toBe(false);
      return Promise.resolve({
        generation: 'host',
        revision: 2,
        bots: [{ slug: 'ada', state: 'working' }],
      });
    });
    const make = vi.fn(() => {
      throw new Error('unavailable');
    });
    const dispose = mountActivityLive(store, make, read);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(read.mock.calls[0]?.[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(read).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('working');
    await vi.advanceTimersByTimeAsync(10_000);
    expect(read).toHaveBeenCalledTimes(3);
    dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('closes while hidden and recreates one subscription with a new baseline when visible', async () => {
    vi.useFakeTimers();
    const document = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    vi.stubGlobal('document', document);
    const store = createStore();
    store.setRoster([BOT], []);
    store.setMode('bot');
    const sources: Source[] = [];
    const read = vi.fn(async () => ({
      generation: 'host',
      revision: 1,
      bots: [{ slug: 'ada', state: 'idle' }],
    }));
    const dispose = mountActivityLive(
      store,
      () => {
        const source = new Source();
        sources.push(source);
        return source as unknown as EventSource;
      },
      read,
    );
    await vi.advanceTimersByTimeAsync(0);
    sources[0]!.emit('host', 2, 'working');
    document.visibilityState = 'hidden';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sources[0]?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(read).toHaveBeenCalledTimes(1);
    document.visibilityState = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sources).toHaveLength(2);
    sources[1]!.emit('host', 3, 'idle');
    sources[0]!.emit('host', 99, 'blocked');
    expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
    dispose();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(sources).toHaveLength(2);
    expect(sources[1]?.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
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

it('validates safe attention and clears it on a new Host baseline without rewriting execution', () => {
  const baseline = (attention?: unknown) =>
    JSON.stringify({
      generation: 'host-one',
      revision: 5,
      bots: [{ slug: 'ada', state: 'working', ...(attention === undefined ? {} : { attention }) }],
    });
  const snapshot = parseActivitySnapshot(baseline({ approvalCount: 2, arguments: 'private' }));
  expect(snapshot?.bots[0]?.attention).toEqual({ approvalCount: 2 });
  for (const invalid of [
    null,
    {},
    { approvalCount: -1 },
    { approvalCount: 0 },
    { approvalCount: 1.5 },
    { approvalCount: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    expect(parseActivitySnapshot(baseline(invalid))).toBeUndefined();
  }
  const store = createStore();
  store.setRoster([BOT], []);
  store.applyActivity(snapshot!);
  store.setRoster([BOT], []);
  expect(store.getSnapshot().bots[0]).toMatchObject({
    aggregateState: 'working',
    attention: { approvalCount: 2 },
  });
  store.applyActivity({
    generation: 'host-two',
    revision: 0,
    bots: [{ slug: 'ada', state: 'idle' }],
  });
  expect(store.getSnapshot().bots[0]?.attention).toBeUndefined();
  expect(store.getSnapshot().bots[0]?.aggregateState).toBe('idle');
});

it('accepts only safe question counts in the same baseline and revisioned live event', () => {
  const baseline = (attention: unknown) =>
    JSON.stringify({
      generation: 'host',
      revision: 8,
      bots: [{ slug: 'ada', state: 'working', attention }],
    });
  expect(
    parseActivitySnapshot(baseline({ approvalCount: 0, questionCount: 1, question: 'private' }))
      ?.bots[0]?.attention,
  ).toEqual({ approvalCount: 0, questionCount: 1 });
  for (const questionCount of [-1, 0, 1.5, '1', Number.MAX_SAFE_INTEGER + 1])
    expect(parseActivitySnapshot(baseline({ approvalCount: 0, questionCount }))).toBeUndefined();
  expect(
    parseActivitySnapshot(baseline({ approvalCount: Number.MAX_SAFE_INTEGER, questionCount: 1 })),
  ).toBeUndefined();
});
