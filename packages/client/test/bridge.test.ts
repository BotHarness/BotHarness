import { describe, expect, it, vi } from 'vitest';

import { createActions } from '../src/client/actions.js';
import {
  createBridgeCall,
  parseAssignmentSummaries,
  parseBotSummary,
  parseChannelMessages,
  parseChannelRecord,
  parseChannelRecords,
  parseSessionSummaries,
  type BridgeCall,
} from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

type Handler = (payload: Record<string, unknown>) => unknown;

function bridgeCall(handlers: Record<string, Handler>): BridgeCall {
  return async (endpoint, payload) => {
    const handler = handlers[endpoint];
    if (handler === undefined) throw new Error(`unexpected endpoint: ${endpoint}`);
    return { ok: true, value: handler(payload) };
  };
}

const BOT = {
  slug: 'ada',
  displayName: 'Ada',
  roles: ['研究'],
  aggregateState: 'working',
  workspaces: ['/srv/ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
};

const GROUP = {
  id: 'group-team',
  type: 'group' as const,
  name: 'Team',
  members: ['ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

const DM = {
  id: 'dm-ada',
  type: 'dm' as const,
  name: 'Ada',
  members: ['ada'],
  botSlug: 'ada',
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

describe('bridge transport', () => {
  it('wraps named arguments in the typert args envelope and drops undefined', async () => {
    const calls: unknown[][] = [];
    const ctx = {
      connection: {
        rpc: {
          call: async (...args: unknown[]) => {
            calls.push(args);
            return { ok: true, value: { bots: [] } };
          },
        },
      },
    };

    const call = createBridgeCall(ctx as never);
    await call('list', { query: undefined, limit: 5 });

    expect(calls).toEqual([['/api', 'botharness/list', { args: { limit: 5 } }, undefined]]);
  });

  it('reports unavailable when the connection rpc is absent', async () => {
    const call = createBridgeCall({} as never);

    await expect(call('list', {})).resolves.toEqual({
      ok: false,
      error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
    });
  });
});

describe('bridge parsers', () => {
  it('parses one created PersonaBot detail with list-compatible defaults', () => {
    expect(parseBotSummary({ slug: 'new-bot', displayName: 'New Bot', workspaces: [] })).toEqual({
      slug: 'new-bot',
      displayName: 'New Bot',
      aggregateState: 'idle',
      workspaces: [],
      roles: [],
      createdAt: '',
    });
    expect(
      parseBotSummary({ slug: 'legacy', displayName: 'Legacy', tag: '旧岗位' })?.roles,
    ).toEqual(['旧岗位']);
    expect(parseBotSummary({ slug: '', displayName: 'Broken' })).toBeUndefined();
  });

  it('drops malformed channels and keeps botSlug only when present', () => {
    const latestMessage = {
      id: 'm-latest',
      at: '2026-09-19T00:03:00.000Z',
      author: { kind: 'bot', slug: 'ada' },
      body: '最新进展',
    };
    const channels = parseChannelRecords({
      channels: [GROUP, { ...DM, latestMessage }, { id: 'bad', type: 'nope', name: 'x' }, null],
    });

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ id: 'group-team', type: 'group' });
    expect(channels[1]).toMatchObject({
      id: 'dm-ada',
      botSlug: 'ada',
      latestMessage: { id: 'm-latest', body: '最新进展' },
    });
    expect('botSlug' in channels[0]!).toBe(false);
    expect(parseChannelRecord(undefined)).toBeUndefined();
  });

  it('keeps valid message authors and skips malformed rows', () => {
    const messages = parseChannelMessages({
      messages: [
        {
          id: 'm1',
          at: '2026-09-19T00:00:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'hi',
        },
        { id: 'm2', at: '2026-09-19T00:01:00.000Z', author: { kind: 'bridged' }, body: 'x' },
        { id: '', at: 'x', author: { kind: 'human' }, body: 'x' },
        { id: 'm3', at: 'x', author: { kind: 'human' }, body: 'ok' },
      ],
    });

    expect(messages.map((message) => message.id)).toEqual(['m1', 'm3']);
    expect(messages[0]?.author).toEqual({ kind: 'bot', slug: 'ada' });
  });

  it('parses Assignment summaries and drops malformed rows', () => {
    expect(
      parseAssignmentSummaries({
        assignments: [
          {
            sessionId: 'assignment-1',
            purpose: '核对发布状态',
            activity: 'idle',
            latestReport: {
              state: 'completed',
              summary: '发布状态正常',
              at: '2026-09-19T00:03:00.000Z',
            },
            createdAt: '2026-09-19T00:02:00.000Z',
            updatedAt: '2026-09-19T00:03:00.000Z',
          },
          { sessionId: '', purpose: 'bad', activity: 'idle' },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        sessionId: 'assignment-1',
        purpose: '核对发布状态',
        activity: 'idle',
        latestReport: expect.objectContaining({ state: 'completed', summary: '发布状态正常' }),
      }),
    ]);
  });

  it('keeps session rows with a cwd and defaults a missing title', () => {
    const sessions = parseSessionSummaries({
      sessions: [
        { id: 's1', title: '研究', cwd: '/srv/ada', updatedAt: '2026-09-19T00:00:00.000Z' },
        { id: 's2', cwd: '/srv/ada' },
        { id: 's3', title: 'no cwd', updatedAt: 'x' },
        null,
      ],
    });

    expect(sessions).toEqual([
      { id: 's1', title: '研究', cwd: '/srv/ada', updatedAt: '2026-09-19T00:00:00.000Z' },
      { id: 's2', title: '', cwd: '/srv/ada', updatedAt: '' },
    ]);
  });
});

describe('bridge actions', () => {
  function setup(extra: Record<string, Handler> = {}) {
    const clientStore = createStore();
    let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [];
    let pins: string[] = [];
    const call = bridgeCall({
      list: () => ({ bots: [BOT] }),
      channels: () => ({ channels: [GROUP, DM] }),
      channelDm: () => ({ channel: DM }),
      channelMessages: () => ({
        revision: 2,
        messages: [
          { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
          { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
        ],
      }),
      channelSend: (payload) => ({
        message: {
          id: 'm3',
          at: '2026-09-19T00:03:00.000Z',
          author: { kind: 'human' },
          body: payload['body'],
        },
      }),
      channelCreate: (payload) => ({
        channel: { ...GROUP, name: payload['name'], members: [] },
      }),
      channelRename: (payload) => ({
        channel: { ...DM, name: payload['name'] },
        bot: { ...BOT, displayName: payload['name'] },
      }),
      assignments: () => ({
        assignments: [
          {
            sessionId: 'assignment-1',
            purpose: '研究发布状态',
            activity: 'idle',
            latestReport: {
              state: 'completed',
              summary: '发布状态正常',
              at: '2026-09-19T00:04:00.000Z',
            },
            createdAt: '2026-09-19T00:03:00.000Z',
            updatedAt: '2026-09-19T00:04:00.000Z',
          },
        ],
      }),
      assignment: () => ({
        assignment: {
          sessionId: 'assignment-1',
          botSlug: 'ada',
          sourceEventId: 'source-1',
          purpose: '研究发布状态',
          activity: 'idle',
          latestReport: {
            state: 'completed',
            summary: '发布状态正常',
            at: '2026-09-19T00:04:00.000Z',
          },
          createdAt: '2026-09-19T00:03:00.000Z',
          updatedAt: '2026-09-19T00:04:00.000Z',
        },
      }),
      rosterGet: () => ({ pins, sections: [], topOrder }),
      pinsSet: (payload) => {
        pins = payload['pins'] as string[];
        return { pins };
      },
      channelAssign: () => ({}),
      topReorder: (payload) => {
        topOrder = payload['order'] as typeof topOrder;
        return { topOrder };
      },
      ...extra,
    });
    return { clientStore, actions: createActions(call, clientStore) };
  }

  it('loads the roster and opens a DM with its history in chronological order', async () => {
    const { clientStore, actions } = setup();

    await actions.load();
    expect(clientStore.getSnapshot()).toMatchObject({
      status: 'ready',
      bots: [{ slug: 'ada' }],
      channels: [{ id: 'group-team' }, { id: 'dm-ada' }],
    });

    await actions.openBot('ada');
    const state = clientStore.getSnapshot();
    expect(state.selection).toEqual({ kind: 'bot', slug: 'ada' });
    expect(state.conversation.status).toBe('ready');
    expect(state.conversation.channel?.id).toBe('dm-ada');
    expect(state.conversation.messages.map((message) => message.body)).toEqual(['older', 'newer']);
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.latestMessage?.body).toBe(
      'newer',
    );
    expect(state.assignments.items.map((assignment) => assignment.sessionId)).toEqual([
      'assignment-1',
    ]);
    await actions.openAssignment('assignment-1');
    expect(clientStore.getSnapshot().assignments.selected).toMatchObject({
      sessionId: 'assignment-1',
      sourceEventId: 'source-1',
    });
  });

  it('renames a DM Channel and its PersonaBot projection without changing either id', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openBot('ada');

    await expect(actions.renameChannel('dm-ada', 'Ada Lovelace')).resolves.toBe(true);

    const state = clientStore.getSnapshot();
    expect(state.bots.find((bot) => bot.slug === 'ada')).toMatchObject({
      slug: 'ada',
      displayName: 'Ada Lovelace',
    });
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.name).toBe('Ada Lovelace');
    expect(state.conversation.channel?.name).toBe('Ada Lovelace');
  });

  it('pins and unpins group and DM Channels through the durable roster before refreshing', async () => {
    const writes: string[][] = [];
    let pins: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['group-team']);
    await expect(actions.setChannelPinned('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelPinned('dm-ada', true)).resolves.toBe(true);
    await expect(actions.setChannelPinned('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['group-team'], ['group-team', 'dm-ada'], ['dm-ada']]);
  });

  it('hides and restores a Channel without changing its pin, section, or flat order', async () => {
    const writes: string[][] = [];
    let hidden: string[] = [];
    const pins = ['group-team'];
    const sections = [{ id: 's1', name: 'A', channelIds: ['group-team'] }];
    const topOrder = [{ kind: 'section' as const, id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, hidden, sections, topOrder }),
      hiddenSet: (payload) => {
        hidden = [...(payload['hidden'] as string[])];
        writes.push(hidden);
        return { hidden };
      },
    });
    await actions.load();

    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: ['group-team'],
      sections,
      topOrder,
    });
    await expect(actions.setChannelHidden('group-team', true)).resolves.toBe(true);
    expect(writes).toEqual([['group-team']]);

    await expect(actions.setChannelHidden('group-team', false)).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins,
      hidden: [],
      sections,
      topOrder,
    });
    expect(writes).toEqual([['group-team'], []]);
  });

  it('unpins and places a Channel inside a section before one roster refresh', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let reads = 0;
    let pins = ['group-team'];
    let channelIds = ['dm-ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => {
        reads += 1;
        return { pins, sections: [{ id: 's1', name: 'A', channelIds }], topOrder: [] };
      },
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
        return {};
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannel('group-team', 's1', ['group-team', 'dm-ada']),
    ).resolves.toBe(true);

    expect(calls).toEqual([
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'group-team', sectionId: 's1', index: 0 },
      },
      {
        endpoint: 'channelAssign',
        payload: { channelId: 'dm-ada', sectionId: 's1', index: 1 },
      },
      { endpoint: 'pinsSet', payload: { pins: [] } },
    ]);
    expect(reads).toBe(2);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      sections: [{ id: 's1', channelIds: ['group-team', 'dm-ada'] }],
    });
  });

  it('unpins and places a Channel at an exact loose top-level position', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let pins = ['group-team'];
    let topOrder: Array<{ kind: 'section' | 'channel'; id: string }> = [
      { kind: 'section', id: 's1' },
    ];
    let channelIds = ['group-team'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins,
        sections: [{ id: 's1', name: 'A', channelIds }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        channelIds = channelIds.filter((id) => id !== payload['channelId']);
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as typeof topOrder;
        return { topOrder };
      },
      pinsSet: (payload) => {
        calls.push({ endpoint: 'pinsSet', payload });
        pins = [...(payload['pins'] as string[])];
        return { pins };
      },
    });
    await actions.load();

    await expect(
      actions.movePinnedChannelToFlat('group-team', [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ]),
    ).resolves.toBe(true);

    expect(calls.map((call) => call.endpoint)).toEqual(['channelAssign', 'topReorder', 'pinsSet']);
    expect(clientStore.getSnapshot().roster).toMatchObject({
      pins: [],
      topOrder: [
        { kind: 'channel', id: 'group-team' },
        { kind: 'section', id: 's1' },
      ],
    });
  });

  it('canonicalises legacy PersonaBot-slug pins to their DM Channel ids', async () => {
    const writes: string[][] = [];
    let pins = ['ada'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins, sections: [], topOrder: [] }),
      pinsSet: (payload) => {
        pins = [...(payload['pins'] as string[])];
        writes.push(pins);
        return { pins };
      },
    });
    await actions.load();

    await expect(actions.ensureChannelPins()).resolves.toBe(true);
    expect(clientStore.getSnapshot().roster.pins).toEqual(['dm-ada']);
    expect(writes).toEqual([['dm-ada']]);
  });

  it('echoes a DM message locally, then reconciles it with the committed message', async () => {
    let assignmentReads = 0;
    let resolveSend: (value: { message: Record<string, unknown> }) => void = () => undefined;
    const response = new Promise<{ message: Record<string, unknown> }>((resolve) => {
      resolveSend = resolve;
    });
    const { clientStore, actions } = setup({
      channelSend: () => response,
      assignments: () => {
        assignmentReads += 1;
        return { assignments: [] };
      },
    });
    await actions.load();
    await actions.openBot('ada');

    const sending = actions.send('hello');
    const echoed = clientStore.getSnapshot().conversation;
    expect(echoed.sending).toBe(true);
    expect(echoed.messages.map((message) => message.body)).toEqual(['older', 'newer', 'hello']);
    expect(echoed.messages.at(-1)?.pending).toBe(true);

    resolveSend({
      message: {
        id: 'm3',
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: 'hello',
      },
    });
    await expect(sending).resolves.toBe(true);

    const settled = clientStore.getSnapshot();
    expect(settled.conversation.sending).toBe(false);
    expect(settled.conversation.messages).toEqual([
      { id: 'm1', at: '2026-09-19T00:01:00.000Z', author: { kind: 'human' }, body: 'older' },
      { id: 'm2', at: '2026-09-19T00:02:00.000Z', author: { kind: 'human' }, body: 'newer' },
      {
        id: 'm3',
        at: '2026-09-19T00:03:00.000Z',
        author: { kind: 'human' },
        body: 'hello',
      },
    ]);
    expect(assignmentReads).toBe(2);
    expect(settled.channels.find((channel) => channel.id === 'dm-ada')?.updatedAt).toBe(
      '2026-09-19T00:03:00.000Z',
    );
    expect(settled.channels.find((channel) => channel.id === 'dm-ada')?.latestMessage?.body).toBe(
      'hello',
    );
  });

  it('removes the local echo and reports the failure when a send is rejected', async () => {
    const { clientStore, actions } = setup({
      channelSend: () => {
        throw new Error('PersonaBot is archived: ada');
      },
    });
    await actions.load();
    await actions.openBot('ada');

    await expect(actions.send('hello')).resolves.toBe(false);

    const state = clientStore.getSnapshot();
    expect(state.conversation.messages.map((message) => message.body)).toEqual(['older', 'newer']);
    expect(state.conversation.sending).toBe(false);
    expect(state.conversation.error).toBe('PersonaBot is archived: ada');
  });

  it('creates a group channel, selects it, and surfaces failures', async () => {
    const { clientStore, actions } = setup();
    await actions.load();

    const channel = await actions.createGroup('Team');

    expect(channel?.id).toBe('group-team');
    const state = clientStore.getSnapshot();
    expect(state.channels[0]?.id).toBe('group-team');
    expect(state.selection).toEqual({ kind: 'channel', channelId: 'group-team' });
    expect(state.conversation.status).toBe('ready');
    expect(state.roster.topOrder?.[0]).toEqual({ kind: 'channel', id: 'group-team' });

    const failing = createActions(
      bridgeCall({
        list: () => ({ bots: [] }),
        channels: () => ({ channels: [] }),
        channelCreate: () => {
          throw new Error('bridge down');
        },
      }),
      clientStore,
    );
    await expect(failing.createGroup('Nope')).rejects.toThrow('bridge down');
  });

  it('creates a group channel as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createGroup('Team', 'section-work');

    expect(assignments).toEqual([{ channelId: 'group-team', sectionId: 'section-work', index: 0 }]);
  });

  it('creates a PersonaBot through the Host, adds it to the roster, and selects it', async () => {
    const creates: Array<Record<string, unknown>> = [];
    const { clientStore, actions } = setup({
      create: (payload) => {
        creates.push(payload);
        return {
          bot: {
            slug: 'bot-generated',
            displayName: payload['displayName'],
            roles: payload['roles'],
            description: payload['description'],
            aggregateState: 'idle',
            workspaces: [],
            createdAt: '2026-09-20T00:00:00.000Z',
          },
        };
      },
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-generated', botSlug: 'bot-generated' } }),
    });
    await actions.load();

    const created = await actions.createBot({
      displayName: '小研',
      roles: ['研究员', '写作'],
      description: '负责资料研究与写作。',
    });

    expect(creates).toEqual([
      {
        displayName: '小研',
        roles: ['研究员', '写作'],
        description: '负责资料研究与写作。',
      },
    ]);
    expect(created.slug).toBe('bot-generated');
    expect(clientStore.getSnapshot().bots[0]).toMatchObject({
      slug: 'bot-generated',
      displayName: '小研',
      roles: ['研究员', '写作'],
      description: '负责资料研究与写作。',
    });
    expect(clientStore.getSnapshot().selection).toEqual({
      kind: 'bot',
      slug: 'bot-generated',
    });
    expect(clientStore.getSnapshot().conversation.status).toBe('idle');
    expect(clientStore.getSnapshot().roster.topOrder?.[0]).toEqual({
      kind: 'channel',
      id: 'dm-bot-generated',
    });
  });

  it('creates a PersonaBot DM as the first row of a target section', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    const { actions } = setup({
      create: () => ({ bot: { ...BOT, slug: 'bot-generated' } }),
      channelDm: () => ({ channel: { ...DM, id: 'dm-bot-generated', botSlug: 'bot-generated' } }),
      channelAssign: (payload) => {
        assignments.push(payload);
        return {};
      },
    });
    await actions.load();

    await actions.createBot({ displayName: '小研', roles: [] }, 'section-work');

    expect(assignments).toEqual([
      { channelId: 'dm-bot-generated', sectionId: 'section-work', index: 0 },
    ]);
  });

  it('reports roster failures without throwing', async () => {
    const failing: BridgeCall = async () => ({
      ok: false,
      error: { code: 'unavailable', message: 'RPC is not available', details: {} },
    });
    const clientStore = createStore();

    await createActions(failing, clientStore).load();

    expect(clientStore.getSnapshot()).toMatchObject({
      status: 'error',
      error: 'RPC is not available',
    });
  });

  it('mirrors the host arrangement into the roster state', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: ['ada'],
        sections: [
          { id: 's2', name: '研究', channelIds: [] },
          { id: 's1', name: '工作流', channelIds: ['c1'] },
        ],
      }),
    });

    await actions.load();

    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      sections: [
        { id: 's2', name: '研究', channelIds: [] },
        { id: 's1', name: '工作流', channelIds: ['c1'] },
      ],
      topOrder: undefined,
      readOnly: false,
    });
  });

  it('creates a section through the bridge and refreshes the roster', async () => {
    const writes: unknown[] = [];
    let sections: Array<{ id: string; name: string; channelIds: string[] }> = [];
    const { clientStore, actions } = setup({
      sectionCreate: (payload) => {
        writes.push(payload);
        const created = { id: 'host-1', name: String(payload['name']), channelIds: [] };
        sections = [...sections, created];
        return { section: created };
      },
      rosterGet: () => ({ pins: [], sections }),
    });

    const created = await actions.createSection('研究');

    expect(writes).toEqual([{ name: '研究' }]);
    expect(created).toEqual({ id: 'host-1', name: '研究', channelIds: [] });
    expect(clientStore.getSnapshot().roster.sections).toEqual([
      { id: 'host-1', name: '研究', channelIds: [] },
    ]);
  });

  it('freezes a section order through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2', 'c3'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.setSectionChannelOrder('s1', ['c3', 'c1', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c3', sectionId: 's1', index: 0 },
      { channelId: 'c1', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c3', 'c1', 'c2']);
  });

  it('moves a channel into a section through positioned channelAssign writes', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds = ['c1', 'c2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c3', 's1', ['c1', 'c3', 'c2']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([
      { channelId: 'c1', sectionId: 's1', index: 0 },
      { channelId: 'c3', sectionId: 's1', index: 1 },
      { channelId: 'c2', sectionId: 's1', index: 2 },
    ]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1', 'c3', 'c2']);
  });

  it('moves a channel into an empty section with a single index-0 write', async () => {
    const assignments: Array<Record<string, unknown>> = [];
    let channelIds: string[] = [];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's-empty', name: 'Empty', channelIds }],
      }),
      channelAssign: (payload) => {
        assignments.push(payload);
        const channelId = String(payload['channelId']);
        const index = Number(payload['index']);
        const without = channelIds.filter((id) => id !== channelId);
        channelIds = [...without.slice(0, index), channelId, ...without.slice(index)];
      },
    });
    await actions.load();

    const applied = await actions.moveChannel('c1', 's-empty', ['c1']);

    expect(applied).toBe(true);
    expect(assignments).toEqual([{ channelId: 'c1', sectionId: 's-empty', index: 0 }]);
    expect(clientStore.getSnapshot().roster.sections[0]?.channelIds).toEqual(['c1']);
  });

  it('persists the section display order through the bridge', async () => {
    const writes: unknown[] = [];
    let sectionOrder = ['s1', 's2'];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: sectionOrder.map((id) => ({ id, name: id, channelIds: [] })),
      }),
      sectionReorder: (payload) => {
        writes.push(payload);
        sectionOrder = payload['order'] as string[];
        return { sectionOrder };
      },
    });
    await actions.load();

    const applied = await actions.reorderSections(['s2', 's1']);

    expect(applied).toBe(true);
    expect(writes).toEqual([{ order: ['s2', 's1'] }]);
    expect(clientStore.getSnapshot().roster.sections.map((section) => section.id)).toEqual([
      's2',
      's1',
    ]);
  });

  it('persists absolute flat orders and moves channels into flat slots', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    let topOrder: unknown[] = [{ kind: 'section', id: 's1' }];
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        topOrder,
      }),
      channelAssign: (payload) => {
        calls.push({ endpoint: 'channelAssign', payload });
        return {};
      },
      topReorder: (payload) => {
        calls.push({ endpoint: 'topReorder', payload });
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();

    await actions.reorderFlat([
      { kind: 'channel', id: 'c9' },
      { kind: 'section', id: 's1' },
    ]);
    await actions.moveToFlat('c1', [
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);

    expect(calls.map((call) => call.endpoint)).toEqual([
      'topReorder',
      'channelAssign',
      'topReorder',
    ]);
    expect(calls[1]).toEqual({
      endpoint: 'channelAssign',
      payload: { channelId: 'c1', sectionId: undefined },
    });
    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'channel', id: 'c1' },
      { kind: 'section', id: 's1' },
    ]);
  });

  it('converts a pre-flat host arrangement once and then stays quiet', async () => {
    let topOrder: unknown[] | undefined;
    let writes = 0;
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: ['c1'] }],
        ...(topOrder === undefined ? {} : { topOrder }),
      }),
      topReorder: (payload) => {
        writes += 1;
        topOrder = payload['order'] as unknown[];
        return { topOrder };
      },
    });
    await actions.load();
    clientStore.setRoster(
      [],
      [
        { ...GROUP, id: 'c1' },
        { ...GROUP, id: 'loose' },
      ],
    );

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
    expect(topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'loose' },
    ]);

    expect(await actions.ensureFlatTopOrder()).toBe(true);
    expect(writes).toBe(1);
  });

  it('projects the flat order and drops malformed entries while parsing', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({
        pins: [],
        sections: [{ id: 's1', name: 'A', channelIds: [] }],
        topOrder: [
          { kind: 'section', id: 's1' },
          { kind: 'channel', id: 'c1' },
          { kind: 'channel', id: '' },
          { kind: 'nope', id: 'x' },
          null,
          { kind: 'channel', id: 'c1' },
        ],
      }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toEqual([
      { kind: 'section', id: 's1' },
      { kind: 'channel', id: 'c1' },
    ]);
  });

  it('leaves legacy hosts without a flat order for the migration', async () => {
    const { clientStore, actions } = setup({
      rosterGet: () => ({ pins: [], sections: [] }),
    });
    await actions.load();

    expect(clientStore.getSnapshot().roster.topOrder).toBeUndefined();
  });

  it('marks the roster read-only when a write reports storage-unavailable', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'rosterGet') {
        return { ok: true, value: { pins: [], sections: [] } };
      }
      if (endpoint === 'sectionCreate') {
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'roster storage is unavailable',
            details: {},
          },
        };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);
    await actions.load();

    await expect(actions.createSection('A')).resolves.toBeUndefined();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    warn.mockRestore();
  });

  it('marks the roster read-only on the first load and clears it when a later load succeeds', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const clientStore = createStore();
    let unavailable = true;
    const call: BridgeCall = async (endpoint) => {
      if (endpoint === 'list') return { ok: true, value: { bots: [] } };
      if (endpoint === 'channels') return { ok: true, value: { channels: [] } };
      if (endpoint === 'rosterGet') {
        return unavailable
          ? {
              ok: false,
              error: {
                code: 'storage-unavailable',
                message: 'roster storage is unavailable',
                details: {},
              },
            }
          : { ok: true, value: { pins: ['ada'], sections: [] } };
      }
      throw new Error(`unexpected endpoint: ${endpoint}`);
    };
    const actions = createActions(call, clientStore);

    await actions.load();
    expect(clientStore.getSnapshot().roster.readOnly).toBe(true);
    expect(clientStore.getSnapshot().status).toBe('ready');

    unavailable = false;
    await actions.refreshRoster();
    expect(clientStore.getSnapshot().roster).toEqual({
      pins: ['ada'],
      hidden: [],
      sections: [],
      topOrder: undefined,
      readOnly: false,
    });
    warn.mockRestore();
  });
});
