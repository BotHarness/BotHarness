import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<{
    open: boolean;
    items: readonly Record<string, unknown>[];
    selectedId?: string | undefined;
  }>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const icon = (name: string) => (props: { className?: string }) =>
    createElement('span', { 'data-icon': name, className: props.className });
  return {
    Button: stub,
    IconAgentPresetOutline16: icon('IconAgentPresetOutline16'),
    IconCloseFill14: icon('IconCloseFill14'),
    IconEditOutline16: icon('IconEditOutline16'),
    IconEllipsisOutline16: icon('IconEllipsisOutline16'),
    IconFolderOpenOutline16: icon('IconFolderOpenOutline16'),
    IconNewChatOutline16: icon('IconNewChatOutline16'),
    IconPlusOutline16: icon('IconPlusOutline16'),
    IconSearchOutline16: icon('IconSearchOutline16'),
    IconTrashOutline16: icon('IconTrashOutline16'),
    IconTriangleRightFill14: icon('IconTriangleRightFill14'),
    Input: stub,
    Menu: (props: {
      open: boolean;
      items: readonly Record<string, unknown>[];
      selectedId?: string | undefined;
      anchor: unknown;
    }) => {
      captured.menus.push(props);
      return props.anchor as never;
    },
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: (props: { children?: unknown }) => (props.children ?? null) as never,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotSidebar } from '../src/client/bot-sidebar.js';
import { removeSection, type RosterConfig } from '../src/client/roster-config.js';
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

function config(patch?: Partial<RosterConfig>): RosterConfig {
  return { pins: [], sections: [], sortMode: 'auto', ...patch };
}

function setConfig(value: RosterConfig): void {
  store.setConfig(value);
}

function renderSidebar(): string {
  return renderToStaticMarkup(createElement(BotSidebar, { wide: true, actions: stubActions() }));
}

function menuWithLabel(label: string): {
  open: boolean;
  items: readonly Record<string, unknown>[];
  selectedId?: string | undefined;
} {
  const found = captured.menus.find((menu) =>
    menu.items.some((item) => item['type'] === 'label' && item['text'] === label),
  );
  if (found === undefined) throw new Error(`menu with label ${label} not rendered`);
  return found;
}

function menuWithItem(id: string): {
  open: boolean;
  items: readonly Record<string, unknown>[];
  selectedId?: string | undefined;
} {
  const found = captured.menus.find((menu) => menu.items.some((item) => item['id'] === id));
  if (found === undefined) throw new Error(`menu with item ${id} not rendered`);
  return found;
}

beforeEach(() => {
  captured.menus.length = 0;
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  setConfig(config());
  store.setRoster([], []);
});

afterEach(() => {
  captured.menus.length = 0;
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  setConfig(config());
  store.setRoster([], []);
});

describe('bot sidebar rows', () => {
  it('renders the native projectRow anatomy for section headers', () => {
    setConfig(config({ sections: [{ id: 's1', name: '工作流', channels: ['c-section'] }] }));
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-section-head');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('data-icon="IconTriangleRightFill14"');
    expect(markup).toContain('bh-arrow bh-arrow-open');
    expect(markup).toContain('bh-row-actions');
    expect(markup).toContain('aria-label="「工作流」排序方式"');
    expect(markup).toContain('aria-label="在「工作流」中创建频道"');
    expect(markup.match(/class="bh-row-action"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/class="bh-row-action"[^>]*disabled/);
  });

  it('renders channels as one-line native session rows without extra indentation', () => {
    setConfig(config({ sections: [{ id: 's1', name: '工作流', channels: ['c-section'] }] }));
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
    setConfig(
      config({
        sections: [{ id: 's1', name: '工作流', channels: ['c-section'], collapsed: true }],
      }),
    );
    store.setRoster([], [SECTION_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('bh-arrow');
    expect(markup).not.toContain('bh-arrow-open');
    expect(markup).not.toContain('一级渠道');
    expect(markup).toContain('bh-row-actions');
  });

  it('orders the header icons search, ellipsis, plus', () => {
    const markup = renderSidebar();
    const search = markup.indexOf('data-icon="IconSearchOutline16"');
    const ellipsis = markup.indexOf('data-icon="IconEllipsisOutline16"');
    const plus = markup.indexOf('data-icon="IconPlusOutline16"');

    expect(search).toBeGreaterThan(-1);
    expect(ellipsis).toBeGreaterThan(search);
    expect(plus).toBeGreaterThan(ellipsis);
  });

  it('renders the create menu with 频道 terminology and the disabled BOT placeholder', () => {
    const markup = renderSidebar();
    const menu = menuWithItem('bot');

    expect(menu.items.map((item) => item['label'])).toEqual([
      '创建 BOT',
      '创建频道',
      '创建频道分组',
    ]);
    expect(menu.items[0]?.['disabled']).toBe(true);
    expect(markup).toContain('placeholder="搜索 BOT 或频道"');
  });

  it('renders the global sort menu as a labeled check list of the two concrete modes', () => {
    setConfig(config({ sortMode: 'manual' }));
    renderSidebar();

    const menu = menuWithLabel('排序方式');
    expect(menu.items.map((item) => item['id'])).toEqual(['sort-label', 'auto', 'manual']);
    expect(menu.items[0]?.['type']).toBe('label');
    expect(menu.items.slice(1).every((item) => item['danger'] === undefined)).toBe(true);
    expect(menu.selectedId).toBe('manual');
  });

  it('renders the section menu in native order with the mode checked and danger last', () => {
    setConfig(
      config({
        sections: [{ id: 's1', name: '工作流', channels: ['c-section'], sortMode: 'manual' }],
      }),
    );
    store.setRoster([], [SECTION_CHANNEL]);
    renderSidebar();

    const menu = menuWithItem('rename');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'sort-label',
      'auto',
      'manual',
      'inherit',
      'section-separator',
      'rename',
      'delete',
    ]);
    expect(menu.items[4]?.['type']).toBe('separator');
    expect(menu.items[5]).toMatchObject({ id: 'rename', label: '重命名' });
    expect(menu.items[6]).toMatchObject({ id: 'delete', label: '删除', danger: true });
    expect(menu.items.at(-1)?.['danger']).toBe(true);
    expect(menu.selectedId).toBe('manual');
  });

  it('checks inherit when a section has no stored mode', () => {
    setConfig(config({ sections: [{ id: 's1', name: '工作流', channels: [] }] }));
    renderSidebar();

    expect(menuWithItem('rename').selectedId).toBe('inherit');
  });

  it('moves a deleted section channel into the bottom ungrouped bucket', () => {
    const withSection = config({
      sections: [{ id: 's1', name: '工作流', channels: ['c-section'] }],
    });
    setConfig(withSection);
    store.setRoster([], [SECTION_CHANNEL]);
    const before = renderSidebar();
    expect(before).toContain('一级渠道');
    expect(before.indexOf('工作流')).toBeLessThan(before.indexOf('一级渠道'));

    setConfig(removeSection(withSection, 's1'));
    const after = renderSidebar();
    expect(after).not.toContain('工作流');
    expect(after).toContain('未分组');
    expect(after.indexOf('未分组')).toBeLessThan(after.indexOf('一级渠道'));
  });
});
