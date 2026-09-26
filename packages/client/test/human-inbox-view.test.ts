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
});

describe('Human Inbox center view', () => {
  it('defaults to action-required and offers source and decision actions', () => {
    store.select({ kind: 'inbox' });
    store.setHumanInbox({ status: 'ready', category: 'action', items: [join] });
    const markup = renderToStaticMarkup(
      createElement(HumanInboxView, { actions: {} as BridgeActions }),
    );
    expect(markup).toContain('需要我处理');
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
});
