import {
  appendFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { ChannelMessage } from '../src/channels/channel.js';
import { createChannelStore } from '../src/channels/store.js';

const roots: string[] = [];
let sequence = 0;

function createRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'botharness-channels-'));
  roots.push(root);
  return root;
}

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function message(body: string): ChannelMessage {
  sequence += 1;
  return {
    id: `msg-${sequence}`,
    at: new Date(Date.parse('2026-09-19T00:00:00.000Z') + sequence * 1000).toISOString(),
    author: { kind: 'human' },
    body,
  };
}

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

beforeEach(() => {
  sequence = 0;
});

describe('channel store', () => {
  it('creates a DM channel idempotently', () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });

    const first = store.getOrCreateDm('ada', 'Ada');
    const second = store.getOrCreateDm('ada', 'Ada Lovelace');

    expect(first).toMatchObject({
      id: 'dm-ada',
      type: 'dm',
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
    });
    expect(second?.id).toBe('dm-ada');
    expect(second?.name).toBe('Ada');
    expect(second?.createdAt).toBe(first?.createdAt);
    expect(
      JSON.parse(readFileSync(join(root, 'dm-ada', 'channel.json'), 'utf8')) as Record<
        string,
        unknown
      >,
    ).toMatchObject({ id: 'dm-ada', type: 'dm', name: 'Ada', members: ['ada'] });
  });

  it('renames group and DM channels without changing their stable ids or timestamps', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    const dm = store.getOrCreateDm('ada', 'Ada');
    const group = store.createGroup({ name: 'Team', members: [] });

    expect(store.rename(dm?.id ?? '', '  Ada Lovelace  ')).toMatchObject({
      id: 'dm-ada',
      name: 'Ada Lovelace',
      createdAt: dm?.createdAt,
      updatedAt: dm?.updatedAt,
    });
    expect(store.rename(group.id, '  Research  ')?.name).toBe('Research');
    expect(store.rename(group.id, '   ')).toBeUndefined();
    expect(store.rename('missing', 'Name')).toBeUndefined();
  });

  it('falls back to the slug when the DM name is blank and rejects hostile slugs', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });

    expect(store.getOrCreateDm('ada', '   ')?.name).toBe('ada');
    expect(store.getOrCreateDm('Ada', 'Ada')).toBeUndefined();
    expect(store.getOrCreateDm('../evil', 'Evil')).toBeUndefined();
    expect(store.get('..')).toBeUndefined();
    expect(store.readMessages('..')).toEqual([]);
  });

  it('slugifies group names and suffixes collisions', () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });

    const design = store.createGroup({ name: 'Design Team', members: ['ada', 'bob'] });
    const designAgain = store.createGroup({ name: 'design   team', members: [] });
    const designThird = store.createGroup({ name: 'DESIGN-TEAM!', members: [] });
    const room = store.createGroup({ name: '设计', members: [] });
    const roomAgain = store.createGroup({ name: '!!!', members: [] });

    expect(design).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      members: ['ada', 'bob'],
    });
    expect(designAgain.id).toBe('group-design-team-2');
    expect(designThird.id).toBe('group-design-team-3');
    expect(room.id).toBe('group-room');
    expect(roomAgain.id).toBe('group-room-2');
  });

  it('lists channels newest-updated first and moves one to the front on append', async () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    store.getOrCreateDm('ada', 'Ada');
    store.createGroup({ name: 'Team', members: [] });

    expect(store.list().map((channel) => channel.id)).toEqual(['group-team', 'dm-ada']);

    await store.appendMessage('dm-ada', message('hello'));

    expect(store.list().map((channel) => channel.id)).toEqual(['dm-ada', 'group-team']);
    expect(store.get('dm-ada')?.updatedAt).toBe('2026-09-19T00:00:03.000Z');
  });

  it('appends messages and pages them newest-first', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    store.getOrCreateDm('ada', 'Ada');
    for (const body of ['m1', 'm2', 'm3', 'm4', 'm5']) {
      await store.appendMessage('dm-ada', message(body));
    }

    expect(store.readMessages('dm-ada').map((entry) => entry.body)).toEqual([
      'm5',
      'm4',
      'm3',
      'm2',
      'm1',
    ]);
    expect(store.readMessages('dm-ada', { limit: 2 }).map((entry) => entry.body)).toEqual([
      'm5',
      'm4',
    ]);
    expect(
      store.readMessages('dm-ada', { before: 'msg-4', limit: 2 }).map((entry) => entry.body),
    ).toEqual(['m3', 'm2']);
    expect(store.readMessages('dm-ada', { limit: 999 })).toHaveLength(5);
    expect(store.readMessages('dm-ada', { before: 'missing' })).toEqual([]);

    const lines = readFileSync(join(root, 'dm-ada', 'messages.ndjson'), 'utf8')
      .trim()
      .split('\n');
    expect(lines).toHaveLength(5);
    expect(JSON.parse(lines[4] ?? '{}')).toMatchObject({
      id: 'msg-5',
      body: 'm5',
      author: { kind: 'human' },
    });
    expect(store.latestMessage('dm-ada')?.body).toBe('m5');
    expect(store.latestMessage('missing')).toBeUndefined();
  });

  it('serializes concurrent appends to the same channel', async () => {
    const store = createChannelStore({ rootDir: createRoot(), now: tickingNow() });
    store.getOrCreateDm('ada', 'Ada');

    await Promise.all(
      Array.from({ length: 20 }, (_, index) => store.appendMessage('dm-ada', message(`m${index}`))),
    );

    const entries = store.readMessages('dm-ada');
    expect(entries).toHaveLength(20);
    expect(new Set(entries.map((entry) => entry.id)).size).toBe(20);
  });

  it('skips corrupt lines when reading', async () => {
    const root = createRoot();
    const store = createChannelStore({ rootDir: root, now: tickingNow() });
    store.getOrCreateDm('ada', 'Ada');
    await store.appendMessage('dm-ada', message('good'));
    appendFileSync(
      join(root, 'dm-ada', 'messages.ndjson'),
      'not json\n{"id":"broken"}\n\n',
      'utf8',
    );
    await store.appendMessage('dm-ada', message('good again'));
    appendFileSync(join(root, 'dm-ada', 'messages.ndjson'), 'not json\n', 'utf8');

    expect(store.readMessages('dm-ada').map((entry) => entry.body)).toEqual(['good again', 'good']);
    expect(store.latestMessage('dm-ada')?.body).toBe('good again');
  });

  it('tolerates a missing directory and unknown channels', async () => {
    const store = createChannelStore({
      rootDir: join(createRoot(), 'channels'),
      now: tickingNow(),
    });

    expect(store.list()).toEqual([]);
    expect(store.get('dm-ada')).toBeUndefined();
    expect(store.readMessages('dm-ada')).toEqual([]);
    expect(await store.appendMessage('dm-ada', message('nowhere'))).toBeUndefined();
  });

  it('skips directories whose channel.json is corrupt or mismatched', () => {
    const root = createRoot();
    mkdirSync(join(root, 'stale'), { recursive: true });
    writeFileSync(join(root, 'stale', 'channel.json'), '{"id":"other"}', 'utf8');
    mkdirSync(join(root, 'notes'), { recursive: true });
    writeFileSync(join(root, 'notes', 'channel.json'), 'not json\n', 'utf8');
    writeFileSync(join(root, 'loose.txt'), 'not a directory\n', 'utf8');
    const store = createChannelStore({ rootDir: root, now: tickingNow() });

    expect(store.list()).toEqual([]);
  });
});
