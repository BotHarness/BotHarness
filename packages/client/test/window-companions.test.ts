import { expect, it, vi } from 'vitest';
import { WindowCompanions } from '../src/client/window-companions.js';

it('does not let an old Activity acknowledgement cancel a failed removal retry', async () => {
  vi.useFakeTimers();
  const events = new EventTarget();
  const revisions: number[] = [];
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({
      readyState: 1,
      addEventListener: events.addEventListener.bind(events),
      close() {},
    }),
    update: async (value) => {
      revisions.push(value.revision);
      if (revisions.length === 2) throw new Error('Temporary failure');
    },
  });
  const emit = (name: string, revision: number, bots: string[]) =>
    events.dispatchEvent(
      new MessageEvent(name, {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId: 'live',
          selectionRevision: revision,
          bots: bots.map((slug) => ({ slug, name: slug, paused: false })),
          activity: {
            generation: 'host',
            revision,
            bots: bots.map((slug) => ({ slug, state: 'idle' })),
          },
        }),
      }),
    );
  try {
    await owner.start();
    owner.select('ada');
    owner.select('grace');
    await Promise.resolve();
    emit('companion/baseline', 0, []);
    await vi.advanceTimersByTimeAsync(0);
    emit('companion/selection', revisions[0]!, ['ada', 'grace']);
    owner.remove('ada');
    await vi.advanceTimersByTimeAsync(0);
    expect(revisions[1]).toBeGreaterThan(revisions[0]!);
    emit('companion/activity', revisions[0]!, ['ada', 'grace']);
    expect(owner.getSnapshot().sync).toBe('stale');
    await vi.advanceTimersByTimeAsync(250);
    expect(revisions).toHaveLength(3);
    emit('companion/selection', revisions[2]!, ['grace']);
    expect(owner.getSnapshot().sync).toBe('live');
    expect(owner.get('ada')).toBeUndefined();
    expect(owner.get('grace')!.getSnapshot().bot?.slug).toBe('grace');
  } finally {
    owner.dispose();
    vi.useRealTimers();
  }
});

it('retries a temporarily rejected selection without reopening the feed and keeps stale until acknowledgement', async () => {
  vi.useFakeTimers();
  const events = new EventTarget();
  const updates: { consumerId: string; revision: number }[] = [];
  const source = vi.fn(() => ({
    readyState: 1,
    addEventListener: events.addEventListener.bind(events),
    close() {},
  }));
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source,
    update: async (value) => {
      updates.push(value);
      if (updates.length === 1) throw new Error('Temporary failure');
    },
  });
  const emit = (revision: number, bots: string[]) =>
    events.dispatchEvent(
      new MessageEvent('companion/selection', {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId: 'live',
          selectionRevision: revision,
          bots: bots.map((slug) => ({ slug, name: slug, paused: false })),
          activity: {
            generation: 'host',
            revision,
            bots: bots.map((slug) => ({ slug, state: 'idle' })),
          },
        }),
      }),
    );
  try {
    await owner.start();
    owner.select('ada');
    await Promise.resolve();
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId: 'live',
          selectionRevision: 0,
          bots: [],
          activity: { generation: 'host', revision: 0, bots: [] },
        }),
      }),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(owner.getSnapshot().sync).toBe('stale');
    emit(0, []);
    expect(owner.getSnapshot().sync).toBe('stale');
    await vi.advanceTimersByTimeAsync(2000);
    expect(updates).toHaveLength(2);
    emit(updates.at(-1)!.revision, ['ada']);
    expect(owner.getSnapshot().sync).toBe('live');
    expect(owner.get('ada')!.getSnapshot().bot?.slug).toBe('ada');
    expect(source).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
    vi.useRealTimers();
  }
});

it('ignores an old consumer rejection after a new baseline and bounds persistent selection retries', async () => {
  vi.useFakeTimers();
  const events = new EventTarget();
  let rejectOld: (error: Error) => void = () => {};
  const update = vi.fn(async (value: { consumerId: string }) => {
    if (value.consumerId === 'old')
      return new Promise<void>((_resolve, reject) => {
        rejectOld = reject;
      });
    throw new Error('Unavailable');
  });
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({
      readyState: 1,
      addEventListener: events.addEventListener.bind(events),
      close() {},
    }),
    update,
  });
  const baseline = (consumerId: string) =>
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId,
          selectionRevision: 0,
          bots: [],
          activity: { generation: 'host', revision: 0, bots: [] },
        }),
      }),
    );
  try {
    await owner.start();
    owner.select('ada');
    await Promise.resolve();
    baseline('old');
    await vi.advanceTimersByTimeAsync(0);
    baseline('new');
    rejectOld(new Error('Gone'));
    await vi.advanceTimersByTimeAsync(10000);
    expect(update.mock.calls.filter(([value]) => value.consumerId === 'new')).toHaveLength(3);
    expect(owner.getSnapshot().sync).toBe('stale');
    owner.dispose();
    expect(vi.getTimerCount()).toBe(0);
  } finally {
    owner.dispose();
    vi.useRealTimers();
  }
});

it('removes only a confirmed missing Bot after subscription rejection and keeps the remaining shared feed', async () => {
  const events = new EventTarget();
  const source = vi.fn(() => ({
    readyState: 1,
    addEventListener: events.addEventListener.bind(events),
    close() {},
  }));
  const updates: string[][] = [];
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source,
    exists: async (botId) => botId !== 'deleted',
    update: async (value) => {
      const bots = value.selections.map((item) => item.botId);
      updates.push(bots);
      if (bots.includes('deleted')) throw new Error('Unknown PersonaBot');
    },
  });
  try {
    await owner.start();
    owner.select('deleted');
    owner.select('grace');
    await Promise.resolve();
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId: 'native',
          bots: [],
          activity: { generation: 'host', revision: 0, bots: [] },
        }),
      }),
    );
    await vi.waitFor(() => expect(owner.get('deleted')).toBeUndefined());
    expect(owner.get('grace')!.getSnapshot().selection?.botId).toBe('grace');
    expect(updates.at(-1)).toEqual(['grace']);
    expect(source).toHaveBeenCalledOnce();
  } finally {
    owner.dispose();
  }
});

it('keeps independent reading and preferences on one Profile-local connection', async () => {
  const events = new EventTarget();
  const close = vi.fn();
  const storage = new Map<string, string>();
  const selections: {
    consumerId: string;
    selections: { botId: string; dm: boolean }[];
    capacity: number;
  }[] = [];
  const source = vi.fn(() => ({ addEventListener: events.addEventListener.bind(events), close }));
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source,
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
    update: async (value) => {
      selections.push(value);
    },
  });
  const emit = (name: string, value: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(value) }));
  const snapshot = (slugs: string[]) => ({
    profileId: 'qa',
    consumerId: 'native-connection',
    bots: slugs.map((slug) => ({ slug, name: slug, paused: false })),
    activity: {
      generation: 'host',
      revision: 1,
      bots: slugs.map((slug) => ({ slug, state: 'thinking' })),
    },
  });
  const reply = (botId: string, messageId: string) =>
    emit('companion/message', {
      generation: 'host',
      botId,
      messageId,
      channelId: botId,
      channelName: botId,
      body: messageId,
    });
  try {
    await owner.start();
    owner.select('ada');
    await Promise.resolve();
    await Promise.resolve();
    emit('companion/baseline', snapshot([]));
    await Promise.resolve();
    emit('companion/selection', snapshot(['ada']));
    const ada = owner.get('ada')!;
    reply('ada', 'ada-one');
    ada.reading(true);
    owner.select('grace');
    await Promise.resolve();
    await Promise.resolve();
    emit('companion/selection', snapshot(['ada', 'grace']));
    const grace = owner.get('grace')!;
    expect(ada.getSnapshot().cards.map((card) => card.messageId)).toEqual(['ada-one']);
    reply('ada', 'ada-two');
    reply('grace', 'grace-one');
    expect(ada.getSnapshot().pending).toBe(1);
    expect(grace.getSnapshot().cards.map((card) => card.messageId)).toEqual(['grace-one']);
    owner.select('ada');
    expect(owner.getSnapshot().companions).toHaveLength(2);
    expect(source).toHaveBeenCalledOnce();
    owner.configureCapacity({ layers: 8, retention: 2 });
    expect(owner.getSnapshot().capacity).toEqual({ layers: 2, retention: 2 });
    ada.reading(false);
    expect(ada.getSnapshot().cards.map((card) => card.messageId)).toEqual(['ada-one', 'ada-two']);
    ada.configure({ walking: false });
    owner.remove('grace');
    expect(owner.getSnapshot().companions).toHaveLength(1);
    expect(ada.getSnapshot().selection?.walking).toBe(false);
    expect(close).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(selections.at(-1)?.selections.map((item) => item.botId)).toEqual(['ada']);
    owner.remove('ada');
    expect(close).toHaveBeenCalledOnce();
    expect(owner.getSnapshot().companions).toHaveLength(0);
  } finally {
    owner.dispose();
  }
});

it('closes an empty selection before its asynchronous child startup can subscribe', async () => {
  const source = vi.fn(() => ({ addEventListener() {}, close() {} }));
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source,
    update: async () => {},
  });
  await owner.start();
  owner.select('ada');
  owner.remove('ada');
  await Promise.resolve();
  expect(source).not.toHaveBeenCalled();
  expect(owner.getSnapshot().companions).toHaveLength(0);
  owner.dispose();
});

it('releases a failed connection before another Bot is selected', async () => {
  const events = new EventTarget();
  const source = vi
    .fn(() => ({ addEventListener: events.addEventListener.bind(events), close() {} }))
    .mockImplementationOnce(() => {
      throw new Error('Network unavailable');
    });
  const updates: string[][] = [];
  const owner = new WindowCompanions({
    context: async () => ({ profileId: 'qa' }),
    source,
    update: async (value) => {
      updates.push(value.selections.map((selected) => selected.botId));
    },
  });
  await owner.start();
  owner.select('ada');
  await Promise.resolve();
  expect(owner.getSnapshot().sync).toBe('stale');
  owner.remove('ada');
  owner.select('grace');
  await Promise.resolve();
  events.dispatchEvent(
    new MessageEvent('companion/baseline', {
      data: JSON.stringify({
        profileId: 'qa',
        consumerId: 'next',
        bots: [],
        activity: { generation: 'host', revision: 0, bots: [] },
      }),
    }),
  );
  await Promise.resolve();
  expect(updates.at(-1)).toEqual(['grace']);
  owner.dispose();
});

it('restores only Profile preferences and rejects superseded selection baselines', async () => {
  const storage = new Map<string, string>([
    [
      'botharness/companions/v1/qa',
      JSON.stringify({ botId: 'ada', walking: false, position: 0.3 }),
    ],
  ]);
  const events = new EventTarget();
  const close = vi.fn();
  const deps = {
    context: async () => ({ profileId: 'qa' }),
    storage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    },
    source: () => ({ addEventListener: events.addEventListener.bind(events), close }),
    update: async () => {},
  };
  const owner = new WindowCompanions(deps);
  await owner.start();
  await Promise.resolve();
  owner.select('grace');
  await Promise.resolve();
  owner.configureCapacity({ layers: 5, retention: 7 });
  owner.get('grace')!.configure({ activity: false, visibility: 'all-bot', group: true });
  const emit = (name: string, generation: string, revision: number, bots: string[]) =>
    events.dispatchEvent(
      new MessageEvent(name, {
        data: JSON.stringify({
          profileId: 'qa',
          consumerId: generation,
          selectionRevision: revision,
          bots: bots.map((slug) => ({ slug, name: slug, paused: false })),
          activity: {
            generation,
            revision: 0,
            bots: bots.map((slug) => ({ slug, state: 'idle' })),
          },
        }),
      }),
    );
  emit('companion/baseline', 'host', 0, []);
  emit('companion/selection', 'host', 1, ['ada', 'grace']);
  expect(owner.get('grace')!.getSnapshot().bot).toBeUndefined();
  emit('companion/selection', 'host', 4, ['ada', 'grace']);
  expect(owner.get('grace')!.getSnapshot().bot).toBeUndefined();
  emit('companion/selection', 'host', 5, ['ada', 'grace']);
  expect(owner.get('grace')!.getSnapshot().bot?.slug).toBe('grace');
  events.dispatchEvent(
    new MessageEvent('companion/message', {
      data: JSON.stringify({
        generation: 'host',
        botId: 'ada',
        messageId: 'old',
        channelId: 'dm',
        channelName: 'dm',
        body: 'old',
      }),
    }),
  );
  expect(owner.get('ada')!.getSnapshot().cards).toHaveLength(1);
  owner.dispose();
  expect(close).toHaveBeenCalledOnce();
  const restored = new WindowCompanions(deps);
  await restored.start();
  expect(restored.getSnapshot().companions).toHaveLength(2);
  expect(restored.getSnapshot().capacity).toEqual({ layers: 5, retention: 7 });
  expect(restored.get('ada')!.getSnapshot().selection).toMatchObject({
    walking: false,
    position: 0.3,
  });
  expect(restored.get('grace')!.getSnapshot().selection).toMatchObject({
    activity: false,
    group: true,
    visibility: 'all-bot',
  });
  expect(
    restored.getSnapshot().companions.every((child) => child.getSnapshot().cards.length === 0),
  ).toBe(true);
  restored.dispose();
});
