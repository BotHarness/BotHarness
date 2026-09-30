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
    IconPaperclipOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconSettingsOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
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
      avatar: '/api/botharness/bot-avatar?slug=ada&v=abcd',
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
    const setBotAvatar = vi.fn(async () => true);
    const profileActivity = vi.fn(async () => ({
      slug: 'ada',
      weeks: 26,
      since: '2026-04-01T00:00:00.000Z',
      events: [] as { day: string; reason: string; count: number }[],
      memoryCommits: [] as { day: string; count: number }[],
      tokens: [] as {
        day: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
      }[],
      tokenTotals: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }));
    const actions = {
      modelCatalog: vi.fn(async () => []),
      modelPresets: vi.fn(async () => []),
      modelPlanState: vi.fn(async () => ({
        plan: {
          revision: 3,
          sourcePresetId: 'preset-1',
          sourcePresetName: '节省成本',
          orchestrator: {
            provider: 'deepseek-official',
            model: 'deepseek-flash',
            reasoningEffort: 'low',
          },
          assignmentDefault: { provider: 'deepseek-official', model: 'deepseek-v4-pro' },
          appliedAt: '2026-09-21T00:00:00.000Z',
        },
      })),
      renameChannel,
      setBotAvatar,
      profileActivity,
      botSourcePolicies: vi.fn(async () => [
        {
          sourceClass: 'human-dm',
          admission: 'admit',
          wake: 'immediate',
          revision: 1,
          lastActor: { kind: 'built-in' },
          changedAt: '2026-09-21T00:00:00.000Z',
        },
      ]),
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
      expect(popover?.textContent).toContain('Token 用量');
      expect(popover?.textContent).toContain('事件活跃');
      expect(popover?.textContent).not.toContain('Memory 提交');
      expect(popover?.textContent).toContain('该时间段暂无记录');
      expect(container.querySelector('.bh-channel-sidebar')).not.toBeNull();

      await act(async () => click(container, '.bh-profile-expand'));
      expect(container.querySelector('.bh-profile-popover')).toBeNull();
      expect(container.querySelector('.bh-profile-view')).not.toBeNull();
      const sections = container.querySelectorAll('.bh-profile-view > .bh-profile-section');
      expect(sections.length).toBe(4);
      expect(sections[0]?.getAttribute('aria-label')).toBe('活动概览');
      expect(sections[1]?.getAttribute('aria-label')).toBe('模型预设');
      expect(sections[2]?.getAttribute('aria-label')).toBe('IM 连接');
      expect(sections[3]?.getAttribute('aria-label')).toBe('提醒策略');
      expect(sections[1]?.querySelector('summary')?.textContent).toContain('节省成本');
      expect(sections[1]?.querySelector('summary')?.textContent).toContain('修订 3');
      const policyDetails = sections[3]?.querySelector<HTMLDetailsElement>(
        '.bh-profile-policy-details',
      );
      expect(policyDetails?.open).toBe(false);
      await act(async () =>
        policyDetails?.querySelector<HTMLElement>('.bh-profile-policy-summary')?.click(),
      );
      expect(policyDetails?.open).toBe(true);
      expect(container.querySelector('.bh-profile-view')?.textContent).toContain('Human 私聊');
      expect(container.querySelector('.bh-profile-view')?.textContent).toContain('修订 1');
      expect(container.querySelector('.bh-chat-body')).toBeNull();
      expect(container.querySelector('.bh-memory-chat-composer')).toBeNull();
      expect(container.querySelector('.bh-profile-view-name')?.textContent).toBe('Ada');
      expect(container.querySelectorAll('.bh-profile-heat-grid').length).toBe(2);
      expect(container.querySelectorAll('.bh-profile-bar-chart').length).toBe(1);
      expect(container.querySelectorAll('.bh-profile-avatar-button').length).toBe(1);
      expect(container.querySelectorAll('.bh-profile-card').length).toBe(7);
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

      const heatCell = container.querySelector<HTMLElement>(
        '.bh-profile-heat-cell:not([data-level="future"])',
      );
      await act(async () => {
        heatCell?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-heat-tip')?.textContent).toContain('次');
      await act(async () => {
        heatCell?.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
      });
      expect(container.querySelector('.bh-profile-heat-tip')).toBeNull();
      await act(async () => {
        heatCell?.focus();
      });
      expect(container.querySelector('.bh-profile-heat-tip')?.textContent).toContain('次');
      await act(async () => {
        heatCell?.blur();
      });
      expect(container.querySelector('.bh-profile-heat-tip')).toBeNull();

      await act(async () => click(container, '.bh-profile-avatar-actions button:last-child'));
      expect(setBotAvatar).toHaveBeenCalledWith('dm-ada', null);
      expect(container.querySelector('.bh-profile-avatar-input')).not.toBeNull();

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

  it('keeps the group header island as the Group Profile trigger', async () => {
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
      expect(island?.getAttribute('aria-label')).toBe('打开 设计组 的群聊 Profile');
      expect(island?.getAttribute('aria-haspopup')).toBe('dialog');
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

describe('Profile activity windows', () => {
  it('anchors the token sparkline and heatmaps to the Host calendar day', async () => {
    const { trailingProfileDays } = await import('../src/client/profile-cards-builtins.js');
    expect(trailingProfileDays('2026-09-29', 3)).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
    ]);
    expect(trailingProfileDays('2026-01-02', 3)).toEqual([
      '2025-12-31',
      '2026-01-01',
      '2026-01-02',
    ]);
    expect(trailingProfileDays(undefined, 3)).toHaveLength(3);
  });
});

describe('Token chart', () => {
  it('computes cached read and output shares', async () => {
    const { tokenShares, formatTokenCount } =
      await import('../src/client/profile-cards-builtins.js');
    expect(tokenShares({ cached: 97, uncached: 3, output: 25 })).toEqual({
      read: 100,
      output: 25,
      cachedPercent: 97,
      outputPercent: 20,
    });
    expect(tokenShares({ cached: 0, uncached: 0, output: 0 })).toEqual({
      read: 0,
      output: 0,
      cachedPercent: 0,
      outputPercent: 0,
    });
    expect(formatTokenCount(254_316)).toBe('254.3K');
  });
});
