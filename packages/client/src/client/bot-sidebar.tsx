import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  IconAgentPresetOutline16,
  IconCloseFill14,
  IconEllipsisOutline16,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  IconTriangleRightFill14,
  Menu,
  StateDot,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { Blobatar } from './avatar.js';
import { needsYou, STATE_LABELS, toBotState, toStateDot } from './labels.js';
import {
  addChannelToSection,
  addSection,
  defaultStorage,
  removeSection,
  renameSection,
  saveRosterConfig,
  sectionSortMode,
  setGlobalSortMode,
  setSectionSortMode,
  toggleSectionCollapsed,
  type ChannelSectionConfig,
  type RosterConfig,
} from './roster-config.js';
import {
  CreateChannelModal,
  CreateSectionModal,
  globalSortMenuItems,
  SectionDeleteModal,
  SectionRenameModal,
  sectionMenuItems,
} from './section-management.js';
import { store, type BotSummary, type ChannelSummary, type ClientState } from './store.js';

export function useClientState(): ClientState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface BotPanelEntryProps {
  size: number;
  active: boolean;
}

/**
 * Sidebar panel glyph for the selected panel. While active, an absolutely
 * positioned hit target covers the whole shell row (see the
 * `button:has(.bh-panel-glyph)` rule in styles.ts) and turns the shell's
 * re-selection click into a mode exit; the capture handler stops React's
 * propagation so the shell's own `selectPanel(id)` never runs.
 */
export function BotPanelIcon({
  size,
  active,
  onExit,
}: {
  size: number;
  active: boolean;
  onExit: () => void;
}): ReactElement {
  return (
    <span className="bh-panel-glyph">
      <IconAgentPresetOutline16 size={size} />
      {active ? (
        <span
          className="bh-panel-glyph-hit"
          aria-hidden="true"
          onClickCapture={(event) => {
            event.stopPropagation();
            onExit();
          }}
        />
      ) : null}
    </span>
  );
}

export function createBotPanelEntry(
  onExit: () => void,
): (props: BotPanelEntryProps) => ReactElement {
  return function BotPanelEntry({ size, active }) {
    return <BotPanelIcon size={size} active={active} onExit={onExit} />;
  };
}

interface SidebarProps {
  wide: boolean;
  actions: BridgeActions;
}

interface SectionView {
  section: ChannelSectionConfig;
  channels: ChannelSummary[];
}

/** Fixed bottom bucket for Channels with no section (ADR-0031). */
const UNGROUPED_LABEL = '未分组';

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  if (query.length === 0) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(query));
}

function BotRow({
  bot,
  selected,
  actions,
}: {
  bot: BotSummary;
  selected: boolean;
  actions: BridgeActions;
}): ReactElement {
  const botState = toBotState(bot.aggregateState);
  return (
    <button
      type="button"
      className={`bh-contact${selected ? ' bh-selected' : ''}`}
      onClick={() => void actions.openBot(bot.slug)}
    >
      <Blobatar seed={bot.slug} size={34} />
      <span className="bh-body">
        <span className="bh-top">
          <span className="bh-name">{bot.displayName}</span>
          {bot.tag !== undefined ? <Tag tone="neutral">{bot.tag}</Tag> : null}
          {needsYou(botState) ? <span className="bh-unread" title="需要你" /> : null}
        </span>
        <span className="bh-msg">{bot.description ?? STATE_LABELS[botState]}</span>
      </span>
      <StateDot state={toStateDot(botState)} size={8} className="bh-state" />
    </button>
  );
}

function ChannelRow({
  channel,
  selected,
  actions,
}: {
  channel: ChannelSummary;
  selected: boolean;
  actions: BridgeActions;
}): ReactElement {
  return (
    <button
      type="button"
      className={`bh-channel-row${selected ? ' bh-selected' : ''}`}
      onClick={() => void actions.openChannel(channel.id)}
    >
      <span className="bh-channel-slot" aria-hidden="true">
        #
      </span>
      <span className="bh-channel-title">{channel.name}</span>
      <span className="bh-channel-meta">
        {channel.members.length > 0 ? `${channel.members.length} 位成员` : '还没有成员'}
      </span>
    </button>
  );
}

/** Open creation dialog: a new Channel (optionally inside a section) or a new section. */
type CreateRequest = { kind: 'section' } | { kind: 'channel'; sectionId?: string };

export function BotSidebar({ wide, actions }: SidebarProps): ReactElement {
  const state = useClientState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | undefined>(undefined);
  const [renameTarget, setRenameTarget] = useState<ChannelSectionConfig | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<ChannelSectionConfig | undefined>(undefined);
  const searchRoot = useRef<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) return;
    const onClick = (event: MouseEvent): void => {
      if (!(event.target instanceof Node) || searchRoot.current?.contains(event.target) === true) {
        return;
      }
      searchInput.current?.blur();
      if (state.query.trim() !== '') return;
      setSearchOpen(false);
    };
    document.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('click', onClick);
    };
  }, [searchOpen, state.query]);

  if (!wide) return <div className="bh-root bh-region bh-region-rail" />;

  const query = state.query.trim().toLowerCase();
  const bots = state.bots.filter(
    (bot) => matchesQuery(query, bot.displayName, bot.tag) || bot.slug.includes(query),
  );
  const groupChannels = state.channels.filter((channel) => channel.type === 'group');
  const channels = groupChannels.filter((channel) => matchesQuery(query, channel.name));
  const pinned = new Set(state.config.pins);
  const pinnedBots = state.config.pins.flatMap((slug) => {
    const bot = bots.find((candidate) => candidate.slug === slug);
    return bot === undefined ? [] : [bot];
  });
  const sectionedIds = new Set(state.config.sections.flatMap((section) => section.channels));
  const flatBots = bots.filter((bot) => !pinned.has(bot.slug));
  const ungroupedChannels = channels.filter((channel) => !sectionedIds.has(channel.id));
  const sections: SectionView[] = state.config.sections
    .map((section) => ({
      section,
      channels: channels.filter((channel) => section.channels.includes(channel.id)),
    }))
    .filter((entry) => query.length === 0 || entry.channels.length > 0);
  const visibleCount =
    pinnedBots.length +
    flatBots.length +
    ungroupedChannels.length +
    sections.reduce((total, entry) => total + entry.channels.length, 0);
  const selectedBot = state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    state.selection?.kind === 'channel' ? state.selection.channelId : undefined;

  const persistConfig = (next: RosterConfig): void => {
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };

  const selectMenu = (id: string): void => {
    setMenuOpen(false);
    if (id === 'channel') setCreateRequest({ kind: 'channel' });
    if (id === 'section') setCreateRequest({ kind: 'section' });
  };

  const selectSortMenu = (id: string): void => {
    setSortMenuOpen(false);
    if (id !== 'auto' && id !== 'manual') return;
    persistConfig(setGlobalSortMode(store.getSnapshot().config, id));
  };

  const selectSectionMenu = (section: ChannelSectionConfig, id: string): void => {
    setSectionMenuId(undefined);
    if (id === 'auto' || id === 'manual' || id === 'inherit') {
      persistConfig(setSectionSortMode(store.getSnapshot().config, section.id, id));
      return;
    }
    if (id === 'rename') {
      setRenameTarget(section);
      return;
    }
    if (id === 'delete') {
      setDeleteTarget(section);
    }
  };

  const toggleSection = (sectionId: string): void => {
    persistConfig(toggleSectionCollapsed(store.getSnapshot().config, sectionId));
  };

  const createSectionId = createRequest?.kind === 'channel' ? createRequest.sectionId : undefined;
  const createSection =
    createSectionId === undefined
      ? undefined
      : state.config.sections.find((section) => section.id === createSectionId);

  return (
    <div className="bh-root bh-region">
      <div className="bh-header">
        <span className={`bh-header-label${searchOpen ? ' bh-header-label-hidden' : ''}`}>
          Bots
        </span>
        <div className={`bh-search-slot${searchOpen ? ' bh-search-slot-open' : ''}`}>
          <div
            ref={searchRoot}
            className={`bh-search${searchOpen ? ' bh-search-open' : ''}`}
            onClick={() => {
              setMenuOpen(false);
              setSortMenuOpen(false);
              setSearchOpen(true);
              searchInput.current?.focus();
            }}
          >
            <Tooltip label="搜索" side="bottom" delayMs={500} disabled={searchOpen}>
              <button
                type="button"
                className="bh-search-btn"
                aria-label="搜索"
                aria-expanded={searchOpen}
                onClick={() => {
                  setMenuOpen(false);
                  setSortMenuOpen(false);
                  setSearchOpen(true);
                }}
              >
                <IconSearchOutline16 size={searchOpen ? 11 : 14} />
              </button>
            </Tooltip>
            <input
              ref={searchInput}
              className="bh-search-input"
              type="text"
              placeholder="搜索 BOT 或频道"
              value={state.query}
              tabIndex={searchOpen ? 0 : -1}
              onChange={(event) => store.setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                store.setQuery('');
                setSearchOpen(false);
              }}
            />
            {searchOpen ? (
              <button
                type="button"
                className="bh-clear-btn"
                aria-label="清除搜索"
                onClick={(event) => {
                  event.stopPropagation();
                  store.setQuery('');
                  setSearchOpen(false);
                }}
              >
                <IconCloseFill14 />
              </button>
            ) : null}
          </div>
        </div>
        <div className={`bh-header-actions${searchOpen ? ' bh-header-actions-hidden' : ''}`}>
          <Menu
            open={sortMenuOpen}
            portal
            dense
            align="end"
            anchor={
              <Tooltip label="排序方式" side="bottom" delayMs={500}>
                <button
                  type="button"
                  className="bh-icon-btn"
                  aria-label="排序方式"
                  onClick={() => {
                    setSortMenuOpen((value) => !value);
                  }}
                >
                  <IconEllipsisOutline16 size={16} />
                </button>
              </Tooltip>
            }
            items={globalSortMenuItems()}
            selectedId={state.config.sortMode}
            onSelect={selectSortMenu}
            onClose={() => {
              setSortMenuOpen(false);
            }}
          />
          <Menu
            open={menuOpen}
            portal
            dense
            align="end"
            anchor={
              <Tooltip label="新建" side="bottom" delayMs={500}>
                <button
                  type="button"
                  className="bh-icon-btn"
                  aria-label="新建"
                  onClick={() => {
                    setMenuOpen((value) => !value);
                  }}
                >
                  <IconPlusOutline16 size={16} />
                </button>
              </Tooltip>
            }
            items={menuItems()}
            onSelect={selectMenu}
            onClose={() => {
              setMenuOpen(false);
            }}
          />
        </div>
      </div>

      {state.status === 'loading' && state.bots.length === 0 ? (
        <div className="bh-note">正在加载 BOT…</div>
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">名册加载失败：{state.error}</div>
      ) : null}
      {state.status === 'ready' && state.bots.length === 0 && groupChannels.length === 0 ? (
        <div className="bh-note">还没有 BOT。创建向导与 Builder 随 v1.1 到来。</div>
      ) : null}
      {visibleCount === 0 && (state.bots.length > 0 || groupChannels.length > 0) ? (
        <div className="bh-note">没有匹配的 BOT 或频道</div>
      ) : null}

      {pinnedBots.length > 0 ? (
        <div className="bh-pinned-grid">
          {pinnedBots.map((bot) => {
            const selected = selectedBot === bot.slug;
            return (
              <button
                key={bot.slug}
                type="button"
                className={`bh-pinned${selected ? ' bh-selected' : ''}`}
                onClick={() => void actions.openBot(bot.slug)}
              >
                <Blobatar seed={bot.slug} size={54} />
                <span className="bh-name">{bot.displayName}</span>
                {bot.tag !== undefined ? <Tag tone="neutral">{bot.tag}</Tag> : null}
              </button>
            );
          })}
        </div>
      ) : null}

      {flatBots.length > 0 ? (
        <div className="bh-list-area">
          {flatBots.map((bot) => (
            <BotRow
              key={bot.slug}
              bot={bot}
              selected={selectedBot === bot.slug}
              actions={actions}
            />
          ))}
        </div>
      ) : null}

      {sections.map(({ section, channels: sectionChannels }) => {
        const collapsed = section.collapsed === true;
        const menuOpenForSection = sectionMenuId === section.id;
        return (
          <div key={section.id} className="bh-section">
            <div className="bh-list-area">
              <div
                className={`bh-section-head${menuOpenForSection ? ' bh-menu-open' : ''}`}
                role="button"
                tabIndex={0}
                aria-expanded={!collapsed}
                onClick={() => toggleSection(section.id)}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  toggleSection(section.id);
                }}
              >
                <span className="bh-row-slot" aria-hidden="true">
                  <IconTriangleRightFill14
                    className={collapsed ? 'bh-arrow' : 'bh-arrow bh-arrow-open'}
                  />
                </span>
                <span className="bh-section-name">{section.name}</span>
                <span className="bh-section-count">{sectionChannels.length}</span>
                <span className="bh-row-actions">
                  <Menu
                    open={menuOpenForSection}
                    portal
                    dense
                    align="end"
                    closeOnPointerLeave
                    anchor={
                      <button
                        type="button"
                        className="bh-row-action"
                        aria-label={`「${section.name}」排序方式`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setSectionMenuId((value) =>
                            value === section.id ? undefined : section.id,
                          );
                        }}
                      >
                        <IconEllipsisOutline16 />
                      </button>
                    }
                    items={sectionMenuItems()}
                    selectedId={sectionSortMode(section)}
                    onSelect={(id) => selectSectionMenu(section, id)}
                    onClose={() => {
                      setSectionMenuId(undefined);
                    }}
                  />
                  <button
                    type="button"
                    className="bh-row-action"
                    aria-label={`在「${section.name}」中创建频道`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setCreateRequest({ kind: 'channel', sectionId: section.id });
                    }}
                  >
                    <IconPlusOutline16 />
                  </button>
                </span>
              </div>
              {collapsed
                ? null
                : sectionChannels.map((channel) => (
                    <ChannelRow
                      key={channel.id}
                      channel={channel}
                      selected={selectedChannel === channel.id}
                      actions={actions}
                    />
                  ))}
            </div>
          </div>
        );
      })}

      {ungroupedChannels.length > 0 ? (
        <div className="bh-section">
          <div className="bh-list-area">
            <div className="bh-ungrouped-head">
              <span className="bh-section-name">{UNGROUPED_LABEL}</span>
              <span className="bh-section-count">{ungroupedChannels.length}</span>
            </div>
            {ungroupedChannels.map((channel) => (
              <ChannelRow
                key={channel.id}
                channel={channel}
                selected={selectedChannel === channel.id}
                actions={actions}
              />
            ))}
          </div>
        </div>
      ) : null}

      {createRequest?.kind === 'section' ? (
        <CreateSectionModal
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={(name) => {
            persistConfig(addSection(store.getSnapshot().config, name));
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {createRequest?.kind === 'channel' ? (
        <CreateChannelModal
          key={createSectionId ?? 'root'}
          sectionName={createSection?.name}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={async (name) => {
            const channel = await actions.createGroup(name);
            if (channel === undefined) return;
            if (createSectionId !== undefined) {
              persistConfig(
                addChannelToSection(store.getSnapshot().config, createSectionId, channel.id),
              );
            }
            setCreateRequest(undefined);
          }}
        />
      ) : null}

      {renameTarget !== undefined ? (
        <SectionRenameModal
          key={renameTarget.id}
          section={renameTarget}
          onCancel={() => {
            setRenameTarget(undefined);
          }}
          onRename={(name) => {
            persistConfig(renameSection(store.getSnapshot().config, renameTarget.id, name));
            setRenameTarget(undefined);
          }}
        />
      ) : null}
      {deleteTarget !== undefined ? (
        <SectionDeleteModal
          section={deleteTarget}
          onCancel={() => {
            setDeleteTarget(undefined);
          }}
          onDelete={() => {
            persistConfig(removeSection(store.getSnapshot().config, deleteTarget.id));
            if (createSectionId === deleteTarget.id) setCreateRequest(undefined);
            setDeleteTarget(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

function menuItems(): MenuEntry[] {
  return [
    {
      id: 'bot',
      label: '创建 BOT',
      icon: <IconAgentPresetOutline16 size={16} />,
      disabled: true,
    },
    {
      id: 'channel',
      label: '创建频道',
      icon: <IconNewChatOutline16 size={16} />,
    },
    {
      id: 'section',
      label: '创建频道分组',
      icon: <IconFolderOpenOutline16 size={16} />,
    },
  ];
}
