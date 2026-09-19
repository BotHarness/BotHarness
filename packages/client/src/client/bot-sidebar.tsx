import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  Button,
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconCloseFill14,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  Input,
  Menu,
  StateDot,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { Blobatar } from './avatar.js';
import { errorMessage } from './bridge.js';
import { needsYou, STATE_LABELS, toBotState, toStateDot } from './labels.js';
import {
  addSection,
  defaultStorage,
  saveRosterConfig,
  toggleSectionCollapsed,
  type ChannelSectionConfig,
} from './roster-config.js';
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
      className={`bh-contact${selected ? ' bh-selected' : ''}`}
      onClick={() => void actions.openChannel(channel.id)}
    >
      <span className="bh-channel-mark" aria-hidden="true">
        #
      </span>
      <span className="bh-body">
        <span className="bh-top">
          <span className="bh-name">{channel.name}</span>
        </span>
        <span className="bh-msg">
          {channel.members.length > 0 ? `${channel.members.length} 位成员` : '还没有成员'}
        </span>
      </span>
    </button>
  );
}

export function BotSidebar({ wide, actions }: SidebarProps): ReactElement {
  const state = useClientState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [createMode, setCreateMode] = useState<'channel' | 'section' | undefined>(undefined);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);
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
  const flatChannels = channels.filter((channel) => !sectionedIds.has(channel.id));
  const sections: SectionView[] = state.config.sections
    .map((section) => ({
      section,
      channels: channels.filter((channel) => section.channels.includes(channel.id)),
    }))
    .filter((entry) => query.length === 0 || entry.channels.length > 0);
  const visibleCount =
    pinnedBots.length +
    flatBots.length +
    flatChannels.length +
    sections.reduce((total, entry) => total + entry.channels.length, 0);
  const selectedBot = state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    state.selection?.kind === 'channel' ? state.selection.channelId : undefined;

  const selectMenu = (id: string): void => {
    setMenuOpen(false);
    if (id === 'channel' || id === 'section') {
      setCreateName('');
      setCreateError(undefined);
      setCreateMode(id);
    }
  };

  const submitCreate = async (): Promise<void> => {
    const name = createName.trim();
    if (name.length === 0 || creating || createMode === undefined) return;
    if (createMode === 'section') {
      const next = addSection(state.config, name);
      store.setConfig(next);
      saveRosterConfig(next, defaultStorage());
      setCreateMode(undefined);
      setCreateName('');
      return;
    }
    setCreating(true);
    setCreateError(undefined);
    try {
      const channel = await actions.createGroup(name);
      if (channel !== undefined) {
        setCreateMode(undefined);
        setCreateName('');
      }
    } catch (error) {
      setCreateError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const menuItems: MenuEntry[] = [
    {
      id: 'bot',
      label: '创建 BOT',
      icon: <IconAgentPresetOutline16 size={16} />,
      disabled: true,
    },
    {
      id: 'channel',
      label: '创建 Channel',
      icon: <IconNewChatOutline16 size={16} />,
    },
    {
      id: 'section',
      label: '创建 Channel section',
      icon: <IconFolderOpenOutline16 size={16} />,
    },
  ];

  const toggleSection = (sectionId: string): void => {
    const next = toggleSectionCollapsed(state.config, sectionId);
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };

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
              placeholder="搜索 BOT 或 Channel"
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
            items={menuItems}
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
        <div className="bh-note">没有匹配的 BOT 或 Channel</div>
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

      <div className="bh-list-area">
        {flatBots.map((bot) => (
          <BotRow key={bot.slug} bot={bot} selected={selectedBot === bot.slug} actions={actions} />
        ))}
        {flatChannels.map((channel) => (
          <ChannelRow
            key={channel.id}
            channel={channel}
            selected={selectedChannel === channel.id}
            actions={actions}
          />
        ))}
      </div>

      {sections.map(({ section, channels: sectionChannels }) => {
        const collapsed = section.collapsed === true;
        return (
          <div key={section.id}>
            <button
              type="button"
              className="bh-section-head"
              aria-expanded={!collapsed}
              onClick={() => toggleSection(section.id)}
            >
              {collapsed ? (
                <IconChevronRightOutline14 size={14} />
              ) : (
                <IconChevronDownOutline14 size={14} />
              )}
              <span className="bh-section-name">{section.name}</span>
              <span className="bh-section-count">{sectionChannels.length}</span>
            </button>
            {collapsed ? null : (
              <div className="bh-list-area">
                {sectionChannels.map((channel) => (
                  <ChannelRow
                    key={channel.id}
                    channel={channel}
                    selected={selectedChannel === channel.id}
                    actions={actions}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {createMode !== undefined ? (
        <div className="bh-create-card">
          <div className="bh-create-title">
            {createMode === 'section' ? '创建 Channel section' : '创建 Channel'}
          </div>
          <div className="bh-note">
            {createMode === 'section'
              ? '新 section 只影响本机名册的分组显示。'
              : '先建一个本地 Channel；BOT 参与和消息投递随 v1.1 到来。'}
          </div>
          <Input
            autoFocus
            placeholder={createMode === 'section' ? 'Section 名称' : 'Channel 名称'}
            value={createName}
            onChange={(event) => setCreateName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitCreate();
              }
            }}
          />
          <div className="bh-create-actions">
            <Button variant="ghost" size="sm" onClick={() => setCreateMode(undefined)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={createName.trim().length === 0 || creating}
              onClick={() => void submitCreate()}
            >
              创建
            </Button>
          </div>
          {createError !== undefined ? (
            <div className="bh-error">创建失败：{createError}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
