import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const icon = (name: string) => (props: { className?: string }) =>
    createElement('span', { 'data-icon': name, className: props.className });
  return {
    Button: stub,
    IconAgentPresetOutline16: icon('IconAgentPresetOutline16'),
    IconCloseFill14: icon('IconCloseFill14'),
    IconEllipsisOutline16: icon('IconEllipsisOutline16'),
    IconFolderOpenOutline16: icon('IconFolderOpenOutline16'),
    IconNewChatOutline16: icon('IconNewChatOutline16'),
    IconPlusOutline16: icon('IconPlusOutline16'),
    IconSearchOutline16: icon('IconSearchOutline16'),
    IconTriangleRightFill14: icon('IconTriangleRightFill14'),
    Input: stub,
    Menu: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { store } from '../src/client/store.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';

const AT = '2026-09-19T00:00:00.000Z';

const BOT: BotSummary = {
  slug: 'atlas',
  displayName: 'Atlas',
  tag: '研究',
  description: '文件研究助手',
  aggregateState: 'working',
  workspaces: [],
  createdAt: AT,
};

const SECTION_CHANNEL: ChannelSummary = {
  id: 'c-section',
  type: 'group',
  name: '一级渠道',
  members: ['atlas'],
  createdAt: AT,
  updatedAt: AT,
};

const FLAT_CHANNEL: ChannelSummary = {
  id: 'c-flat',
  type: 'group',
  name: '散装渠道',
  members: [],
  createdAt: AT,
  updatedAt: AT,
};

function stubActions(): BridgeActions {
  return {
    load: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    openChannel: vi.fn(async () => undefined),
    send: vi.fn(async () => false),
    createGroup: vi.fn(async () => undefined),
  };
}

function renderSidebar(): string {
  return renderToStaticMarkup(createElement(BotSidebar, { wide: true, actions: stubActions() }));
}

beforeEach(() => {
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  store.setConfig({ pins: [], sections: [] });
  store.setRoster([], []);
});

afterEach(() => {
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  store.setConfig({ pins: [], sections: [] });
  store.setRoster([], []);
});

describe('bot sidebar rows', () => {
  it('renders the native projectRow anatomy for section headers', () => {
    store.setConfig({
      pins: [],
      sections: [{ id: 's1', name: '工作流', channels: ['c-section'] }],
    });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-section-head');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-icon="IconTriangleRightFill14"');
    expect(markup).toContain('bh-arrow bh-arrow-open');
    expect(markup).toContain('bh-row-actions');
    expect(markup).toContain('aria-label="「工作流」排序方式"');
    expect(markup).toContain('aria-label="在「工作流」中创建 Channel"');
    expect(markup.match(/class="bh-row-action"/g)).toHaveLength(2);
  });

  it('renders channels as one-line native session rows without extra indentation', () => {
    store.setConfig({
      pins: [],
      sections: [{ id: 's1', name: '工作流', channels: ['c-section'] }],
    });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).not.toContain('bh-channel-mark');
    expect(markup.match(/bh-channel-row/g)).toHaveLength(2);
    expect(markup).toContain('bh-channel-slot');
    expect(markup).toContain('bh-channel-title');
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('1 位成员');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('还没有成员');
  });

  it('keeps the two-line bot contact rows', () => {
    store.setRoster([BOT], []);
    const markup = renderSidebar();

    expect(markup).toContain('bh-contact');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('Atlas');
    expect(markup).toContain('文件研究助手');
  });

  it('drops the channel run and the open arrow while a section is collapsed', () => {
    store.setConfig({
      pins: [],
      sections: [{ id: 's1', name: '工作流', channels: ['c-section'], collapsed: true }],
    });
    store.setRoster([], [SECTION_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('bh-arrow');
    expect(markup).not.toContain('bh-arrow-open');
    expect(markup).not.toContain('一级渠道');
    expect(markup).toContain('bh-row-actions');
  });
});
