import { describe, expect, it } from 'vitest';

import { createActions } from '../src/client/actions.js';
import {
  createBridgeCall,
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
  tag: '研究',
  aggregateState: 'working',
  workspaces: ['/srv/ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
};

const GROUP = {
  id: 'group-team',
  type: 'group',
  name: 'Team',
  members: ['ada'],
  createdAt: '2026-09-19T00:00:00.000Z',
  updatedAt: '2026-09-19T00:00:00.000Z',
};

const DM = {
  id: 'dm-ada',
  type: 'dm',
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
  it('drops malformed channels and keeps botSlug only when present', () => {
    const channels = parseChannelRecords({
      channels: [GROUP, DM, { id: 'bad', type: 'nope', name: 'x' }, null],
    });

    expect(channels).toHaveLength(2);
    expect(channels[0]).toMatchObject({ id: 'group-team', type: 'group' });
    expect(channels[1]).toMatchObject({ id: 'dm-ada', botSlug: 'ada' });
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
    const call = bridgeCall({
      list: () => ({ bots: [BOT] }),
      channels: () => ({ channels: [GROUP, DM] }),
      channelDm: () => ({ channel: DM }),
      channelMessages: () => ({
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
      sessions: () => ({
        sessions: [
          { id: 's1', title: '研究', cwd: '/srv/ada', updatedAt: '2026-09-19T00:00:00.000Z' },
        ],
      }),
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
    expect(state.sessions.items.map((session) => session.id)).toEqual(['s1']);
  });

  it('sends a message, appends it locally, and mirrors the channel updatedAt', async () => {
    const { clientStore, actions } = setup();
    await actions.load();
    await actions.openBot('ada');

    const sent = await actions.send('hello');
    const state = clientStore.getSnapshot();

    expect(sent).toBe(true);
    expect(state.conversation.sending).toBe(false);
    expect(state.conversation.messages.at(-1)).toMatchObject({ body: 'hello' });
    expect(state.channels.find((channel) => channel.id === 'dm-ada')?.updatedAt).toBe(
      '2026-09-19T00:03:00.000Z',
    );
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
});
