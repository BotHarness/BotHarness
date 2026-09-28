// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: stub,
    HoverCard: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconChevronLeftOutlineRegular: stub,
    IconChevronRightOutlineRegular: stub,
    IconCloseFillRegular: stub,
    IconCloseOutlineRegular: stub,
    IconCopyOutlineRegular: stub,
    IconEditOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    Input: stub,
    MarkdownText: stub,
    Menu: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Switch: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { zhTranslate } from '../src/client/locale.js';
import { createProfileCardBuiltins } from '../src/client/profile-cards-builtins.js';
import { createProfileCardRegistry } from '../src/client/profile-cards.js';
import { store } from '../src/client/store.js';

function sidebarRegistry() {
  const registry = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
  return registry;
}

function profileCardRegistry() {
  const registry = createProfileCardRegistry();
  for (const card of createProfileCardBuiltins(zhTranslate)) registry.register(card);
  return registry;
}

function setNativeValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function click(container: HTMLElement, selector: string): void {
  const element = container.querySelector<HTMLElement>(selector);
  expect(element, selector).not.toBeNull();
  element?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('PersonaBot Profile surface', () => {
  it('opens from the DM avatar, expands into the Channel body, and edits the name', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot();
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: ['研究员'],
      description: '与你一起发布研究。',
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'bot-ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      sending: false,
    });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const renameChannel = vi.fn(async () => true);
    const profileActivity = vi.fn(async () => ({
      slug: 'ada',
      weeks: 26,
      since: '2026-04-01T00:00:00.000Z',
      events: [] as { day: string; reason: string; count: number }[],
      memoryCommits: [] as { day: string; count: number }[],
    }));
    const actions = {
      renameChannel,
      profileActivity,
      refreshBotInbox: vi.fn(async () => undefined),
    } as unknown as BridgeActions;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = (): void => {
      root.render(
        createElement(BotMain, {
          actions,
          channelSidebar: sidebarRegistry(),
          profileCards: profileCardRegistry(),
          t: zhTranslate,
        }),
      );
    };
    try {
      await act(async () => render());
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
      expect(container.querySelector('.bh-chat-body')).not.toBeNull();

      await act(async () => click(container, '.bh-channel-island'));
      const popover = container.querySelector('.bh-profile-popover');
      expect(popover).not.toBeNull();
      expect(popover?.textContent).toContain('Ada');
      expect(popover?.textContent).toContain('研究员');
      expect(popover?.textContent).toContain('与你一起发布研究。');
      expect(popover?.textContent).toContain('查看详细');
      expect(popover?.textContent).toContain('事件活跃');
      expect(popover?.textContent).toContain('Memory 提交');
      expect(popover?.textContent).toContain('该时间段暂无记录');
      expect(container.querySelector('.bh-channel-sidebar')).not.toBeNull();

      await act(async () => click(container, '.bh-profile-expand'));
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
      expect(container.querySelector('.bh-profile-view')).not.toBeNull();
      expect(container.querySelector('.bh-chat-body')).toBeNull();
      expect(container.querySelector('.bh-memory-chat-composer')).toBeNull();
      expect(container.querySelector('.bh-profile-view-name')?.textContent).toBe('Ada');
      expect(container.querySelectorAll('.bh-profile-heat-grid').length).toBe(2);
      expect(container.querySelectorAll('.bh-profile-card').length).toBe(3);
      expect(container.querySelectorAll('.bh-profile-pin[aria-pressed="true"]').length).toBe(2);

      await act(async () => click(container, '.bh-profile-edit'));
      const input = container.querySelector<HTMLInputElement>('.bh-name-input');
      expect(input).not.toBeNull();
      expect(input?.value).toBe('Ada');

      await act(async () => {
        if (input !== null) setNativeValue(input, '  ');
      });
      expect(
        container.querySelector<HTMLButtonElement>('.bh-profile-action-primary')?.disabled,
      ).toBe(true);

      await act(async () => {
        if (input !== null) setNativeValue(input, 'Bea');
      });
      const form = container.querySelector<HTMLFormElement>('.bh-profile-name-edit');
      await act(async () => {
        form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(renameChannel).toHaveBeenCalledWith('dm-ada', 'Bea');
      expect(container.querySelector('.bh-name-input')).toBeNull();

      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-view')).toBeNull();
      expect(container.querySelector('.bh-chat-body')).not.toBeNull();

      await act(async () => click(container, '.bh-channel-island'));
      expect(container.querySelector('.bh-profile-popover')).not.toBeNull();
      await act(async () => {
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
    }
  });

  it('keeps the group header island as the single sidebar toggle', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-design',
      type: 'group' as const,
      name: '设计组',
      members: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({ status: 'ready', channel, messages: [], sending: false });
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(
          createElement(BotMain, {
            actions: {} as BridgeActions,
            channelSidebar: sidebarRegistry(),
            t: zhTranslate,
          }),
        );
      });
      const island = container.querySelector('.bh-channel-island');
      expect(island?.tagName).toBe('BUTTON');
      expect(island?.getAttribute('aria-label')).toBe('设计组 — 收起 Channel sidebar');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
    }
  });
});
