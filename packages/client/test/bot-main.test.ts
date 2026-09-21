import { createElement, type PropsWithChildren } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const Tag = ({ children }: PropsWithChildren) => createElement('span', null, children);
  return {
    Button: stub,
    IconAgentPresetOutline16: stub,
    IconChevronDownOutline14: stub,
    IconCloseFill14: stub,
    IconEllipsisOutline16: stub,
    IconFolderOpenOutline16: stub,
    IconNewChatOutline16: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    IconTrashOutline16: stub,
    Input: stub,
    Menu: stub,
    Modal: stub,
    StateDot: stub,
    Tag,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotMain } from '../src/client/bot-main.js';
import { store } from '../src/client/store.js';

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

    const markup = renderToStaticMarkup(createElement(BotMain, { actions: {} as BridgeActions }));

    expect(markup).toContain('事项');
    expect(markup).toContain('研究发布状态');
    expect(markup).toContain('发布状态正常');
    expect(markup).toContain('Assignment Session');
    expect(markup).not.toContain('Orchestrator Session');
    expect(markup).not.toContain('Ada 空闲');
    expect(markup).not.toContain('bh-composer-activity-status');
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

    const markup = renderToStaticMarkup(createElement(BotMain, { actions: {} as BridgeActions }));

    expect(markup).toContain('bh-bubble-pending');
    expect(markup).toContain('发送中');
    expect(markup).toContain('hello');
  });
});
