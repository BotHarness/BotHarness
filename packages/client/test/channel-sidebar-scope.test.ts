// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronDownOutlineRegular: () => null,
  Button: ({ children }: { children: string }) => createElement('button', null, children),
}));

import { createChannelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { useChannelSidebar } from '../src/client/channel-sidebar-view.js';
import { resolveSidebarBotSlug } from '../src/client/channel-sidebar.js';
import type { ClientState } from '../src/client/store.js';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

function dmChannel(id: string, botSlug: string): unknown {
  return { id, type: 'dm', botSlug, name: botSlug };
}

function stateFor(selection: unknown, channel: unknown): ClientState {
  return { selection, conversation: { channel } } as ClientState;
}

describe('resolveSidebarBotSlug', () => {
  it('resolves a directly selected bot', () => {
    expect(resolveSidebarBotSlug(stateFor({ kind: 'bot', slug: 'bot-a' }, undefined))).toBe(
      'bot-a',
    );
  });

  it('resolves a selected bot DM channel to its bot', () => {
    expect(
      resolveSidebarBotSlug(
        stateFor({ kind: 'channel', channelId: 'dm-1' }, dmChannel('dm-1', 'bot-a')),
      ),
    ).toBe('bot-a');
  });

  it('ignores a DM that does not match the selection', () => {
    expect(
      resolveSidebarBotSlug(
        stateFor({ kind: 'channel', channelId: 'dm-1' }, dmChannel('dm-2', 'bot-a')),
      ),
    ).toBeUndefined();
  });

  it('ignores group channels and empty selections', () => {
    expect(
      resolveSidebarBotSlug(
        stateFor({ kind: 'channel', channelId: 'group-1' }, { id: 'group-1', type: 'group' }),
      ),
    ).toBeUndefined();
    expect(resolveSidebarBotSlug(stateFor(undefined, undefined))).toBeUndefined();
  });
});

function ScopeHarness({ state }: { state: ClientState }): ReactElement {
  const controller = useChannelSidebar(state, createChannelSidebarPrefs(undefined));
  return createElement('output', null, controller.scopeKey ?? '');
}

describe('channel sidebar scope for bot DM channels', () => {
  it('uses the personabot scope when a bot DM channel is selected', async () => {
    const state = stateFor({ kind: 'channel', channelId: 'dm-1' }, dmChannel('dm-1', 'bot-a'));
    await act(async () => root.render(createElement(ScopeHarness, { state })));
    expect(host.querySelector('output')?.textContent).toBe('personabot:bot-a');
  });

  it('keeps the channel scope for group channels', async () => {
    const state = stateFor(
      { kind: 'channel', channelId: 'group-1' },
      { id: 'group-1', type: 'group' },
    );
    await act(async () => root.render(createElement(ScopeHarness, { state })));
    expect(host.querySelector('output')?.textContent).toBe('channel:group-1');
  });
});
