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
