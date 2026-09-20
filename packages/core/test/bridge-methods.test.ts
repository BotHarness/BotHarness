import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore } from '../src/channels/store.js';
import { createRosterStore } from '../src/roster/store.js';
import type { BotSessionSource, SessionSummary } from '../src/sessions/source.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

const roots: string[] = [];

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function setup(sessionSummaries: SessionSummary[] = [], botIds: string[] = ['ada']) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const registry = createPersonaBotRegistry({ rootDir: root });
  const states = createBotStateTracker();
  const channels = createChannelStore({ rootDir: join(root, 'channels'), now: tickingNow() });
  const sessions: BotSessionSource = { list: () => sessionSummaries };
  let botIdIndex = 0;
  return {
    root,
    registry,
    states,
    channels,
    methods: createBridgeMethods({
      registry,
      states,
      channels,
      sessions,
      roster: createRosterStore(),
      createBotId: () => botIds[botIdIndex++] ?? 'bot-test-' + botIdIndex,
    }),
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
      roles: ['研究'],
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
            roles: ['研究'],
            description: '数学与计算',
            aggregateState: 'working',
            workspaces: ['/tmp/ada'],
            createdAt: expect.any(String),
          },
        ],
      },
    });
  });

  it('returns empty roles and omits description when the record has none', () => {
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
            roles: [],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: expect.any(String),
          },
        ],
      },
    });
  });

  it('carries role badges and description into the detail read model', () => {
    const { registry, methods } = setup();
    registry.create({
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究'],
      description: '数学与计算',
    });

    const result = methods.get({ slug: 'ada' });

    expect(result.ok && result.value.bot).toMatchObject({
      roles: ['研究'],
      description: '数学与计算',
    });
  });

  it('filters by display name or role badge, never by internal ID', () => {
    const { registry, methods } = setup();
    registry.create({ slug: 'hidden-ada', displayName: 'Ada Lovelace', roles: ['研究员'] });
    registry.create({ slug: 'hidden-bob', displayName: 'Bob' });

    const byName = methods.list({ query: 'love' });
    const byRole = methods.list({ query: '研究' });
    const byInternalId = methods.list({ query: 'hidden-bob' });

    expect(byName.ok && byName.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byRole.ok && byRole.value.bots.map((bot) => bot.slug)).toEqual(['hidden-ada']);
    expect(byInternalId.ok && byInternalId.value.bots).toEqual([]);
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
      roles: ['研究'],
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
          roles: ['研究'],
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
      roles: ['研究'],
      description: '数学与计算',
    });
    expect(readFileSync(join(root, 'ada', 'memory', 'PERSONA.md'), 'utf8')).toBe(
      '# Ada\n\nBe kind.\n',
    );
  });

  it('writes a placeholder PERSONA.md when create has no persona', () => {
    const { root, methods } = setup([], ['plain']);

    expect(methods.create({ displayName: 'Plain' }).ok).toBe(true);
    expect(readFileSync(join(root, 'plain', 'memory', 'PERSONA.md'), 'utf8')).toBe('# Plain\n');
  });

  it('owns ID generation and reports malformed Human-facing fields', () => {
    const { root, methods } = setup([], ['bot-generated', 'bot-generated']);

    expect(methods.create({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 42 })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'displayName is required' },
    });
    expect(methods.create({ displayName: 'Ada', roles: '研究员' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'invalid create payload' },
    });

    const created = methods.create({ slug: 'caller-choice', displayName: 'Ada' });
    expect(created.ok && created.value.bot.slug).toBe('bot-generated');
    expect(existsSync(join(root, 'bot-generated', 'bot.json'))).toBe(true);
    expect(existsSync(join(root, 'caller-choice', 'bot.json'))).toBe(false);
    expect(methods.create({ displayName: '同名 Ada' })).toEqual({
      ok: false,
      error: { code: 'duplicate', message: 'PersonaBot already exists: bot-generated' },
    });
  });

  it('allows duplicate display names because mention identity stays on the generated ID', () => {
    const { methods } = setup([], ['bot-one', 'bot-two']);

    const first = methods.create({ displayName: '小研' });
    const second = methods.create({ displayName: '小研' });

    expect(first.ok && first.value.bot.slug).toBe('bot-one');
    expect(second.ok && second.value.bot.slug).toBe('bot-two');
  });

  it('updates editable fields and leaves persona untouched', () => {
    const { root, methods } = setup();
    methods.create({
      slug: 'ada',
      displayName: 'Ada',
      persona: '# Ada\n\nOriginal.\n',
      roles: ['old'],
    });

    const result = methods.update({
      slug: 'ada',
      patch: {
        displayName: 'Ada Lovelace',
        roles: ['   '],
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
          roles: [],
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

    expect(methods.update({ slug: 'missing', patch: { roles: ['x'] } })).toEqual({
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
      error: { code: 'invalid-input', message: 'members must be an array of PersonaBot IDs' },
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

  it('lists sessions whose cwd sits inside the bot workspaces, newest first', () => {
    const summaries: SessionSummary[] = [
      {
        id: 'session-1',
        title: 'older',
        cwd: '/srv/ada',
        updatedAt: '2026-09-19T01:00:00.000Z',
      },
      {
        id: 'session-2',
        title: 'newer',
        cwd: '/srv/ada/sub',
        updatedAt: '2026-09-19T03:00:00.000Z',
      },
      {
        id: 'session-3',
        title: 'outside',
        cwd: '/srv/other',
        updatedAt: '2026-09-19T04:00:00.000Z',
      },
      {
        id: 'session-4',
        title: 'prefix trap',
        cwd: '/srv/ada-extra',
        updatedAt: '2026-09-19T05:00:00.000Z',
      },
    ];
    const { methods } = setup(summaries);
    methods.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/srv/ada/'] });

    const result = methods.sessions({ slug: 'ada' });

    expect(result.ok && result.value.sessions.map((session) => session.id)).toEqual([
      'session-2',
      'session-1',
    ]);
  });

  it('returns an empty session list for a bot without workspaces', () => {
    const { methods } = setup([
      {
        id: 'session-1',
        title: 'anywhere',
        cwd: '/srv/ada',
        updatedAt: '2026-09-19T01:00:00.000Z',
      },
    ]);
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.sessions({ slug: 'ada' })).toEqual({ ok: true, value: { sessions: [] } });
  });

  it('rejects malformed or unknown session reads', () => {
    const { methods } = setup();

    expect(methods.sessions({})).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'slug is required' },
    });
    expect(methods.sessions({ slug: 'missing' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown PersonaBot: missing' },
    });
  });
});
