import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createBridgeRpcHandler } from '../src/bridge/rpc.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

const roots: string[] = [];

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const registry = createPersonaBotRegistry({ rootDir: root });
  const states = createBotStateTracker();
  const channels = createChannelStore({ rootDir: join(root, 'channels'), now: tickingNow() });
  return {
    root,
    registry,
    states,
    channels,
    methods: createBridgeMethods({ registry, states, channels }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('lists PersonaBots with their aggregate state', () => {
    const { registry, states, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      tag: '研究',
      description: '数学与计算',
      workspaces: ['/tmp/ada'],
    });
    states.setSessionState('ada', 'session-1', 'working');

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            slug: 'ada',
            displayName: 'Ada',
            tag: '研究',
            description: '数学与计算',
            aggregateState: 'working',
            workspaces: ['/tmp/ada'],
            createdAt: expect.any(String),
          },
        ],
      },
    });
  });

  it('omits tag and description when the record has none', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'plain', displayName: 'Plain' });

    const result = methods.list({});

    expect(result).toEqual({
      ok: true,
      value: {
        bots: [
          {
            slug: 'plain',
            displayName: 'Plain',
            aggregateState: 'idle',
            workspaces: [],
            createdAt: expect.any(String),
          },
        ],
      },
    });
  });

  it('carries tag and description into the detail read model', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada', tag: '研究', description: '数学与计算' });

    const result = methods.get({ slug: 'ada' });

    expect(result.ok && result.value.bot).toMatchObject({
      tag: '研究',
      description: '数学与计算',
    });
  });

  it('filters by slug or display name', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada Lovelace' });
    registry.create({ slug: 'bob', displayName: 'Bob' });

    const byName = methods.list({ query: 'love' });
    const bySlug = methods.list({ query: 'BOB' });

    expect(byName.ok && byName.value.bots.map((bot) => bot.slug)).toEqual(['ada']);
    expect(bySlug.ok && bySlug.value.bots.map((bot) => bot.slug)).toEqual(['bob']);
  });

  it('returns a structured not-found failure for unknown slugs', () => {
    const { methods } = setup();

    expect(methods.get({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });

  it('creates a bot with persona, profile fields and avatar seed', () => {
    const { root, methods } = setup();

    const result = methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nBe kind.\n',
      tag: '研究',
      description: '数学与计算',
      model: 'deepseek-chat',
      preset: 'standard',
      workspaces: ['/srv/ada'],
      avatarSeed: 'blue',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          slug: 'ada',
          displayName: 'Ada',
          tag: '研究',
          description: '数学与计算',
          avatar: 'blue',
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(
      JSON.parse(readFileSync(join(root, 'ada', 'bot.json'), 'utf8')) as Record<string, unknown>,
    ).toMatchObject({
      slug: 'ada',
      avatar: 'blue',
      tag: '研究',
      description: '数学与计算',
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Ada\n\nBe kind.\n',
    );
  });

  it('writes a placeholder PERSONA.md when create has no persona', () => {
    const { root, methods } = setup();

    expect(methods.create({ slug: 'plain', displayName: 'Plain' }).ok).toBe(true);
    expect(readFileSync(join(root, 'plain', 'memory', 'PERSONA.md'), 'utf8')).toBe('# Plain\n');
  });

  it('reports create failures with stable error codes', () => {
    const { methods } = setup();

    expect(methods.create({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.create({ slug: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ slug: 'Ada', displayName: 'Ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-slug', message: 'invalid slug: Ada' },
    });
    expect(methods.create({ slug: 'ada', displayName: 42 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ slug: 'ada', displayName: 'Ada', tag: 7 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });
    expect(methods.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    expect(methods.create({ slug: 'ada', displayName: 'Ada again' })).toEqual({
      ok: false,
      error: { code: 'duplicate', message: 'PersonaBot already exists: ada' },
    });
  });

  it('updates editable fields and leaves persona untouched', () => {
    const { root, methods } = setup();
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nOriginal.\n',
      tag: 'old',
    });

    const result = methods.update({
      slug: 'ada',
      patch: {
        displayName: 'Ada Lovelace',
        tag: '   ',
        description: '数学与计算',
        model: 'deepseek-chat',
        preset: 'standard',
        workspaces: ['/srv/ada'],
        avatarSeed: 'green',
        persona: '# Evil\n',
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        bot: {
          slug: 'ada',
          displayName: 'Ada Lovelace',
          description: '数学与计算',
          avatar: 'green',
          aggregateState: 'idle',
          workspaces: ['/srv/ada'],
          createdAt: expect.any(String),
          model: 'deepseek-chat',
          preset: 'standard',
          sessions: {},
        },
      },
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Ada\n\nOriginal.\n',
    );
  });

  it('rejects unknown or malformed updates', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.update({ slug: 'missing', patch: { tag: 'x' } })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.update({ slug: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'patch is required' },
    });
    expect(methods.update({ slug: 'ada', patch: { displayName: '   ' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: { workspaces: 'nope' } })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid update payload' },
    });
    expect(methods.update({ slug: 'ada', patch: {} })).toMatchObject({
      ok: true,
      value: { bot: { slug: 'ada', displayName: 'Ada' } },
    });
  });

  it('pauses and resumes a bot, exposing paused in the read model', () => {
    const { registry, methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    const paused = methods.pause({ slug: 'ada' });
    expect(paused.ok && paused.value.bot.paused).toBe(true);
    expect(registry.get('ada')?.paused).toBe(true);
    const listed = methods.list({});
    expect(listed.ok && listed.value.bots[0]?.paused).toBe(true);

    const resumed = methods.resume({ slug: 'ada' });
    expect(resumed.ok && 'paused' in resumed.value.bot).toBe(false);
    expect(registry.get('ada')?.paused).toBeUndefined();

    expect(methods.pause({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
    expect(methods.resume({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
  });

  it('lists, opens, and creates local channels', () => {
    const { methods } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channels({})).toEqual({ ok: true, value: { channels: [] } });

    const dm = methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    expect(dm.ok && dm.value.channel).toMatchObject({
      id: 'dm-ada',
      type: 'dm',
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
    });
    const again = methods.channelDm({ slug: 'ada' });
    expect(again.ok && again.value.channel.id).toBe('dm-ada');
    expect(again.ok && again.value.channel.name).toBe('Ada');

    const group = methods.channelCreate({ name: 'Design Team', members: ['ada', 'bob'] });
    expect(group.ok && group.value.channel).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      name: 'Design Team',
      members: ['ada', 'bob'],
    });
    const listed = methods.channels({});
    expect(listed.ok && listed.value.channels.map((channel) => channel.id)).toEqual([
      'group-design-team',
      'dm-ada',
    ]);
  });

  it('rejects malformed channel payloads with stable error codes', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channelDm({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.channelDm({ slug: 'Ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid slug: Ada' },
    });
    expect(methods.channelCreate({ members: [] })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelCreate({ name: 'Team', members: 'ada' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'members must be an array of bot slugs' },
    });
    expect(methods.channelMessages({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelMessages({ channelId: 'dm-missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-missing' },
    });
    expect(methods.channelMessages({ channelId: 'dm-ada', limit: 0 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'limit must be a positive integer' },
    });
    expect(await methods.channelSend({ channelId: 'dm-ada', body: '   ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'body is required' },
    });
    expect(await methods.channelSend({ channelId: 'dm-nope', body: 'hi' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: dm-nope' },
    });
  });

  it('records human messages locally and pages them newest-first', async () => {
    const { methods } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });
    expect(first).toEqual({
      ok: true,
      value: {
        message: {
          id: expect.any(String),
          at: expect.any(String),
          author: { kind: 'human' },
          body: 'hello',
        },
      },
    });
    const second = await methods.channelSend({ channelId: 'dm-ada', body: 'again' });
    expect(second.ok).toBe(true);
    const third = await methods.channelSend({ channelId: 'dm-ada', body: 'third' });
    expect(third.ok).toBe(true);

    const page = methods.channelMessages({ channelId: 'dm-ada' });
    expect(page.ok && page.value.messages.map((message) => message.body)).toEqual([
      'third',
      'again',
      'hello',
    ]);

    const oldest = await methods.channelSend({ channelId: 'dm-ada', body: 'oldest' });
    expect(oldest.ok).toBe(true);
    const cursor = third.ok ? third.value.message.id : '';
    const older = methods.channelMessages({ channelId: 'dm-ada', before: cursor, limit: 2 });
    expect(older.ok && older.value.messages.map((message) => message.body)).toEqual([
      'again',
      'hello',
    ]);
  });

  it('maps endpoints and rejects unknown ones through the RPC handler', async () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'ada', displayName: 'Ada' });
    const handler = createBridgeRpcHandler(methods);
    const signal = new AbortController().signal;

    const listed = await handler('botharness/list', {}, signal);
    const created = await handler('botharness/create', { slug: 'bob', displayName: 'Bob' }, signal);
    const updated = await handler(
      'botharness/update',
      { slug: 'bob', patch: { tag: 'x' } },
      signal,
    );
    const paused = await handler('botharness/pause', { slug: 'bob' }, signal);
    const resumed = await handler('botharness/resume', { slug: 'bob' }, signal);
    const channels = await handler('botharness/channels', {}, signal);
    const dm = await handler('botharness/channelDm', { slug: 'bob', displayName: 'Bob' }, signal);
    const group = await handler(
      'botharness/channelCreate',
      { name: 'Team', members: ['bob'] },
      signal,
    );
    const sent = await handler(
      'botharness/channelSend',
      { channelId: 'dm-bob', body: 'hi' },
      signal,
    );
    const messages = await handler('botharness/channelMessages', { channelId: 'dm-bob' }, signal);
    const unknown = await handler('botharness/nope', {}, signal);

    expect(listed.ok && Array.isArray((listed.value as { bots: unknown[] }).bots)).toBe(true);
    expect(created.ok && (created.value as { bot: { slug: string } }).bot.slug).toBe('bob');
    expect(updated.ok && (updated.value as { bot: { tag?: string } }).bot.tag).toBe('x');
    expect(paused.ok && (paused.value as { bot: { paused?: boolean } }).bot.paused).toBe(true);
    expect(
      resumed.ok && (resumed.value as { bot: { paused?: boolean } }).bot.paused,
    ).toBeUndefined();
    expect(channels.ok && Array.isArray((channels.value as { channels: unknown[] }).channels)).toBe(
      true,
    );
    expect(dm.ok && (dm.value as { channel: { id: string } }).channel.id).toBe('dm-bob');
    expect(group.ok && (group.value as { channel: { id: string } }).channel.id).toBe('group-team');
    expect(sent.ok && (sent.value as { message: { body: string } }).message.body).toBe('hi');
    expect(
      messages.ok && (messages.value as { messages: { body: string }[] }).messages[0]?.body,
    ).toBe('hi');
    expect(unknown).toEqual({
      ok: false,
      error: {
        code: 'not-found',
        message: 'unknown bridge endpoint: botharness/nope',
        details: {},
      },
    });
  });
});
