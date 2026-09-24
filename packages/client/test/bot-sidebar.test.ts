import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<{
    open: boolean;
    items: readonly Record<string, unknown>[];
    selectedId?: string | undefined;
    onSelect?: (id: string) => void;
  }>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  const icon = (name: string) => (props: { className?: string }) =>
    createElement('span', { 'data-icon': name, className: props.className });
  return {
    Button: (props: { children?: ReactNode }) => createElement('button', null, props.children),
    IconAgentPresetOutline16: icon('IconAgentPresetOutline16'),
    IconCheckOutline16: icon('IconCheckOutline16'),
    IconChevronDownOutline14: icon('IconChevronDownOutline14'),
    IconCloseFill14: icon('IconCloseFill14'),
    IconEditOutline16: icon('IconEditOutline16'),
    IconEllipsisOutline16: icon('IconEllipsisOutline16'),
    IconFolderOpenOutline16: icon('IconFolderOpenOutline16'),
    IconNewChatOutline16: icon('IconNewChatOutline16'),
    IconPlusOutline16: icon('IconPlusOutline16'),
    IconSearchOutline16: icon('IconSearchOutline16'),
    IconTrashOutline16: icon('IconTrashOutline16'),
    IconTriangleRightFill14: icon('IconTriangleRightFill14'),
    HoverCard: (props: { anchor: ReactNode; content: ReactNode }) =>
      createElement('span', { 'data-hover-card': 'true' }, props.anchor, props.content),
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
    Tag: (props: { children?: ReactNode }) => createElement('span', null, props.children),
    Tooltip: (props: { children?: unknown }) => (props.children ?? null) as never,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import type { BridgeActions } from '../src/client/actions.js';
import { BotSidebar, BulkChannelMenu, ChannelMoveMenu } from '../src/client/bot-sidebar.js';
import { UNGROUPED_MOVE_TARGET } from '../src/client/section-management.js';
import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { PINNED_SORT_SCOPE_ID } from '../src/bot-mode-settings.js';
import { zh, zhTranslate } from '../src/client/locale.js';
import type { RosterConfig } from '../src/client/roster-config.js';
import type { RosterSection, RosterSnapshot } from '../src/client/roster.js';
import { store } from '../src/client/store.js';
import type { BotSummary, ChannelSummary } from '../src/client/store.js';

const AT = '2026-09-19T00:00:00.000Z';

const BOT: BotSummary = {
  slug: 'atlas',
  displayName: 'Atlas',
  roles: ['研究', '写作'],
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

const DM_CHANNEL: ChannelSummary = {
  id: 'dm-atlas',
  type: 'dm',
  name: 'Atlas',
  members: ['atlas'],
  botSlug: 'atlas',
  createdAt: AT,
  updatedAt: AT,
};

function stubActions(): BridgeActions {
  return {
    listHostFolders: vi.fn(async () => ({
      path: '/',
      home: '/',
      crumbs: [],
      entries: [],
      truncated: false,
    })),
    addWorkspaceFolder: vi.fn(async () => undefined),
    authorizeWorkspacePath: vi.fn(async () => ({ id: 'grant-1' }) as never),
    memoryDirectory: vi.fn(async () => undefined),
    load: vi.fn(async () => undefined),
    refreshRoster: vi.fn(async () => undefined),
    openBot: vi.fn(async () => undefined),
    openChannel: vi.fn(async () => undefined),
    loadOlder: vi.fn(async () => undefined),
    loadNewer: vi.fn(async () => undefined),
    openLatest: vi.fn(async () => undefined),
    openAround: vi.fn(async () => undefined),
    markRead: vi.fn(async () => undefined),
    refreshChannelMessages: vi.fn(async () => undefined),
    dismissFailedMessage: vi.fn(() => false),
    openAssignment: vi.fn(async () => undefined),
    memorySnapshot: vi.fn(async () => ({ head: null, files: [], provisional: false })),
    memoryFile: vi.fn(async () => undefined),
    memoryHistory: vi.fn(async () => []),
    memoryDiff: vi.fn(async () => ''),
    memoryRepair: vi.fn(async () => {
      throw new Error('not configured');
    }),
    memorySave: vi.fn(async () => {
      throw new Error('not configured');
    }),
    listWorkspaceOptions: vi.fn(async () => []),
    listWorkspaceGrants: vi.fn(async () => []),
    createWorkspaceGrant: vi.fn(async () => ({
      id: 'grant-1',
      path: '/project',
      title: 'Project',
      botSlug: 'atlas',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: AT,
    })),
    toolApprovalStatus: vi.fn(async () => 'expired' as const),
    decideToolApproval: vi.fn(async () => undefined),
    revokeWorkspaceGrant: vi.fn(async () => ({
      id: 'grant-1',
      path: '/project',
      title: 'Project',
      botSlug: 'atlas',
      workspaceId: 'workspace-1',
      workspacePath: '/project',
      workspaceTitle: 'Project',
      createdAt: AT,
      revokedAt: AT,
    })),
    send: vi.fn(async () => false),
    createBot: vi.fn(async () => BOT),
    createGroup: vi.fn(async () => undefined),
    renameChannel: vi.fn(async () => true),
    createSection: vi.fn(async () => undefined),
    renameSection: vi.fn(async () => true),
    removeSection: vi.fn(async () => true),
    setChannelPinned: vi.fn(async () => true),
    reorderPinnedChannels: vi.fn(async () => true),
    setChannelHidden: vi.fn(async () => true),
    batchRoster: vi.fn(async () => true),
    movePinnedChannel: vi.fn(async () => true),
    movePinnedChannelToFlat: vi.fn(async () => true),
    assignChannel: vi.fn(async () => true),
    setSectionChannelOrder: vi.fn(async () => true),
    moveChannel: vi.fn(async () => true),
    reorderSections: vi.fn(async () => true),
    reorderFlat: vi.fn(async () => true),
    moveToFlat: vi.fn(async () => true),
    ensureChannelPins: vi.fn(async () => true),
    ensureFlatTopOrder: vi.fn(async () => true),
  };
}

function config(patch?: Partial<RosterConfig>): RosterConfig {
  return { collapsed: {}, ...patch };
}

function section(id: string, name: string, channelIds: string[]): RosterSection {
  return { id, name, channelIds };
}

function setRoster(patch?: Partial<RosterSnapshot>): void {
  store.setRosterState({
    pins: [],
    hidden: [],
    sections: [],
    topOrder: undefined,
    readOnly: false,
    ...patch,
  });
}

let prefs: BotModePrefsSnapshot = {
  motionPreference: 'system',
  botIcon: 'mascot' as const,
  developerMode: false,
  effectiveMotion: 'full',
  sortMode: 'updated',
  sortModes: {},
  mode: 'host',
  status: 'ready',
};
let setSortMode = vi.fn();
let setSectionSortMode = vi.fn();

function renderSidebar(wide = true): string {
  return renderToStaticMarkup(
    createElement(BotSidebar, {
      wide,
      actions: stubActions(),
      useBotModePrefs: ((selector: (snapshot: BotModePrefsSnapshot) => unknown) =>
        selector(prefs)) as never,
      setSortMode,
      setSectionSortMode,
      t: zhTranslate as never,
    }),
  );
}

function menuWithLabel(label: string): {
  open: boolean;
  items: readonly Record<string, unknown>[];
  selectedId?: string | undefined;
  onSelect?: (id: string) => void;
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
  onSelect?: (id: string) => void;
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
  store.setConfig(config());
  store.setRoster([], []);
  setRoster();
  prefs = {
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    developerMode: false,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
  };
  setSortMode = vi.fn();
  setSectionSortMode = vi.fn();
});

afterEach(() => {
  captured.menus.length = 0;
  store.setMode('dsh');
  store.setQuery('');
  store.select(undefined);
  store.setConfig(config());
  store.setRoster([], []);
  setRoster();
});

describe('bot sidebar rows', () => {
  it('renders the glyph-free section header anatomy', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-section-head');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).not.toContain('IconTriangleRightFill14');
    expect(markup).not.toContain('bh-arrow');
    expect(markup).not.toContain('bh-row-slot');
    expect(markup).toContain('bh-section-name');
    expect(markup).toContain('data-icon="IconChevronDownOutline14"');
    expect(markup).toContain('bh-section-chevron');
    expect(markup).not.toContain('bh-chevron-collapsed');
    expect(markup).toContain('bh-row-actions');
    expect(markup).toContain('aria-label="「工作流」排序方式"');
    expect(markup).toContain('aria-label="在「工作流」中新建"');
    expect(markup.match(/class="bh-row-action"/g)).toHaveLength(2);
    expect(markup).not.toMatch(/class="bh-row-action"[^>]*disabled/);
    const createMenu = captured.menus.find(
      (menu) =>
        menu.items.some((item) => item['id'] === 'bot') &&
        menu.items.some((item) => item['id'] === 'channel') &&
        !menu.items.some((item) => item['id'] === 'section'),
    );
    expect(createMenu?.items.map((item) => item['label'])).toEqual(['创建 PersonaBot', '创建频道']);
  });

  it('renders channels as one-line native session rows without extra indentation', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([BOT], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).not.toContain('bh-channel-mark');
    expect(markup.match(/bh-channel-row/g)).toHaveLength(2);
    expect(markup).toContain('bh-channel-slot');
    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).not.toContain('>#</span>');
    expect(markup).toContain('bh-channel-title');
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('1 位成员');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('还没有成员');
  });

  it('keeps the two-line bot contact rows', () => {
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-contact');
    expect(markup).toContain('bh-body');
    expect(markup).toContain('Atlas');
    expect(markup).toContain('研究');
    expect(markup).toContain('写作');
    expect(markup).toContain('文件研究助手');
  });

  it('keeps an empty pin target collapsed before a drag begins', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-empty bh-pin-zone-hidden');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('拖到此处置顶');
    expect(markup.indexOf('bh-pin-zone')).toBeLessThan(markup.indexOf('bh-roster-list'));
  });

  it('renders pinned PersonaBot DMs as draggable cards inside the pin drop zone', () => {
    setRoster({ pins: [DM_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-grid');
    expect(markup).toMatch(/class="bh-pinned[^"]*"[^>]*draggable="true"/);
    expect(markup).not.toContain('拖到此处置顶');
    expect(markup).toContain('bh-unpin-zone bh-unpin-zone-hidden');
  });

  it('renders pinned group Channels with their hash glyph and removes their roster row', () => {
    setRoster({ pins: [FLAT_CHANNEL.id] });
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('bh-pin-zone bh-pin-zone-filled');
    expect(markup).toContain('bh-pinned-channel-icon');
    expect(markup).toContain('散装渠道');
    expect(markup.match(/bh-channel-row/g) ?? []).toHaveLength(0);
  });

  it('projects every ordered Channel into the collapsed rail with a pin divider and previews', () => {
    setRoster({
      pins: [DM_CHANNEL.id],
      sections: [section('s1', '工作流', [SECTION_CHANNEL.id])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: FLAT_CHANNEL.id },
      ],
    });
    store.setRoster(
      [BOT],
      [
        {
          ...DM_CHANNEL,
          latestMessage: {
            id: 'm1',
            at: AT,
            author: { kind: 'bot', slug: 'atlas' },
            body: '已完成调研',
          },
        },
        {
          ...SECTION_CHANNEL,
          latestMessage: { id: 'm2', at: AT, author: { kind: 'human' }, body: '继续处理' },
        },
        FLAT_CHANNEL,
      ],
    );

    const markup = renderSidebar(false);

    expect(markup).toContain('bh-region-rail');
    expect(markup.match(/class="bh-rail-channel(?: bh-selected)?"/g) ?? []).toHaveLength(3);
    expect(markup).toContain('bh-rail-divider');
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('bh-rail-divider'));
    expect(markup.indexOf('一级渠道')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup).toContain('Atlas：已完成调研');
    expect(markup).toContain('你：继续处理');
    expect(markup).toContain('暂无消息');
  });

  it('omits hidden group and DM Channels from the roster, pin grid, and collapsed rail', () => {
    store.setRoster([BOT], [DM_CHANNEL, FLAT_CHANNEL]);
    setRoster({
      pins: [DM_CHANNEL.id],
      hidden: [DM_CHANNEL.id, FLAT_CHANNEL.id],
      topOrder: [{ kind: 'channel', id: FLAT_CHANNEL.id }],
    });

    const wide = renderSidebar();
    expect(wide).not.toContain('Atlas');
    expect(wide).not.toContain('散装渠道');
    expect(wide).toContain(zh['hidden.all']);

    const rail = renderSidebar(false);
    expect(rail).not.toContain('Atlas');
    expect(rail).not.toContain('散装渠道');
  });

  it('renders a PersonaBot DM inside a section with the same channel drag lifecycle', () => {
    setRoster({ sections: [section('s1', '工作流', ['dm-atlas'])] });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup).toContain('bh-contact');
    expect(markup).toContain('data-channel-id="dm-atlas"');
    expect(markup.match(/draggable="true"/g)).toHaveLength(2);
  });

  it('places a loose PersonaBot DM between sections through topOrder', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'dm-atlas' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([BOT], [DM_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('Atlas'));
    expect(markup.indexOf('Atlas')).toBeLessThan(markup.indexOf('研究'));
  });

  it('renders the read-only note after a roster write reported storage-unavailable', () => {
    setRoster();
    store.setRosterState({ readOnly: true });
    const markup = renderSidebar();

    expect(markup).toContain('名册存储不可用，陈列只读');
  });

  it('drops the channel run while a section is collapsed', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setConfig(config({ collapsed: { s1: true } }));
    store.setRoster([], [SECTION_CHANNEL]);
    const markup = renderSidebar();

    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('bh-chevron-collapsed');
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

  it('offers PersonaBot creation when channels already exist and from the create menu', () => {
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();
    const menu = menuWithItem('bot');

    expect(menu.items.map((item) => item['label'])).toEqual([
      '创建 PersonaBot',
      '创建频道',
      '创建频道分组',
    ]);
    expect(menu.items[0]?.['disabled']).toBeUndefined();
    expect(markup).toContain('还没有 PersonaBot');
    expect(markup).toContain('创建第一个 PersonaBot');
    expect(markup).toContain('散装渠道');
    expect(markup).toContain('placeholder="搜索 Bot 或频道"');
  });

  it('sorts the pinned grid independently and offers a pinned sort menu', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'pin-old',
      name: '旧置顶',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'pin-new',
      name: '新置顶',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ pins: [older.id, newer.id] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新置顶')).toBeLessThan(auto.indexOf('旧置顶'));
    expect(auto).toContain('aria-label="置顶排序"');
    const menu = menuWithLabel('置顶排序');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pinned-sort-label',
      'updated',
      'manual',
      'inherit',
    ]);
    expect(menu.selectedId).toBe('inherit');
    menu.onSelect?.('manual');
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, 'manual');
    prefs = { ...prefs, sortModes: { [PINNED_SORT_SCOPE_ID]: 'manual' } };
    captured.menus.length = 0;
    const manual = renderSidebar();
    expect(manual.indexOf('旧置顶')).toBeLessThan(manual.indexOf('新置顶'));
    expect(menuWithLabel('置顶排序').selectedId).toBe('manual');
    menu.onSelect?.('inherit');
    expect(setSectionSortMode).toHaveBeenCalledWith(PINNED_SORT_SCOPE_ID, undefined);
  });

  it('renders the global sort menu from the shared policy store', () => {
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    renderSidebar();

    const menu = menuWithLabel('排序方式');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'sort-label',
      'updated',
      'manual',
      'roster-separator',
      'hidden',
    ]);
    expect(menu.items[0]?.['type']).toBe('label');
    expect(menu.items.slice(1).every((item) => item['danger'] === undefined)).toBe(true);
    expect(
      menu.items.filter((item) => item['label'] !== undefined).map((item) => item['label']),
    ).toEqual(['最近更新', '手动排序', '隐藏的频道']);
    expect(menu.selectedId).toBe('manual');
  });

  it('writes the shared policy store when the global sort menu picks a mode', () => {
    renderSidebar();

    const onSelect = menuWithLabel('排序方式')['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    onSelect('unrelated');
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('renders the section menu in native order with the mode checked and danger last', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    store.setRoster([], [SECTION_CHANNEL]);
    renderSidebar();

    const menu = menuWithItem('rename');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'sort-label',
      'updated',
      'manual',
      'inherit',
      'section-separator',
      'move-up',
      'move-down',
      'section-action-separator',
      'rename',
      'delete',
    ]);
    expect(menu.items.slice(1, 4).map((item) => item['label'])).toEqual([
      '最近更新',
      '手动排序',
      '恢复自动',
    ]);
    expect(menu.items[4]?.['type']).toBe('separator');
    expect(menu.items[5]).toMatchObject({ id: 'move-up', disabled: true });
    expect(menu.items[6]).toMatchObject({ id: 'move-down', disabled: true });
    expect(menu.items[8]).toMatchObject({ id: 'rename', label: '重命名' });
    expect(menu.items[9]).toMatchObject({ id: 'delete', label: '删除', danger: true });
    expect(menu.items.at(-1)?.['danger']).toBe(true);
    expect(menu.selectedId).toBe('manual');
  });

  it('checks inherit when a section has no stored mode', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    expect(menuWithItem('rename').selectedId).toBe('inherit');
  });

  it('writes section modes through the shared policy and clears with inherit', () => {
    setRoster({ sections: [section('s1', '工作流', [])] });
    renderSidebar();

    const onSelect = menuWithItem('rename')['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', 'manual');

    setSectionSortMode.mockClear();
    onSelect('inherit');
    expect(setSectionSortMode).toHaveBeenCalledWith('s1', undefined);

    setSectionSortMode.mockClear();
    onSelect('unrelated');
    expect(setSectionSortMode).not.toHaveBeenCalled();
  });

  it('orders a section by its resolved mode: manual override, else the global default', () => {
    const older = {
      ...SECTION_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...SECTION_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    setRoster({ sections: [section('s1', '工作流', ['c-old', 'c-new'])] });
    store.setRoster([], [older, newer]);

    const auto = renderSidebar();
    expect(auto.indexOf('新频道')).toBeLessThan(auto.indexOf('旧频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: { s1: 'manual' },
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const inherited = renderSidebar();
    expect(inherited.indexOf('旧频道')).toBeLessThan(inherited.indexOf('新频道'));
  });

  it('renders loose channels in flat order under every sort mode (never auto-sorted)', () => {
    const older = {
      ...FLAT_CHANNEL,
      id: 'c-old',
      name: '旧频道',
      updatedAt: '2026-09-18T00:00:00.000Z',
    };
    const newer = {
      ...FLAT_CHANNEL,
      id: 'c-new',
      name: '新频道',
      updatedAt: '2026-09-19T12:00:00.000Z',
    };
    store.setRoster([], [older, newer]);

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'updated',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const auto = renderSidebar();
    expect(auto).not.toContain('未分组');
    expect(auto.indexOf('旧频道')).toBeLessThan(auto.indexOf('新频道'));

    prefs = {
      motionPreference: 'system',
      botIcon: 'mascot' as const,
      developerMode: false,
      effectiveMotion: 'full',
      sortMode: 'manual',
      sortModes: {},
      mode: 'host',
      status: 'ready',
    };
    const manual = renderSidebar();
    expect(manual.indexOf('旧频道')).toBeLessThan(manual.indexOf('新频道'));
  });

  it('renders a loose channel between sections at its flat position', () => {
    setRoster({
      sections: [section('s1', '工作流', []), section('s2', '研究', [])],
      topOrder: [
        { kind: 'section', id: 's1' },
        { kind: 'channel', id: 'c-flat' },
        { kind: 'section', id: 's2' },
      ],
    });
    store.setRoster([], [FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.indexOf('工作流')).toBeLessThan(markup.indexOf('散装渠道'));
    expect(markup.indexOf('散装渠道')).toBeLessThan(markup.indexOf('研究'));
    expect(markup).toContain('bh-loose');
  });

  it('wires drag on section and loose channels plus the section header', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();

    expect(markup.match(/draggable="true"/g)).toHaveLength(3);
    expect(markup).toContain('一级渠道');
    expect(markup).toContain('散装渠道');
  });

  it('renders empty sections as bare headers with no layout-taking drop zone', () => {
    store.setConfig(config());
    setRoster({
      sections: [section('s1', '工作流', ['c-section']), section('s-empty', '空分组', [])],
    });
    store.setRoster([], [SECTION_CHANNEL, FLAT_CHANNEL]);
    const markup = renderSidebar();
    expect(markup).toContain('空分组');
    expect(markup).not.toContain('bh-empty-drop');
    expect(markup).not.toContain('bh-drop-scope');
  });

  it('renders the 移动到 menu from every section plus 未分组 and maps picks to scopes', () => {
    const onPick = vi.fn();
    const onClose = vi.fn();
    const onRename = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: 'c-section', x: 40, y: 80 },
        sections: [section('s1', '工作流', []), section('s2', '研究', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onPick,
        onRename,
        onCreateSection,
        onClose,
      }),
    );

    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('move menu not rendered');
    const items = menu.items as readonly { id: string; submenu?: readonly { id: string }[] }[];
    expect(items.map((item) => item.id)).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    expect(items[2]?.submenu?.map((item) => item.id)).toEqual([
      'new-section',
      's1',
      's2',
      UNGROUPED_MOVE_TARGET,
    ]);

    const onSelect = menu.onSelect as (id: string) => void;
    onSelect('s2');
    expect(onPick).toHaveBeenCalledWith('s2');
    onSelect(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    onSelect('rename');
    expect(onRename).toHaveBeenCalledWith('c-section');
    onSelect('new-section');
    expect(onCreateSection).toHaveBeenCalledWith('c-section');
  });

  it('uses a count-aware bulk menu and keeps destructive deletion unavailable', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    const onHide = vi.fn();
    const onCreateSection = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, SECTION_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        t: zhTranslate as never,
        onPick,
        onPin,
        onHide,
        onCreateSection,
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('置顶 2 个频道');
    expect(menu.items[2]?.['label']).toBe('将 2 个频道 移动到');
    expect(menu.items[4]?.['label']).toBe('隐藏 2 个频道');
    menu.onSelect?.('pin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(true);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
    menu.onSelect?.(UNGROUPED_MOVE_TARGET);
    expect(onPick).toHaveBeenCalledWith(undefined);
    menu.onSelect?.('new-section');
    expect(onCreateSection).toHaveBeenCalledOnce();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledOnce();
  });

  it('offers bulk unpin and move for channels selected in the pin area', () => {
    const onPick = vi.fn();
    const onPin = vi.fn();
    renderToStaticMarkup(
      createElement(BulkChannelMenu, {
        menu: {
          channelId: DM_CHANNEL.id,
          channelIds: [DM_CHANNEL.id, FLAT_CHANNEL.id],
          x: 40,
          y: 80,
        },
        sections: [section('s1', '工作流', [])],
        itemsLabel: '2 个频道',
        allPinned: true,
        t: zhTranslate as never,
        onPick,
        onPin,
        onCreateSection: vi.fn(),
        onHide: vi.fn(),
        onClose: vi.fn(),
      }),
    );
    const menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned bulk menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'bulk-pin-separator',
      'move',
      'bulk-action-separator',
      'hide',
    ]);
    expect(menu.items[0]?.['label']).toBe('取消置顶 2 个频道');
    menu.onSelect?.('unpin');
    expect(onPin).toHaveBeenCalledOnce();
    expect(onPin).toHaveBeenCalledWith(false);
    menu.onSelect?.('s1');
    expect(onPick).toHaveBeenCalledWith('s1');
  });
  it('offers the same organization actions on ordinary and pinned Channel menus', () => {
    const onSetPinned = vi.fn();
    const onHide = vi.fn();
    const onPick = vi.fn();
    const onClose = vi.fn();
    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    let menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'pin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('pin');
    expect(onSetPinned).toHaveBeenCalledWith(DM_CHANNEL.id, true);
    expect(onPick).not.toHaveBeenCalled();
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenCalledWith(DM_CHANNEL.id);

    renderToStaticMarkup(
      createElement(ChannelMoveMenu, {
        menu: { channelId: DM_CHANNEL.id, pinnedView: true, x: 40, y: 80 },
        sections: [section('s1', '工作流', [])],
        currentSectionId: 's1',
        pinned: true,
        t: zhTranslate as never,
        onSetPinned,
        onHide,
        onPick,
        onClose,
      }),
    );

    menu = captured.menus.at(-1);
    if (menu === undefined) throw new Error('pinned PersonaBot menu not rendered');
    expect(menu.items.map((item) => item['id'])).toEqual([
      'unpin',
      'pin-separator',
      'move',
      'channel-action-separator',
      'rename',
      'hide-separator',
      'hide',
    ]);
    menu.onSelect?.('unpin');
    expect(onSetPinned).toHaveBeenLastCalledWith(DM_CHANNEL.id, false);
    menu.onSelect?.('hide');
    expect(onHide).toHaveBeenLastCalledWith(DM_CHANNEL.id);
  });

  it('renders a deleted section channel as a loose channel with no bucket', () => {
    setRoster({ sections: [section('s1', '工作流', ['c-section'])] });
    store.setRoster([], [SECTION_CHANNEL]);
    const before = renderSidebar();
    expect(before).toContain('一级渠道');
    expect(before.indexOf('工作流')).toBeLessThan(before.indexOf('一级渠道'));

    // The host drops the section and its membership; the client re-reads.
    setRoster({ sections: [] });
    const after = renderSidebar();
    expect(after).not.toContain('工作流');
    expect(after).not.toContain('未分组');
    expect(after).toContain('一级渠道');
  });
});
