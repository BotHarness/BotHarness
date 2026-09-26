import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createAttachmentStore } from '../src/attachments/store.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { createPersonaBotRegistry } from '../src/bots/registry.js';
import { createChannelStore, type ChannelStore } from '../src/channels/store.js';
import { createRosterStore } from '../src/roster/store.js';
import type { BotRuntime } from '../src/runtime/bot-runtime.js';
import type { WorkspaceGrantStore } from '../src/workspaces/grants.js';
import { createBotStateTracker } from '../src/state/bot-state.js';
import { createTestOwnership } from './helpers.js';

const roots: string[] = [];

function tickingNow(): () => Date {
  let value = Date.parse('2026-09-19T00:00:00.000Z');
  return () => {
    value += 1000;
    return new Date(value);
  };
}

function setup(
  _sessionSummaries: unknown[] = [],
  botIds: string[] = ['ada'],
  runtimeFactory?: (channels: ChannelStore) => BotRuntime,
  ownership = createTestOwnership(),
  grants?: WorkspaceGrantStore,
) {
  const root = mkdtempSync(join(tmpdir(), 'botharness-bridge-'));
  roots.push(root);
  const registry = createPersonaBotRegistry({ rootDir: root });
  const states = createBotStateTracker();
  const attachments = createAttachmentStore({ rootDir: join(root, 'attachments') });
  const channels = createChannelStore({
    rootDir: join(root, 'channels'),
    attachments,
    now: tickingNow(),
  });
  let botIdIndex = 0;
  return {
    root,
    registry,
    states,
    channels,
    attachments,
    methods: createBridgeMethods({
      registry,
      states,
      channels,
      ownership,
      roster: createRosterStore(),
      ...(grants === undefined ? {} : { grants }),
      ...(runtimeFactory === undefined ? {} : { runtime: runtimeFactory(channels) }),
      createBotId: () => botIds[botIdIndex++] ?? 'bot-test-' + botIdIndex,
    }),
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('bridge methods', () => {
  it('commits only a Grant-backed typed resolution for this Bot DM and retries it idempotently', async () => {
    const grant = {
      id: 'grant-1',
      botSlug: 'ada',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: '2026-09-26T00:00:00.000Z',
    };
    let revoked = false;
    const grants: WorkspaceGrantStore = {
      list: (slug) =>
        slug === 'ada' ? [{ ...grant, ...(revoked ? { revokedAt: grant.createdAt } : {}) }] : [],
      create: async () => grant,
      revoke: () => grant,
      requireActive: () => grant,
      availableWorkspaces: () => [],
    };
    const { registry, channels, methods } = setup(
      [],
      ['ada'],
      undefined,
      createTestOwnership(),
      grants,
    );
    expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
    const dm = channels.getOrCreateDm('ada', 'Ada')!;
    await channels.appendMessage(dm.id, {
      id: 'grant-request-1',
      at: '2026-09-26T00:00:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: 'Please grant this workspace.',
      grantRequest: true,
    });
    const payload = {
      channelId: dm.id,
      messageId: 'human-25f4609a-2aee-446a-a5d9-ea53607aba13',
      body: 'Workspace authorized.',
      replyTo: 'grant-request-1',
      grantRequestResolution: { requestMessageId: 'grant-request-1', grantId: 'grant-1' },
    };
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: { ...payload.grantRequestResolution, grantId: 'unknown' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        ...payload,
        grantRequestResolution: { ...payload.grantRequestResolution, requestMessageId: 'missing' },
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: '已授权工作区「Project」，请继续处理之前的事项。',
        replyTo: 'grant-request-1',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: dm.id,
        body: 'I AUTHORIZED WORKSPACE “Project”; please continue.',
        replyTo: 'grant-request-1',
      }),
    ).toMatchObject({ ok: true });
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(channels.message(dm.id, payload.messageId)?.grantRequestResolution).toEqual(
      payload.grantRequestResolution,
    );
    revoked = true;
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({
        ...payload,
        messageId: 'human-35f4609a-2aee-446a-a5d9-ea53607aba13',
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('keeps Bot-to-Bot DMs inspectable but rejects Human sends and renames', async () => {
    const { registry, channels, methods } = setup([], ['ada', 'bea']);
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const dm = channels.getOrCreateBotDm('ada', 'bea', 'Ada · Bea')!;
    expect(methods.channelMessages({ channelId: dm.id })).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({ channelId: dm.id, body: 'Human interjection' }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(methods.channelRename({ channelId: dm.id, name: 'Changed' })).toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
    expect(channels.readMessages(dm.id)).toEqual([]);
  });

  it('requires selected joined Bot identities and preserves committed retry identity', async () => {
    const wakes: string[] = [];
    const { registry, channels, methods } = setup([], ['ada', 'bea'], () => ({
      admitGroupMessage(channelId, messageId) {
        wakes.push(channelId + ':' + messageId);
      },
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: true as const, settled: Promise.resolve() }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    expect(registry.create({ slug: 'ada', displayName: 'Alex' }).ok).toBe(true);
    expect(registry.create({ slug: 'bea', displayName: 'Alex' }).ok).toBe(true);
    const group = channels.createGroup({ name: 'Team', members: ['ada', 'bea'] });
    const body = '@Alex @Alex hello';
    const payload = {
      channelId: group.id,
      messageId: 'human-25f4609a-2aee-446a-a5d9-ea53607aba13',
      body,
      mentions: [
        { botSlug: 'ada', label: 'Alex', start: 0, end: 5 },
        { botSlug: 'bea', label: 'Alex', start: 6, end: 11 },
      ],
    };
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    expect(channels.readMessages(group.id)).toHaveLength(1);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(wakes).toHaveLength(1);
    registry.setPaused('bea', true);
    expect(await methods.channelSend(payload)).toMatchObject({ ok: true });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'bea', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });

    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'outsider', label: 'Alex', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(
      await methods.channelSend({
        channelId: group.id,
        body: '@Alex hello',
        mentions: [{ botSlug: 'ada', label: 'wrong', start: 0, end: 5 }],
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(await methods.channelSend({ channelId: group.id, body: '@Alex hello' })).toMatchObject({
      ok: true,
    });
    expect(wakes).toHaveLength(2);
    expect(channels.readMessages(group.id)).toHaveLength(2);
  });

  it('admits blank attachment-only DMs and rejects forged refs', async () => {
    const admitted: string[] = [];
    const { channels, attachments, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        admitted.push(input.body);
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm('ada', 'Ada');
    const ref = await attachments.upload({
      data: (async function* () {
        yield new TextEncoder().encode('hello');
      })(),
      name: 'note.txt',
    });
    const sent = await methods.channelSend({
      channelId: 'dm-ada',
      body: '   ',
      attachments: [ref],
    });
    expect(sent).toMatchObject({ ok: true, value: { message: { attachments: [ref] } } });
    const empty = await methods.channelSend({ channelId: 'dm-ada', body: '', attachments: [ref] });
    expect(empty.ok).toBe(true);
    expect(admitted).toEqual(['[Attachments: note.txt]', '[Attachments: note.txt]']);
    const bad = await methods.channelSend({
      channelId: 'dm-ada',
      body: '',
      attachments: [{ ...ref, size: 999 }],
    });
    expect(bad).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    expect(channels.readMessages('dm-ada')).toHaveLength(2);
  });

  it('persists a Human Memory branch choice and rejects a conflicting retry', async () => {
    const { channels, methods } = setup();
    channels.getOrCreateDm('ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'Switch Memory to history',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
      memorySwitchTarget: 'history',
    };
    const first = await methods.channelSend(payload);
    expect(first).toMatchObject({
      ok: true,
      value: { message: { author: { kind: 'human' }, memorySwitchTarget: 'history' } },
    });
    expect(channels.readMessages('dm-ada')[0]?.memorySwitchTarget).toBe('history');
    expect(await methods.channelSend(payload)).toEqual(first);
    await expect(
      methods.channelSend({ ...payload, memorySwitchTarget: 'main' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    await expect(
      methods.channelSend({ ...payload, memorySwitchTarget: '' }),
    ).resolves.toMatchObject({ ok: false, error: { code: 'invalid-input' } });
  });

  it('deduplicates one Human client message id before a second runtime admission', async () => {
    let admissions = 0;
    const { channels, methods } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage() {
        admissions += 1;
        return { admitted: true as const, settled: Promise.resolve() };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    channels.getOrCreateDm('ada', 'Ada');
    const payload = {
      channelId: 'dm-ada',
      body: 'only once',
      messageId: 'human-12345678-1234-4234-8234-123456789abc',
    };
    const [first, duplicate] = await Promise.all([
      methods.channelSend(payload),
      methods.channelSend(payload),
    ]);
    expect(duplicate).toEqual(first);
    expect(channels.readMessages('dm-ada')).toHaveLength(1);
    expect(admissions).toBe(1);
    await expect(methods.channelSend({ ...payload, body: 'different' })).resolves.toMatchObject({
      ok: false,
      error: { code: 'invalid-input' },
    });
  });

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
      memoryDir: registry.memoryDirFor('ada'),
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

  it('reports a missing Git prerequisite without exposing a spawn error', () => {
    const { registry, methods } = setup();
    registry.create = () => ({ ok: false, reason: 'git-not-found', detail: 'spawn git ENOENT' });

    expect(methods.create({ displayName: 'No Git' })).toEqual({
      ok: false,
      error: {
        code: 'git-not-found',
        message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
      },
    });
    expect(registry.list()).toEqual([]);
  });
  it('creates a name-only bot with its Memory directory and no Persona file', () => {
    const { root, methods } = setup([], ['plain']);

    expect(methods.create({ displayName: 'Plain' }).ok).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory'))).toBe(true);
    expect(existsSync(join(root, 'plain', 'memory', 'PERSONA.md'))).toBe(false);
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

  it('lists, opens, and creates local channels with a latest-message projection', async () => {
    const { methods, registry } = setup();
    methods.create({ slug: 'ada', displayName: 'Ada' });

    expect(methods.channels({})).toEqual({
      ok: true,
      value: {
        channels: [
          expect.objectContaining({
            id: 'dm-ada',
            type: 'dm',
            name: 'Ada',
            members: ['ada'],
            botSlug: 'ada',
          }),
        ],
      },
    });

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

    await methods.channelSend({ channelId: 'dm-ada', body: '最新进展' });
    const dmList = methods.channels({});
    expect(dmList.ok && dmList.value.channels[0]?.latestMessage?.body).toBe('最新进展');

    const group = methods.channelCreate({ name: 'Design Team', members: ['ada', 'bob'] });
    expect(group.ok && group.value.channel).toMatchObject({
      id: 'group-design-team',
      type: 'group',
      name: 'Design Team',
      members: ['ada', 'bob'],
    });
    const renamedGroup = methods.channelRename({
      channelId: 'group-design-team',
      name: '  Product Team  ',
    });
    expect(renamedGroup.ok && renamedGroup.value.channel.name).toBe('Product Team');
    expect(renamedGroup.ok && renamedGroup.value.bot).toBeUndefined();

    const renamedDm = methods.channelRename({ channelId: 'dm-ada', name: 'Ada Lovelace' });
    expect(renamedDm.ok && renamedDm.value.channel).toMatchObject({
      id: 'dm-ada',
      name: 'Ada Lovelace',
    });
    expect(renamedDm.ok && renamedDm.value.bot?.displayName).toBe('Ada Lovelace');
    expect(registry.get('ada')?.displayName).toBe('Ada Lovelace');
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
    expect(methods.channelRename({ name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'channelId is required' },
    });
    expect(methods.channelRename({ channelId: 'dm-ada', name: '  ' })).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'name is required' },
    });
    expect(methods.channelRename({ channelId: 'missing', name: 'Team' })).toEqual({
      ok: false,
      error: { code: 'not-found', message: 'unknown Channel: missing' },
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

  it('rejects missing or cross-Channel reply targets before appending a human message', async () => {
    const { methods, channels } = setup();
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    const group = methods.channelCreate({ name: 'Team', members: [] });
    expect(group.ok).toBe(true);
    const groupId = group.ok ? group.value.channel.id : '';
    const source = await methods.channelSend({ channelId: groupId, body: 'source' });
    expect(source.ok).toBe(true);
    const sourceId = source.ok ? source.value.message.id : '';

    const invalidTarget = {
      ok: false,
      error: { code: 'invalid-input', message: 'Reply target must exist in this Channel' },
    };
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'cross', replyTo: sourceId }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'missing', replyTo: 'unknown' }),
    ).toEqual(invalidTarget);
    expect(
      await methods.channelSend({ channelId: 'dm-ada', body: 'invalid', replyTo: '' }),
    ).toEqual({
      ok: false,
      error: { code: 'invalid-input', message: 'replyTo must be a message id' },
    });
    expect(channels.revision('dm-ada')).toBe(0);

    const accepted = await methods.channelSend({
      channelId: groupId,
      body: 'answer',
      replyTo: sourceId,
    });
    expect(accepted.ok && accepted.value.message).toMatchObject({
      replyTo: sourceId,
      replyToPreview: { author: { kind: 'human' }, body: 'source' },
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

  it('sends a DM through the Bot runtime and exposes only Assignment read models', async () => {
    const handled: Array<{ channelId: string; messageId: string; body: string }> = [];
    let settled: Promise<void> = Promise.resolve();
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        handled.push(input);
        settled = (async () => {
          const reply = {
            id: 'bot-reply-1',
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: '已经完成发布状态核对。',
          };
          await channels.appendMessage(input.channelId, reply);
        })();
        return { admitted: true as const, settled };
      },
      listAssignments: () => [
        {
          sessionId: 'assignment-1',
          purpose: '核对发布状态',
          activity: 'idle' as const,
          latestReport: {
            state: 'completed' as const,
            summary: '发布状态正常',
            at: '2026-09-19T00:00:01.000Z',
          },
          createdAt: '2026-09-19T00:00:00.000Z',
          updatedAt: '2026-09-19T00:00:01.000Z',
        },
      ],
      getAssignment: (_slug, sessionId) =>
        sessionId === 'assignment-1'
          ? {
              sessionId,
              botSlug: 'ada',
              sourceEventId: 'source-1',
              purpose: '核对发布状态',
              activity: 'idle' as const,
              latestReport: {
                state: 'completed' as const,
                summary: '发布状态正常',
                at: '2026-09-19T00:00:01.000Z',
              },
              createdAt: '2026-09-19T00:00:00.000Z',
              updatedAt: '2026-09-19T00:00:01.000Z',
            }
          : undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: '请核对发布状态' });

    expect(sent.ok).toBe(true);
    expect(handled).toEqual([
      {
        channelId: 'dm-ada',
        messageId: expect.any(String),
        body: '请核对发布状态',
      },
    ]);
    const pending = methods.channelMessages({ channelId: 'dm-ada' });
    expect(pending.ok && pending.value.messages.map((message) => message.body)).toContain(
      '请核对发布状态',
    );

    await settled;
    const messages = methods.channelMessages({ channelId: 'dm-ada' });
    expect(messages.ok && messages.value.messages.map((message) => message.body)).toEqual([
      '已经完成发布状态核对。',
      '请核对发布状态',
    ]);
    expect(methods.assignments({ slug: 'ada' })).toEqual({
      ok: true,
      value: {
        assignments: [
          expect.objectContaining({
            sessionId: 'assignment-1',
            purpose: '核对发布状态',
            activity: 'idle',
          }),
        ],
      },
    });
    expect(methods.assignment({ slug: 'ada', sessionId: 'assignment-1' })).toEqual({
      ok: true,
      value: {
        assignment: expect.objectContaining({
          sessionId: 'assignment-1',
          sourceEventId: 'source-1',
        }),
      },
    });
  });

  it('returns from a DM send before the admitted Orchestrator turns settle', async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const settledTurns: Promise<void>[] = [];
    const admitted: string[] = [];
    const { methods } = setup([], ['ada'], (channels) => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage(input) {
        admitted.push(input.body);
        const settled = (async () => {
          await gate;
          await channels.appendMessage(input.channelId, {
            id: `bot-reply-${admitted.length}`,
            at: '2026-09-19T00:00:02.000Z',
            author: { kind: 'bot' as const, slug: 'ada' },
            body: `reply-${input.body}`,
          });
        })();
        settledTurns.push(settled);
        return { admitted: true as const, settled };
      },
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const first = await methods.channelSend({ channelId: 'dm-ada', body: 'first' });
    const second = await methods.channelSend({ channelId: 'dm-ada', body: 'second' });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(admitted).toEqual(['first', 'second']);
    const before = methods.channelMessages({ channelId: 'dm-ada' });
    expect(before.ok && before.value.messages.map((message) => message.body)).toEqual([
      'second',
      'first',
    ]);

    release();
    await Promise.all(settledTurns);
    const after = methods.channelMessages({ channelId: 'dm-ada' });
    expect(after.ok && after.value.messages.map((message) => message.body)).toEqual([
      'reply-second',
      'reply-first',
      'second',
      'first',
    ]);
  });

  it('rejects an archived PersonaBot before committing a Human DM', async () => {
    const { methods, registry, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: false as const, reason: 'archived-bot' as const }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });
    registry.setPaused('ada', true);

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });

    expect(sent).toEqual({
      ok: false,
      error: { code: 'bot-archived', message: 'PersonaBot is archived: ada' },
    });
    expect(channels.readMessages('dm-ada')).toEqual([]);
  });

  it('reports a post-commit admission refusal without mislabeling a durable message as failed', async () => {
    const { methods, channels } = setup([], ['ada'], () => ({
      admitGroupMessage() {},
      admitBotDmMessage() {},
      admitGroupInvitation() {},
      admitDmMessage: () => ({ admitted: false as const, reason: 'runtime-closed' as const }),
      listAssignments: () => [],
      getAssignment: () => undefined,
      whenIdle: async () => undefined,
      close: async () => undefined,
    }));
    methods.create({ displayName: 'Ada' });
    methods.channelDm({ slug: 'ada', displayName: 'Ada' });

    const sent = await methods.channelSend({ channelId: 'dm-ada', body: 'hello' });

    expect(sent).toMatchObject({ ok: true, value: { message: { body: 'hello' } } });
    expect(channels.readMessages('dm-ada').map((message) => message.body)).toEqual(['hello']);
  });

  it('lists only root Sessions owned by the bot, preserving role and cwd evidence', () => {
    const ownership = createTestOwnership({
      'session-1': { botSlug: 'ada', rootRole: 'orchestrator' },
      'session-2': { botSlug: 'ada', rootRole: 'assignment' },
      'session-3': { botSlug: 'bob', rootRole: 'assignment' },
    });
    const { methods } = setup([], ['ada'], undefined, ownership);
    methods.create({ slug: 'ada', displayName: 'Ada', workspaces: ['/srv/ada/'] });

    const result = methods.sessions({ slug: 'ada' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.sessions).toEqual([
      expect.objectContaining({ sessionId: 'session-1', role: 'orchestrator' }),
      expect.objectContaining({ sessionId: 'session-2', role: 'assignment' }),
    ]);
    expect(result.value.sessions.map((session) => session.sessionId)).not.toContain('session-3');
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
