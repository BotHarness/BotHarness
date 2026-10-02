// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  StateDot: () => null,
  Input: () => null,
  Button: () => null,
  MarkdownText: () => null,
  Modal: () => null,
}));
vi.mock('../src/client/bot-sidebar.js', async () => {
  const { useSyncExternalStore } = await import('react');
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => useSyncExternalStore(store.subscribe, store.getSnapshot) };
});
import { ActivityCenterView } from '../src/client/activity-center-view.js';
import { createActions } from '../src/client/actions.js';
import { store } from '../src/client/store.js';
it('shows Overview and routes a Session to native navigation while Bot opens DM', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const openSession = vi.fn();
  const actions = createActions(
    async (endpoint) => {
      if (endpoint === 'activityOverview')
        return {
          ok: true,
          value: {
            actionCount: 4,
            bots: [
              {
                slug: 'ada',
                displayName: 'Ada',
                paused: false,
                state: 'working',
                sessions: [
                  {
                    sessionId: 'assignment-1',
                    role: 'assignment',
                    state: 'working',
                    purpose: 'Prepare release',
                  },
                ],
              },
            ],
          },
        };
      if (endpoint === 'humanAttentionStatus')
        return { ok: true, value: { unreadCount: 12, hasAction: true } };
      throw new Error('Unexpected ' + endpoint);
    },
    store,
    {
      pickDirectory: async () => null,
      createWorkspace: async () => ({ workspaceId: 'w' }),
      openSession,
    },
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      await actions.openActivityCenter();
      root.render(createElement(ActivityCenterView, { actions }));
    });
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('Prepare release');
    const session = container.querySelector('[data-session-id="assignment-1"] button')!;
    await act(async () => {
      session.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(openSession).toHaveBeenCalledWith('assignment-1');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.select(undefined);
  }
});

it('drops late Overview responses after switching to Inbox and reconciles completed Sessions', async () => {
  const { createStore } = await import('../src/client/store.js');
  const local = createStore();
  let settle: (value: {
    ok: true;
    value: { actionCount: number; bots: never[] };
  }) => void = () => {};
  let delayed = true;
  const actions = createActions(async (endpoint) => {
    if (endpoint === 'humanAttentionStatus')
      return { ok: true, value: { unreadCount: 0, hasAction: false } };
    if (endpoint === 'humanAttention') return { ok: true, value: { items: [] } };
    if (endpoint === 'activityOverview')
      return delayed
        ? new Promise((done) => {
            settle = (value) => done(value);
          })
        : {
            ok: true,
            value: {
              actionCount: 0,
              bots: [
                { slug: 'ada', displayName: 'Ada', state: 'idle', paused: false, sessions: [] },
              ],
            },
          };
    throw new Error(endpoint);
  }, local);
  const opening = actions.openActivityCenter();
  await actions.openHumanInbox();
  settle({ ok: true, value: { actionCount: 2, bots: [] } });
  await opening;
  expect(local.getSnapshot().overview.value).toBeUndefined();
  delayed = false;
  await actions.openActivityCenter('overview');
  expect(local.getSnapshot().overview.value).toMatchObject({
    actionCount: 0,
    bots: [{ slug: 'ada', sessions: [] }],
  });
});

it('returns to the last Activity Center tab after DM navigation and a new client', async () => {
  const { createStore } = await import('../src/client/store.js');
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const call = async (endpoint: string) => ({
    ok: true as const,
    value:
      endpoint === 'humanAttentionStatus'
        ? { unreadCount: 0, hasAction: false }
        : endpoint === 'activityOverview'
          ? { actionCount: 0, bots: [] }
          : { items: [] },
  });
  const local = createStore();
  const actions = createActions(call, local, undefined, storage);
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
  await actions.openHumanInbox();
  local.select({ kind: 'channel', channelId: 'dm-ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
  const reloaded = createStore();
  const next = createActions(call, reloaded, undefined, storage);
  await next.openActivityCenter();
  expect(reloaded.getSnapshot().selection).toEqual({ kind: 'inbox' });
  await next.openActivityCenter('overview');
  reloaded.select({ kind: 'bot', slug: 'ada' });
  await next.openActivityCenter();
  expect(reloaded.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
});

it('keeps the explicit tab in memory when storage still returns an older tab and rejects writes', async () => {
  const { createStore } = await import('../src/client/store.js');
  const storage = {
    getItem: () => 'inbox',
    setItem: () => {
      throw new Error('storage refused');
    },
  };
  const call = async (endpoint: string) => ({
    ok: true as const,
    value:
      endpoint === 'humanAttentionStatus'
        ? { unreadCount: 0, hasAction: false }
        : endpoint === 'activityOverview'
          ? { actionCount: 0, bots: [] }
          : { items: [] },
  });
  const local = createStore();
  const actions = createActions(call, local, undefined, storage);
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
  await actions.openActivityCenter('overview');
  local.select({ kind: 'channel', channelId: 'dm-ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox', view: 'overview' });
  await actions.openHumanInbox();
  local.select({ kind: 'bot', slug: 'ada' });
  await actions.openActivityCenter();
  expect(local.getSnapshot().selection).toEqual({ kind: 'inbox' });
});
