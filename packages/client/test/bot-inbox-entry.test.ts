// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: stub,
    Input: stub,
    Tag,
    Modal: stub,
    StateDot: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { channelSidebarPrefs } from '../src/client/channel-sidebar-prefs.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type BotAttentionItem } from '../src/client/store.js';

const item: BotAttentionItem = {
  id: 'source-1',
  botSlug: 'ada',
  reason: 'group-mention',
  state: 'pending',
  createdAt: '2026-09-26T00:00:00.000Z',
  sourceKind: 'human-message',
  sourceChannelId: 'group-team',
  sourceChannelName: 'Team',
  sourceMessageId: 'm1',
  sourceAvailable: true,
  authorKind: 'human',
  summary: 'Please check this',
};

describe('DM Bot Inbox sidebar entry', () => {
  it('appears only with facts, groups by source, and opens the source message', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    );
    expect(entry).toBeDefined();
    store.setBotInbox({ status: 'ready', items: [], error: undefined });
    expect(entry?.visible?.(store.getSnapshot())).toBe(false);
    store.setBotInbox({
      status: 'ready',
      items: [item, { ...item, id: 'source-2', state: 'handled', sourceMessageId: 'm2' }],
      error: undefined,
    });
    expect(entry?.visible?.(store.getSnapshot())).toBe(true);
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openChannel = vi.fn(async () => undefined);
    const openAround = vi.fn(async () => undefined);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry: entry!,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: { openChannel, openAround } as unknown as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(container.textContent).toContain('Team');
      expect(container.textContent).toContain('待处理');
      expect(container.textContent).toContain('已处理 · 1');
      const button = [...container.querySelectorAll<HTMLButtonElement>('.bh-inbox-item')].find(
        (node) => node.textContent?.includes('Please check this'),
      );
      expect(button).toBeDefined();
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
      expect(openChannel).toHaveBeenCalledWith('group-team');
      expect(openAround).toHaveBeenCalledWith('group-team', 'm1');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });

  it('keeps an unavailable source readable without a broken action', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, sourceAvailable: false }],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: {} as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(container.querySelector<HTMLButtonElement>('.bh-inbox-item')?.disabled).toBe(true);
      expect(container.textContent).toContain('来源不可打开');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
  it('opens an Assignment report in the existing Assignment sidebar entry', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const scopeKey = 'personabot:ada';
    const expanded = channelSidebarPrefs.isEntryExpanded(scopeKey, 'assignments');
    const collapsed = channelSidebarPrefs.isSidebarCollapsed(scopeKey);
    channelSidebarPrefs.setEntryExpanded(scopeKey, 'assignments', false);
    store.setBotInbox({
      status: 'ready',
      items: [
        {
          id: 'report-1',
          botSlug: 'ada',
          reason: 'assignment-report',
          state: 'handled',
          createdAt: '2026-09-26T00:00:00.000Z',
          sourceKind: 'assignment-report',
          assignmentSessionId: 'assignment-one',
          assignmentPurpose: 'Investigate the issue',
          assignmentReportState: 'waiting-human',
          sourceAvailable: true,
          authorKind: 'system',
          summary: 'Need a Human decision',
        },
      ],
      error: undefined,
    });
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const openAssignment = vi.fn(async () => undefined);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelSidebarEntrySection, {
            entry,
            expanded: true,
            onToggle: () => undefined,
            entryProps: {
              scope: 'personabot',
              channelId: 'dm-ada',
              botSlug: 'ada',
              actions: { openAssignment } as unknown as BridgeActions,
              t: zhTranslate,
            },
          }),
        ),
      );
      expect(container.textContent).toContain('Investigate the issue');
      expect(container.textContent).toContain('等待 Human');
      const button = container.querySelector<HTMLButtonElement>('.bh-inbox-item');
      expect(button?.disabled).toBe(false);
      await act(async () => {
        button?.click();
        await Promise.resolve();
      });
      expect(openAssignment).toHaveBeenCalledWith('assignment-one');
      expect(channelSidebarPrefs.isEntryExpanded(scopeKey, 'assignments')).toBe(true);
      expect(channelSidebarPrefs.isSidebarCollapsed(scopeKey)).toBe(false);
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
      channelSidebarPrefs.setEntryExpanded(scopeKey, 'assignments', expanded);
      channelSidebarPrefs.setSidebarCollapsed(scopeKey, collapsed);
    }
  });
});
