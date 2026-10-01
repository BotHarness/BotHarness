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
    Modal: ({ children, onClose }: PropsWithChildren<{ onClose(): void }>) =>
      createElement(
        'div',
        { role: 'dialog' },
        children,
        createElement('button', { onClick: onClose }, 'Close source'),
      ),
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

import type { ExternalSource } from '../../core/src/messaging/inbound.js';
import type { BridgeActions } from '../src/client/actions.js';
import { createChannelSidebarBuiltins } from '../src/client/channel-sidebar-builtins.js';
import { ChannelSidebarEntrySection } from '../src/client/channel-sidebar-view.js';
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
      items: [
        item,
        { ...item, id: 'source-2', state: 'handled', sourceMessageId: 'm2' },
        { ...item, id: 'source-3', state: 'ignored', sourceMessageId: 'm3' },
      ],
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
      expect(container.textContent).toContain('已处理或忽略 · 2');
      expect(container.textContent).toContain('已忽略');
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

  it('reveals newly active or escalated attention in an existing collapsed source group', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
    const entry = createChannelSidebarBuiltins(zhTranslate).find(
      (candidate) => candidate.id === 'bot-inbox',
    )!;
    store.setBotInbox({
      status: 'ready',
      items: [{ ...item, state: 'handled' }],
      error: undefined,
    });
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const render = async (): Promise<void> => {
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
    };
    try {
      await render();
      const group = container.querySelector<HTMLDetailsElement>('.bh-inbox-group')!;
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'pending' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
      await act(async () => {
        group.open = false;
        group.dispatchEvent(new Event('toggle', { bubbles: true }));
      });
      await render();
      expect(group.open).toBe(false);
      await act(async () =>
        store.setBotInbox({
          status: 'ready',
          items: [
            { ...item, state: 'handled' },
            { ...item, id: 'source-2', state: 'needs-repair' },
          ],
        }),
      );
      await render();
      expect(group.open).toBe(true);
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
  it('opens an Assignment report in its native DSH Session', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().botInbox;
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
    const openSession = vi.fn();
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
              actions: { openSession } as unknown as BridgeActions,
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
      expect(openSession).toHaveBeenCalledWith('assignment-one');
    } finally {
      await act(async () => root.unmount());
      container.remove();
      store.setBotInbox(previous);
    }
  });
});

it('clears previous source content and ignores older requests after reopening', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const previous = store.getSnapshot().botInbox;
  store.setBotInbox({
    status: 'ready',
    items: [
      {
        ...item,
        sourceKind: 'bridge-message',
        externalOrigin: {
          platform: 'lark',
          accountName: 'Bot',
          conversationName: 'Team',
          conversationId: 'group',
          senderId: 'human',
        },
      },
    ],
  });
  const entry = createChannelSidebarBuiltins(zhTranslate).find((e) => e.id === 'bot-inbox')!;
  const requests: { resolve(source: ExternalSource): void; reject(error: Error): void }[] = [];
  const messagingSource = vi.fn(
    () => new Promise<ExternalSource>((resolve, reject) => requests.push({ resolve, reject })),
  );
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  const source: ExternalSource = {
    id: 'source-1',
    body: 'CURRENT SOURCE',
    platform: 'lark',
    accountName: 'Bot',
    conversationName: 'Team',
    at: '2026-10-01T00:00:00Z',
    grantId: 'grant',
    grantRevision: 1,
    contextReads: [
      {
        at: '2026-10-01T00:00:00Z',
        sessionId: 'session',
        scope: 'thread',
        outcome: 'read',
        sourceEventIds: ['context-one'],
        omitted: 2,
        incomplete: true,
      },
    ],
    contextMessages: [
      {
        sourceEventId: 'context-one',
        messageId: 'remote-one',
        senderId: 'external-human',
        senderName: 'Alex',
        mentions: [{ id: 'bot-one', key: '@_user_1', name: 'QA Bot' }],
        at: '2026-10-01T00:00:00Z',
        text: 'ONLY RETURNED CONTEXT @_user_1 and @_user_10 <script>plain</script>',
      },
    ],
    event: {
      version: 1,
      channel: 'feishu',
      botId: 'app',
      fingerprint: 'a'.repeat(64),
      eventId: 'ev',
      messageId: 'om',
      actor: { kind: 'user', id: 'human' },
      conversation: { kind: 'group', id: 'group' },
      mentions: [],
      mentionedAccount: true,
      at: '2026-10-01T00:00:00Z',
      reply: { messageId: 'om', conversationId: 'group', actorId: 'human' },
      replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
    },
  };
  const open = async () =>
    act(async () => container.querySelector<HTMLButtonElement>('.bh-inbox-item')!.click());
  const close = async () =>
    act(async () =>
      [...container.querySelectorAll('button')]
        .find((b) => b.textContent === 'Close source')!
        .click(),
    );
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
            actions: { messagingSource } as unknown as BridgeActions,
            t: zhTranslate,
          },
        }),
      ),
    );
    await open();
    await close();
    await open();
    await act(async () => requests[1]!.resolve(source));
    await act(async () => requests[0]!.reject(new Error('Old request failed')));
    expect(container.textContent).toContain('CURRENT SOURCE');
    const messages = [...container.querySelectorAll('.bh-external-message')];
    const context = messages[1]!;
    expect(context.querySelector('strong')?.textContent).toBe('Alex');
    expect(context.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-01T00:00:00Z');
    expect(context.querySelector('.bh-external-message-text')?.textContent).toBe(
      'ONLY RETURNED CONTEXT @QA Bot and @_user_10 <script>plain</script>',
    );
    expect(context.querySelector('script')).toBeNull();
    const details = context.querySelector('details')!;
    expect(details.open).toBe(false);
    details.open = true;
    expect(details.textContent).toContain('@_user_1 and @_user_10');
    expect(container.textContent).toContain('上下文不完整');
    expect(container.querySelector('.bh-external-audit')?.hasAttribute('open')).toBe(false);
    expect(container.textContent).toContain('ONLY RETURNED CONTEXT');
    expect(container.textContent).toContain('context-one');
    expect(container.textContent).toContain('Alex (external-human)');
    expect(container.textContent).toContain('消息 remote-one [Source Event context-one]');
    expect(container.textContent).toContain('@_user_1 → QA Bot (bot-one)');
    expect(container.textContent).toContain('消息 om [Source Event source-1]');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    await close();
    await open();
    expect(container.textContent).not.toContain('CURRENT SOURCE');
    await close();
    await open();
    await act(async () => requests[3]!.resolve({ ...source, body: 'NEWEST SOURCE' }));
    await act(async () => requests[2]!.resolve({ ...source, body: 'STALE SOURCE' }));
    expect(container.textContent).toContain('NEWEST SOURCE');
    expect(container.textContent).not.toContain('STALE SOURCE');
  } finally {
    await act(async () => root.unmount());
    container.remove();
    store.setBotInbox(previous);
  }
});
