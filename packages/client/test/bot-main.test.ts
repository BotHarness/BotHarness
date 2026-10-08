// @vitest-environment jsdom
import { act, createElement, type PropsWithChildren } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    IconCodeOutlineRegular: () => null,
    IconBranchOutlineRegular: () => null,
    Button: stub,
    IconAgentPresetOutlineRegular: stub,
    IconCheckOutlineRegular: stub,
    IconChevronDownOutlineRegular: stub,
    IconCloseFill14: stub,
    IconCopyOutlineRegular: stub,
    IconCloseOutlineRegular: stub,
    IconEllipsisOutlineRegular: stub,
    IconFolderCloseRegular: stub,
    IconFolderOpenRegular: stub,
    IconFolderOpenOutlineRegular: stub,
    IconNewChatOutlineRegular: stub,
    IconPanelLeftOutlineRegular: stub,
    IconPaperclipOutlineRegular: stub,
    IconPlusOutlineRegular: stub,
    IconRefreshOutlineRegular: stub,
    IconSearchOutlineRegular: stub,
    IconSendOutlineRegular: stub,
    IconPinFillRegular: stub,
    IconPinOutlineRegular: stub,
    IconTrashOutlineRegular: stub,
    FileTypeIcon: stub,
    ImageLightbox: stub,
    Input: stub,
    Menu: stub,
    MenuItemButton: stub,
    MarkdownText: stub,
    Modal: stub,
    SegmentedControl: stub,
    StateDot: stub,
    Tag,
    Tooltip: ({ children }: PropsWithChildren) => children,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotModePrefs } from '../src/client/bot-mode-prefs.js';
import { BotMain, committedMessageIds, resolvedGrantRequestIds } from '../src/client/bot-main.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { createChannelSidebarRegistry } from '../src/client/channel-sidebar.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { WindowCompanions } from '../src/client/window-companions.js';

describe('Channel read position candidates', () => {
  it('does not resolve a Grant request from a pending or failed local echo', () => {
    const response: ChannelMessage = {
      id: 'human-approved',
      at: '2026-09-26T00:00:00.000Z',
      author: { kind: 'human' },
      body: 'Workspace authorized.',
      replyTo: 'grant-request',
      grantRequestResolution: { requestMessageId: 'grant-request', grantId: 'grant-1' },
    };
    expect([...resolvedGrantRequestIds([{ ...response, pending: true }])]).toEqual([]);
    expect([...resolvedGrantRequestIds([{ ...response, failed: 'network disconnected' }])]).toEqual(
      [],
    );
    expect([...resolvedGrantRequestIds([response])]).toEqual(['grant-request']);
  });

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

describe('Bot main Sessions pane', () => {
  it('keeps the docked Channel sidebar present on every state update while switching Channels', () => {
    const previous = store.getSnapshot();
    const first = {
      id: 'group-first',
      type: 'group' as const,
      name: 'First',
      members: [],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    };
    const second = { ...first, id: 'group-second', name: 'Second' };
    const bot = {
      slug: 'ada',
      displayName: 'Ada',
      roles: [],
      aggregateState: 'idle' as const,
      workspaces: [],
      createdAt: first.createdAt,
    };
    const registry = sidebarRegistry();
    const render = () =>
      renderToStaticMarkup(
        createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: registry }),
      );

    store.setRoster([bot], [first, second]);
    store.select({ kind: 'channel', channelId: first.id });
    store.setConversation({ status: 'ready', channel: first });
    const renders: string[] = [];
    const unsubscribe = store.subscribe(() => renders.push(render()));
    try {
      store.select({ kind: 'channel', channelId: second.id });
      store.setConversation({ status: 'loading', channel: second });
      store.select({ kind: 'bot', slug: bot.slug });
      store.setConversation({ status: 'loading', channel: undefined });
      expect(renders).toHaveLength(4);
      expect(renders.every((markup) => markup.includes('id="bh-channel-sidebar"'))).toBe(true);
      expect(renders.every((markup) => markup.includes('aria-expanded="true"'))).toBe(true);
    } finally {
      unsubscribe();
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
      store.setSessions(previous.sessions);
      store.setBotInbox(previous.botInbox);
      store.setHumanInbox(previous.humanInbox);
    }
  });

  it('shows separately focusable companion and Profile actions beside the DM title and Sessions', async () => {
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
      name: 'bot-ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    const previous = store.getSnapshot();
    store.setRoster([bot], [channel]);
    store.select({ kind: 'bot', slug: 'ada' });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [],
      error: undefined,
      sending: false,
    });
    store.setSessions({
      status: 'ready',
      items: [
        {
          sessionId: 'orchestrator-1',
          role: 'orchestrator',
          createdAt: '2026-09-21T00:00:00.000Z',
        },
      ],
      error: undefined,
    });

    const companion = new WindowCompanions({
      context: async () => ({ profileId: 'dm-header-qa' }),
      source: () => ({ addEventListener() {}, close() {} }),
      update: async () => {},
    });
    await companion.start();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    await act(() =>
      root.render(
        createElement(BotMain, {
          actions: {
            modelPlanState: async () => undefined,
            botSourcePolicies: async () => [],
          } as unknown as BridgeActions,
          channelSidebar: sidebarRegistry(),
          companion,
        }),
      ),
    );
    const markup = node.innerHTML;
    expect(markup).toContain('class="bh-companion-pin"');
    expect(markup).toContain('aria-label="' + zhTranslate('companion.show') + ' · Ada"');
    expect(node.querySelector('button button')).toBeNull();
    const pin = node.querySelector<HTMLButtonElement>('.bh-companion-pin')!;
    await act(() => pin.click());
    expect(companion.get('ada')).toBeDefined();
    expect(pin.getAttribute('aria-pressed')).toBe('true');
    await act(() => root.unmount());
    node.remove();

    expect(markup).toContain('会话');
    expect(markup).toContain('收起 Channel sidebar');
    expect(markup).toContain('class="bh-channel-island"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('aria-label="打开 Ada 的 PersonaBot Profile"');
    expect(markup).toContain('<span class="bh-title">Ada</span>');
    expect(markup).not.toContain('bh-channel-sidebar-title');
    expect(markup).toContain('class="bh-chat-top-fade"');
    expect(markup).not.toContain('研究发布状态');
    expect(markup).not.toContain('Ada 空闲');
    expect(markup).not.toContain('bh-composer-activity-status');

    const beforeChannelSelection = store.getSnapshot();
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation(beforeChannelSelection.conversation);
    const channelMarkup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );
    expect(channelMarkup).toContain('<span class="bh-title">Ada</span>');
    expect(channelMarkup).not.toContain('bh-channel-sidebar-title');
    store.select(beforeChannelSelection.selection);
    store.setConversation(beforeChannelSelection.conversation);
    store.setSessions(previous.sessions);
    companion.dispose();
  });

  it('opens Group Profile from the group Channel header', () => {
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
    store.setSessions({ status: 'ready', items: [], error: undefined });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );

    expect(markup).toContain('class="bh-channel-island bh-group-channel-header"');
    expect(markup).toContain('class="bh-group-channel-name"');
    expect(markup).toContain('aria-label="打开 设计组 的群聊 Profile"');
    expect(markup).toContain('aria-haspopup="dialog"');
    expect(markup).toContain('<span class="bh-title">设计组</span>');

    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
    store.setSessions(previous.sessions);
  });

  it('renders native Session title, role and workspace in the expanded entry', () => {
    store.setSessions({
      status: 'ready',
      items: [
        {
          sessionId: 'orchestrator-1',
          role: 'orchestrator',
          createdAt: '2026-09-21T00:00:00.000Z',
        },
      ],
      error: undefined,
    });
    const native = {
      subscribe: () => () => undefined,
      getSnapshot: () => ({
        ids: ['orchestrator-1'],
        byId: {
          'orchestrator-1': {
            displayTitle: 'Plan release',
            cwd: '/srv/ada',
            updatedAt: Date.parse('2026-09-21T00:01:00.000Z'),
            running: true,
          },
        },
      }),
    };
    const sessions = createChannelSidebarBuiltins(zhTranslate, undefined, native).find(
      (entry) => entry.id === 'sessions',
    );
    expect(sessions).toBeDefined();

    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: sessions!,
        expanded: true,
        onToggle: () => undefined,
        entryProps,
      }),
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('Plan release');
    expect(markup).toContain('Orchestrator');
    expect(markup).toContain('ada');
    expect(markup).not.toContain('事项');
  });

  it('renders a collapsed Sessions header without its body', () => {
    const sessions = createChannelSidebarBuiltins(zhTranslate).find(
      (entry) => entry.id === 'sessions',
    );
    const markup = renderToStaticMarkup(
      createElement(ChannelSidebarEntrySection, {
        entry: sessions!,
        expanded: false,
        onToggle: () => undefined,
        entryProps,
      }),
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('会话');
    expect(markup).not.toContain('Plan release');
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
    store.setSessions({ status: 'ready', items: [], error: undefined });

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
  it('keeps a Bot DM read-only when its stored member list is incomplete', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'bot-dm-ada-bea',
      type: 'dm' as const,
      name: 'Ada ↔ Bea',
      members: ['ada'],
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:01:00.000Z',
    };
    store.setRoster([], [channel]);
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({
      status: 'ready',
      channel,
      messages: [
        {
          id: 'bot-message-1',
          at: '2026-09-21T00:01:00.000Z',
          author: { kind: 'bot', slug: 'ada' },
          body: 'hello',
        },
      ],
      sending: false,
    });

    const markup = renderToStaticMarkup(
      createElement(BotMain, { actions: {} as BridgeActions, channelSidebar: sidebarRegistry() }),
    );
    expect(markup).toContain('bh-bot-dm-readonly');
    expect(markup).not.toContain('class="bh-memory-chat-composer"');
    expect(markup).not.toContain('aria-label="回复"');

    store.setRoster(previous.bots, previous.channels);
    store.select(previous.selection);
    store.setConversation(previous.conversation);
  });
  it('keeps external provenance in an author dialog control outside the unchanged bubble', () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'group-source',
      type: 'group' as const,
      name: 'Team',
      members: [],
      createdAt: '2026-10-03T00:00:00Z',
      updatedAt: '2026-10-03T00:00:00Z',
    };
    try {
      store.setRoster([], [channel]);
      store.select({ kind: 'channel', channelId: channel.id });
      store.setConversation({
        status: 'ready',
        channel,
        sending: false,
        messages: [
          {
            id: 'source',
            at: channel.createdAt,
            author: { kind: 'bridged', source: 'Alex' },
            body: 'original external text',
            format: 'text',
            bridgeOrigin: {
              sourceEventId: 'source-event-id',
              platform: 'feishu',
              conversationId: 'conversation-id',
              conversationName: 'QA group',
              messageId: 'external-message-id',
              senderId: 'sender-private-id',
              senderName: 'Alex',
            },
          },
        ],
      });
      const markup = renderToStaticMarkup(
        createElement(BotMain, {
          actions: {} as BridgeActions,
          channelSidebar: sidebarRegistry(),
        }),
      );
      expect(markup).toMatch(
        /aria-haspopup="dialog"[^>]*>Alex · 【Lark\/飞书 QA group】<\/button>.*class="bh-bubble"/,
      );
      expect(markup).toContain('original external text');
      expect(markup).not.toContain('sender-private-id');
      expect(markup).not.toContain('source-event-id');
      expect(markup).not.toContain('bh-external-details');
    } finally {
      store.setRoster(previous.bots, previous.channels);
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
  it('renders one group timestamp and individual inline actions for adjacent Bot messages', () => {
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
    expect(markup).not.toContain('bh-message-group-avatar-link');
    expect(markup.match(/class="bh-bubble-time"/g)).toHaveLength(1);
    expect(markup).toContain('dateTime="2026-09-21T00:01:00.000Z"');
    expect(markup.match(/class="bh-bubble-meta"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="回复"/g)).toHaveLength(2);
    expect(markup.match(/aria-label="复制消息"/g)).toHaveLength(2);
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

describe('Bot main question developer details', () => {
  it('reacts to the shared Bot settings preference without remounting the question', async () => {
    const previous = store.getSnapshot();
    const channel = {
      id: 'dm-ada',
      type: 'dm' as const,
      name: 'Ada',
      members: ['ada'],
      botSlug: 'ada',
      createdAt: '2026-10-08T00:00:00.000Z',
      updatedAt: '2026-10-08T00:00:00.000Z',
    };
    const message: ChannelMessage = {
      id: 'developer-question',
      at: channel.createdAt,
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      userQuestionRequest: {
        sessionId: 'orchestrator-private',
        questions: [
          {
            id: 'start',
            header: 'Start',
            question: 'Where should we start?',
            options: [{ label: 'News' }],
          },
        ],
      },
    };
    const actions = {
      userQuestionStatus: vi.fn().mockResolvedValue('pending'),
      markRead: vi.fn().mockResolvedValue(undefined),
    } as unknown as BridgeActions;
    const prefs = new BotModePrefs();
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    store.select({ kind: 'channel', channelId: channel.id });
    store.setConversation({ status: 'ready', channel, messages: [message] });
    const node = document.createElement('div');
    document.body.append(node);
    const root = createRoot(node);
    try {
      await act(async () =>
        root.render(
          createElement(BotMain, {
            prefs,
            actions,
            channelSidebar: createChannelSidebarRegistry(),
          }),
        ),
      );
      expect(node.querySelector('.bh-question-source')).toBeNull();
      const choice = node.querySelector<HTMLButtonElement>('.bh-question-item button')!;
      await act(async () => choice.click());
      await act(async () => prefs.setDeveloperMode(true));
      expect(node.querySelector('.bh-question-source code')?.textContent).toBe(
        'orchestrator-private',
      );
      expect(choice.getAttribute('aria-pressed')).toBe('true');
      await act(async () => prefs.setDeveloperMode(false));
      expect(node.querySelector('.bh-question-source')).toBeNull();
      expect(choice.getAttribute('aria-pressed')).toBe('true');
      expect(actions.userQuestionStatus).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      node.remove();
      store.select(previous.selection);
      store.setConversation(previous.conversation);
    }
  });
});
