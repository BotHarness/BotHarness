import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/client/bot-sidebar.js', async () => {
  const { store } = await import('../src/client/store.js');
  return { useClientState: () => store.getSnapshot() };
});

import type { BridgeActions } from '../src/client/actions.js';
import { HumanInboxView } from '../src/client/human-inbox-view.js';
import { store, type HumanAttentionItem } from '../src/client/store.js';

const join: HumanAttentionItem = {
  id: 'join:request-1',
  category: 'action',
  kind: 'group-join-request',
  createdAt: '2026-09-26T00:00:00.000Z',
  channelId: 'group-team',
  channelName: 'Team',
  botSlug: 'ada',
  summary: '',
  requestId: 'request-1',
};

afterEach(() => {
  store.select(undefined);
  store.setRoster([], []);
});

describe('Human Inbox center view', () => {
  it('defaults to action-required and offers source and decision actions', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({ status: 'ready', category: 'action', items: [join] });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('需要我处理');
    expect(markup).toContain('全部 Bot');
    expect(markup).toContain('全部频道');
    expect(markup).toContain('最新在前');
    expect(markup).toContain('aria-selected="true"');
    expect(markup).toContain('申请加入');
    expect(markup).toContain('查看来源');
    expect(markup).toContain('同意');
    expect(markup).toContain('拒绝');
  });

  it('renders informational Bot DM messages without decision controls', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'info',
      items: [
        {
          ...join,
          id: 'message:source-1',
          category: 'info',
          kind: 'bot-dm-message',
          summary: 'The draft is ready.',
          messageId: 'message-1',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('The draft is ready.');
    expect(markup).toContain('已了解');
    expect(markup).not.toContain('申请加入');
    expect(markup).not.toContain('同意</button>');
  });
  it('shows an unresolved native question as an action linked to its DM', () => {
    store.setRoster(
      [],
      [
        {
          id: 'dm-ada',
          type: 'dm',
          name: 'Ada DM',
          members: ['ada'],
          botSlug: 'ada',
          createdAt: '2026-09-26T00:00:00.000Z',
          updatedAt: '2026-09-26T00:00:00.000Z',
        },
      ],
    );
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'question:source-1',
          category: 'action',
          createdAt: '2026-09-26T00:00:00.000Z',
          botSlug: 'ada',
          kind: 'user-question',
          channelId: 'dm-ada',
          channelName: 'Ada DM',
          summary: 'Which branch should I use?',
          messageId: 'question-one',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 需要你回答');
    expect(markup).toContain('Which branch should I use?');
    expect(markup).toContain('Ada DM');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('已了解');
    expect(markup).not.toContain('同意</button>');
  });
  it('shows a pending tool approval as an action linked to its DM card', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({
      status: 'ready',
      category: 'action',
      items: [
        {
          id: 'approval:source-1',
          category: 'action',
          kind: 'tool-approval',
          createdAt: '2026-09-26T00:00:00.000Z',
          channelId: 'dm-ada',
          channelName: 'Ada DM',
          botSlug: 'ada',
          summary: 'Request approval for bash',
          messageId: 'approval-one',
        },
      ],
    });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('ada 请求工具批准');
    expect(markup).toContain('Request approval for bash');
    expect(markup).toContain('查看来源');
    expect(markup).not.toContain('已了解');
    expect(markup).not.toContain('同意</button>');
  });
});
