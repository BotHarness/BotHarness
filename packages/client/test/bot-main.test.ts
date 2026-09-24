import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    Input: stub,
    Menu: stub,
    MarkdownText: stub,
    Modal: stub,
    StateDot: stub,
    Tag,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain, committedMessageIds } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';

describe('Channel read position candidates', () => {
  it('ignores optimistic echoes and process-only streaming drafts', () => {
    const committed: ChannelMessage = {
      id: 'm1',
      at: '2026-09-19T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Hello',
    };
    expect([
      ...committedMessageIds([
        committed,
        { ...committed, id: 'local-echo-1', pending: true },
        { ...committed, id: 'local-failed-1', failed: 'network disconnected' },
        { ...committed, id: 'draft-1', streaming: true },
      ]),
    ]).toEqual(['m1']);
  });
});

const entryProps = {
  scope: 'personabot' as const,
  channelId: 'dm-ada',
  botSlug: 'ada',
  actions: {} as BridgeActions,
  t: zhTranslate,
};

function sidebarRegistry() {
  const registry = createChannelSidebarRegistry();
  for (const entry of createChannelSidebarBuiltins(zhTranslate)) registry.register(entry);
  return registry;
}

describe('Bot main Assignment pane', () => {
  it('shows Assignment items and the selected read-only report beside a DM', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const assignment = {
      sessionId: 'assignment-1',
      botSlug: 'ada',
      sourceEventId: 'source-1',
      purpose: '研究发布状态',
      activity: 'idle' as const,
      latestReport: {
        state: 'completed' as const,
        summary: '发布状态正常',
        at: '2026-09-21T00:01:00.000Z',
      },
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    store.setAssignments({
      status: 'ready',
      items: [assignment],
      selected: assignment,
      error: undefined,
    });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );

    expect(markup).toContain('事项');
    expect(markup).toContain('收起 Channel sidebar');
    expect(markup).toContain('class="bh-channel-island"');
    expect(markup).toContain('aria-label="Ada — 收起 Channel sidebar"');
    expect(markup).toContain('aria-controls="bh-channel-sidebar"');
    expect(markup).toContain('class="bh-chat-top-fade"');
    expect(markup).not.toContain('研究发布状态');
    expect(markup).not.toContain('Ada 空闲');
    expect(markup).not.toContain('bh-composer-activity-status');
  });

  it('shows a group Channel name in the same sidebar-opening island', () => {
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
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    store.setAssignments({ status: 'ready', items: [], selected: undefined, error: undefined });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );

    expect(markup).toContain('class="bh-channel-island"');
    expect(markup).toContain('aria-label="设计组 — 收起 Channel sidebar"');
    expect(markup).toContain('aria-controls="bh-channel-sidebar"');

    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
    store.setAssignments(previous.assignments);
  });

  it('renders an expanded entry body from the registered entry', () => {
    const assignments = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'assignments',
    );
    expect(assignments).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: assignments!,
        expanded: true,
        onToggle: () => undefined,
        entryProps,
      }),
    );

    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('研究发布状态');
    expect(markup).toContain('发布状态正常');
    expect(markup).toContain('Assignment Session');
    expect(markup).not.toContain('Orchestrator Session');
    expect(markup).toContain('1');
  });

  it('renders a collapsed entry header without its body', () => {
    const assignments = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'assignments',
    );
    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: assignments!,
        expanded: false,
        onToggle: () => undefined,
        entryProps,
      }),
    );

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('事项');
    expect(markup).not.toContain('研究发布状态');
  });

  it('marks a locally echoed Human message as pending until the Host commits it', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
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
      messages: [
        {
          id: 'local-echo-1',
          at: '2026-09-21T00:02:00.000Z',
          author: { kind: 'human' },
          body: 'hello',
          pending: true,
        },
      ],
      error: undefined,
      sending: true,
    });
    store.setAssignments({ status: 'ready', items: [], selected: undefined, error: undefined });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );
    expect(markup).toContain('bh-bubble-pending');
    expect(markup).toContain('发送中');
    expect(markup).toContain('hello');
    expect(markup).not.toContain('bh-message-group-avatar');
  });

  it('keeps a failed Human bubble with an explicit restore affordance', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
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
      messages: [
        {
          id: 'local-failed-1',
          at: '2026-09-21T00:02:00.000Z',
          author: { kind: 'human' },
          body: 'hello',
          failed: 'network disconnected',
        },
      ],
      error: undefined,
      sending: false,
    });
    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );
    expect(markup).toContain('hello');
    expect(markup).toContain('bh-bubble-failed');
    expect(markup).toContain('发送失败');
    expect(markup).not.toContain('发送中');
  });
  it('renders adjacent Bot messages as one group with a bottom avatar and one timestamp', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle',
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
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
      sending: false,
      focusMessageId: 'b1',
      messages: [
        {
          id: 'b1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'first',
        },
        {
          id: 'b2',
          at: '2026-09-21T00:01:05.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'second',
        },
      ],
    });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );
    expect(markup).toContain('data-group-size="2"');
    expect(markup).toContain('data-group-position="first"');
    expect(markup).toContain('data-group-position="last"');
    expect(markup.match(/class="bh-message-group-avatar"/g)).toHaveLength(1);
    expect(markup.match(/class="bh-bubble-time"/g)).toHaveLength(1);
    expect(markup).toContain('bh-bubble-focused');
  });
  it('renders a linked reply summary and safely degrades when the original is gone', () => {
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: '2026-09-21T00:00:00.000Z',
    };
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: bot.createdAt,
      updatedAt: bot.createdAt,
    };
    const reply: ChannelMessage = {
      id: 'm2',
      at: bot.createdAt,
      author: { kind: 'human' },
      body: 'answer',
      replyTo: 'm1',
      replyToPreview: { author: { kind: 'bot', slug: 'ada' }, body: 'original summary' },
    };
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({ status: 'ready', channel, messages: [reply], sending: false });
    const render = () =>
      renderToStaticMarkup(
        createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
      );
    const linked = render();
    expect(linked).toContain('class="bh-bubble-reply"');
    expect(linked).toContain('original summary');
    expect(linked).toContain('bh-bubble-reply-author');

    store.setConversation({ messages: [{ ...reply, replyToPreview: null }] });
    const unavailable = render();
    expect(unavailable).toContain('bh-bubble-reply-unavailable');
    expect(unavailable).not.toContain('class="bh-bubble-reply"');
  });
});
