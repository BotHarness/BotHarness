import { afterEach, expect, it, vi } from 'vitest';
import { WindowCompanion } from '../src/client/window-companion.js';

const controllers: WindowCompanion[] = [];
afterEach(() => {
  for (const owner of controllers.splice(0)) owner.dispose();
});

it('deduplicates by canonical Channel and message identity and dismisses only the selected source', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  owner.configure({ group: true });
  const send = (name: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host', revision: 0, bots: [] },
  });
  const message = (channelId: string) =>
    send('companion/message', {
      botId: 'ada',
      generation: 'host',
      channelId,
      channelName: channelId,
      messageId: 'same-id',
      body: channelId,
      source: 'shared-group',
    });
  message('one');
  message('two');
  message('one');
  expect(owner.getSnapshot().cards.map((card) => card.channelId)).toEqual(['one', 'two']);
  owner.dismiss('same-id', 'one');
  expect(owner.getSnapshot().cards.map((card) => card.channelId)).toEqual(['two']);
});

it('preserves eligible shown and queued cards while changing sources, but resets on a new Host', async () => {
  const streams: EventTarget[] = [];
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => {
      const target = new EventTarget();
      streams.push(target);
      return { addEventListener: target.addEventListener.bind(target), close() {} };
    },
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const send = (type: string, data: unknown) =>
    streams.at(-1)!.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  const baseline = (generation = 'host-a') =>
    send('companion/baseline', {
      profileId: 'qa',
      bot: { slug: 'ada', name: 'Ada', paused: false },
      activity: { generation, revision: 0, bots: [{ slug: 'ada', state: 'working' }] },
    });
  const message = (messageId: string, source: string) =>
    send('companion/message', {
      generation: 'host-a',
      botId: 'ada',
      messageId,
      source,
      channelId: messageId,
      channelName: messageId,
      body: 'still reading this message',
    });
  baseline();
  owner.configure({ group: true, visibility: 'all-bot' });
  baseline();
  message('dm', 'own-dm');
  message('group', 'shared-group');
  message('bot-dm', 'bot-dm');
  owner.advance(100);
  const dm = owner.getSnapshot().cards[0];
  const botDm = owner.getSnapshot().cards[2];
  owner.reading(true);
  message('queued-dm', 'own-dm');
  message('queued-group', 'shared-group');
  message('queued-bot-dm', 'bot-dm');
  owner.configure({ group: false });
  expect(owner.getSnapshot()).toMatchObject({ cards: [dm, botDm], pending: 2, reading: true });
  baseline();
  expect(owner.getSnapshot()).toMatchObject({ cards: [dm, botDm], pending: 2 });
  owner.configure({ visibility: 'own-dm' });
  baseline();
  owner.reading(false);
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['dm', 'queued-dm']);
  message('dm', 'own-dm');
  expect(owner.getSnapshot().cards).toHaveLength(2);
  owner.configure({ group: true, visibility: 'all-bot' });
  baseline('host-b');
  expect(owner.getSnapshot()).toMatchObject({ cards: [], pending: 0 });
});

it('checks a closed stream against a fresh Registry result and preserves pins on lookup failure or replacement', async () => {
  const streams: EventTarget[] = [];
  let result = async (): Promise<boolean> => {
    throw new Error('Registry unavailable');
  };
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    exists: () => result(),
    source: () => {
      const events = new EventTarget();
      streams.push(events);
      return {
        readyState: 2,
        addEventListener: events.addEventListener.bind(events),
        close() {},
      };
    },
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  streams[0]!.dispatchEvent(new Event('error'));
  await Promise.resolve();
  await Promise.resolve();
  expect(owner.getSnapshot().selection?.botId).toBe('ada');
  expect(owner.getSnapshot().sync).toBe('stale');
  let resolve: ((exists: boolean) => void) | undefined;
  result = () =>
    new Promise((done) => {
      resolve = done;
    });
  streams[0]!.dispatchEvent(new Event('error'));
  owner.select('grace');
  resolve!(false);
  await Promise.resolve();
  expect(owner.getSnapshot().selection?.botId).toBe('grace');
  result = async () => false;
  streams[1]!.dispatchEvent(new Event('error'));
  await Promise.resolve();
  expect(owner.getSnapshot().selection).toBeUndefined();
});

it('restores selection per Profile without old cards, consumes outside Bot mode, and closes when removed', async () => {
  const saved = new Map<string, string>();
  const streams: { target: EventTarget; close: ReturnType<typeof vi.fn> }[] = [];
  const create = (profileId = 'profile-a') => {
    const owner = new WindowCompanion({
      storage: {
        getItem: (key) => saved.get(key) ?? null,
        setItem: (key, value) => {
          saved.set(key, value);
        },
      },
      context: async () => ({ profileId }),
      source: () => {
        const stream = { target: new EventTarget(), close: vi.fn() };
        streams.push(stream);
        return {
          addEventListener: stream.target.addEventListener.bind(stream.target),
          close: stream.close,
        };
      },
    });
    controllers.push(owner);
    return owner;
  };
  const send = (type: string, data: unknown) =>
    streams.at(-1)!.target.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  const baseline = {
    profileId: 'profile-a',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host-a', revision: 0, bots: [{ slug: 'ada', state: 'working' }] },
  };
  const owner = create();
  await owner.start();
  owner.select('ada');
  send('companion/baseline', baseline);
  expect(owner.getSnapshot().sync).toBe('live');
  send('companion/message', {
    generation: 'host-a',
    botId: 'ada',
    messageId: 'one',
    channelId: 'dm',
    channelName: 'Ada',
    body: 'hello',
  });
  expect(owner.getSnapshot().cards).toHaveLength(1);
  owner.dispose();
  expect(streams[0]!.close).toHaveBeenCalledOnce();
  const restored = create();
  await restored.start();
  expect(restored.getSnapshot().selection?.botId).toBe('ada');
  expect(restored.getSnapshot().cards).toHaveLength(0);
  send('companion/baseline', baseline);
  restored.remove();
  expect(streams[1]!.close).toHaveBeenCalledOnce();
  const otherProfile = create('profile-b');
  await otherProfile.start();
  expect(otherProfile.getSnapshot().selection).toBeUndefined();
});

it('bounds parallel cards at twenty, freezes reading order, continues typing and merges arrivals on leave', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'profile-a' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const send = (type: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(data) }));
  send('companion/baseline', {
    profileId: 'profile-a',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host-a', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
  });
  const reply = (id: number) =>
    send('companion/message', {
      generation: 'host-a',
      botId: 'ada',
      messageId: `m${id}`,
      channelId: 'dm',
      channelName: 'Ada',
      body: 'Hello from Ada',
    });
  reply(1);
  reply(2);
  owner.reading(true);
  reply(3);
  owner.advance(500);
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['m1', 'm2']);
  expect(owner.getSnapshot().cards.every((card) => card.shown > 0)).toBe(true);
  expect(owner.getSnapshot().pending).toBe(1);
  owner.reading(false);
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['m1', 'm2', 'm3']);
  for (let id = 4; id <= 50; id++) reply(id);
  expect(owner.getSnapshot().cards).toHaveLength(20);
  expect(owner.getSnapshot().cards[0]!.messageId).toBe('m31');
  owner.reading(true);
  for (let id = 51; id <= 80; id++) reply(id);
  expect(owner.getSnapshot().cards[0]!.messageId).toBe('m31');
  expect(owner.getSnapshot().pending).toBe(20);
  owner.reading(false);
  expect(owner.getSnapshot().cards[0]!.messageId).toBe('m61');
  owner.advance(10000);
  owner.reading(true);
  owner.advance(30000);
  expect(owner.getSnapshot().cards).toHaveLength(20);
  owner.reading(false);
  owner.advance(30000);
  expect(owner.getSnapshot().cards).toHaveLength(0);
});

it('shows fresh arrivals when focused reading has no cards and releases waiting arrivals after the last dismissal', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const send = (type: string, value: unknown) =>
    events.dispatchEvent(new MessageEvent(type, { data: JSON.stringify(value) }));
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'host', revision: 0, bots: [] },
  });
  const reply = (messageId: string) =>
    send('companion/message', {
      generation: 'host',
      botId: 'ada',
      messageId,
      channelId: 'dm',
      channelName: 'Ada',
      body: 'A new reply',
    });
  reply('first');
  owner.reading(true);
  owner.dismiss('first', 'dm');
  expect(owner.getSnapshot()).toMatchObject({ reading: true, cards: [], pending: 0 });
  reply('second');
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['second']);
  expect(owner.getSnapshot().pending).toBe(0);
  reply('third');
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['second']);
  expect(owner.getSnapshot().pending).toBe(1);
  owner.dismiss('second', 'dm');
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['third']);
  expect(owner.getSnapshot()).toMatchObject({ reading: true, pending: 0 });
});

it('reveals whole emoji and combining graphemes and clips previews on a complete boundary', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const send = (name: string, data: unknown) =>
    events.dispatchEvent(new MessageEvent(name, { data: JSON.stringify(data) }));
  send('companion/baseline', {
    profileId: 'qa',
    bot: { slug: 'ada', name: 'Ada', paused: false },
    activity: { generation: 'h', revision: 0, bots: [{ slug: 'ada', state: 'idle' }] },
  });
  const message = (messageId: string, body: string) =>
    send('companion/message', {
      generation: 'h',
      botId: 'ada',
      messageId,
      channelId: 'dm',
      channelName: 'Ada',
      body,
    });
  message('emoji', '👩‍💻é🇨🇳');
  owner.advance(35);
  let card = owner.getSnapshot().cards[0]!;
  expect(card.body.slice(0, card.shown)).toBe('👩‍💻');
  owner.advance(35);
  card = owner.getSnapshot().cards[0]!;
  expect(card.body.slice(0, card.shown)).toBe('👩‍💻é');
  message('preview', 'a'.repeat(1999) + '👩‍💻');
  expect(owner.getSnapshot().cards[1]!.body).toBe('a'.repeat(1999));
});

it('clears playback and reading on archive and refuses queued archived speech', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({ addEventListener: events.addEventListener.bind(events), close() {} }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const snapshot = (paused: boolean, name = 'companion/activity') =>
    events.dispatchEvent(
      new MessageEvent(name, {
        data: JSON.stringify({
          profileId: 'qa',
          bot: { slug: 'ada', name: 'Ada', paused },
          activity: { generation: 'host', revision: 1, bots: [{ slug: 'ada', state: 'working' }] },
        }),
      }),
    );
  const message = (messageId: string) =>
    events.dispatchEvent(
      new MessageEvent('companion/message', {
        data: JSON.stringify({
          generation: 'host',
          botId: 'ada',
          channelId: 'dm',
          channelName: 'Ada',
          messageId,
          body: messageId,
        }),
      }),
    );
  snapshot(false, 'companion/baseline');
  message('visible');
  owner.reading(true);
  message('pending');
  snapshot(true);
  message('late-archived');
  expect(owner.getSnapshot()).toMatchObject({
    cards: [],
    pending: 0,
    reading: false,
    bot: { paused: true },
  });
  snapshot(false);
  message('new');
  expect(owner.getSnapshot().cards.map((card) => card.messageId)).toEqual(['new']);
});

it('resets playback after a coalesced archive-reactivation transition without closing focused controls repeatedly', async () => {
  const events = new EventTarget();
  const owner = new WindowCompanion({
    context: async () => ({ profileId: 'qa' }),
    source: () => ({
      addEventListener: events.addEventListener.bind(events),
      close() {},
    }),
  });
  controllers.push(owner);
  await owner.start();
  owner.select('ada');
  const snapshot = (lifecycle: string, paused = false) =>
    events.dispatchEvent(
      new MessageEvent('companion/baseline', {
        data: JSON.stringify({
          profileId: 'qa',
          recovered: true,
          bot: { slug: 'ada', name: 'Ada', paused, lifecycle },
          activity: { generation: 'host', revision: 1, bots: [] },
        }),
      }),
    );
  snapshot('active-a');
  events.dispatchEvent(
    new MessageEvent('companion/message', {
      data: JSON.stringify({
        generation: 'host',
        botId: 'ada',
        channelId: 'dm',
        channelName: 'Ada',
        messageId: 'old',
        body: 'old',
      }),
    }),
  );
  owner.reading(true);
  snapshot('active-b');
  expect(owner.getSnapshot()).toMatchObject({ cards: [], pending: 0, reading: false });
  snapshot('archived', true);
  owner.reading(true);
  snapshot('archived', true);
  expect(owner.getSnapshot().reading).toBe(true);
});
