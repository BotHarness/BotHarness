import { useState, useSyncExternalStore, type ReactElement } from 'react';

import {
  Button,
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
  IconNewChatOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  Input,
  Menu,
  StateDot,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { Blobatar } from './avatar.js';
import { errorMessage } from './bridge.js';
import { needsYou, STATE_LABELS, toBotState, toStateDot } from './labels.js';
import {
  defaultStorage,
  saveRosterConfig,
  toggleSectionCollapsed,
  type ChannelSectionConfig,
} from './roster-config.js';
import { store, type BotSummary, type ChannelSummary, type ClientState } from './store.js';

export function useClientState(): ClientState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export function BotPanelIcon({ size }: { size: number }): ReactElement {
  return <IconAgentPresetOutline16 size={size} />;
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
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupError, setGroupError] = useState<string | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  if (!wide) return <div className="bh-root bh-region bh-region-rail" />;

  const query = state.query.trim().toLowerCase();
  const bots = state.bots.filter(
    (bot) => matchesQuery(query, bot.displayName, bot.tag) || bot.slug.includes(query),
  );
  const channels = state.channels.filter(
    (channel) => channel.type === 'group' && matchesQuery(query, channel.name),
  );
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
    if (id === 'group') {
      setGroupName('');
      setGroupError(undefined);
      setGroupOpen(true);
    }
  };

  const submitGroup = async (): Promise<void> => {
    const name = groupName.trim();
    if (name.length === 0 || creating) return;
    setCreating(true);
    setGroupError(undefined);
    try {
      const channel = await actions.createGroup(name);
      if (channel !== undefined) {
        setGroupOpen(false);
        setGroupName('');
      }
    } catch (error) {
      setGroupError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  };

  const toggleSection = (sectionId: string): void => {
    const next = toggleSectionCollapsed(state.config, sectionId);
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };

  return (
    <div className="bh-root bh-region">
      <div className="bh-search-row">
        <Input
          className="bh-search-input"
          icon={<IconSearchOutline16 size={16} />}
          type="search"
          placeholder="搜索 BOT 或 Channel"
          value={state.query}
          onChange={(event) => store.setQuery(event.target.value)}
        />
        <Menu
          open={menuOpen}
          portal
          anchor={
            <Tooltip label="新建" delayMs={500}>
              <button
                type="button"
                className="bh-icon-btn"
                aria-label="新建"
                onClick={() => setMenuOpen((value) => !value)}
              >
                <IconPlusOutline16 size={16} />
              </button>
            </Tooltip>
          }
          items={[
            { id: 'group', label: '新建群聊', icon: <IconNewChatOutline16 size={16} /> },
            {
              id: 'bot',
              label: '新建 BOT（创建向导开发中）',
              icon: <IconAgentPresetOutline16 size={16} />,
              disabled: true,
            },
          ]}
          onSelect={selectMenu}
          onClose={() => setMenuOpen(false)}
        />
      </div>

      {state.status === 'loading' && state.bots.length === 0 ? (
        <div className="bh-note">正在加载 BOT…</div>
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">名册加载失败：{state.error}</div>
      ) : null}
      {state.status === 'ready' && state.bots.length === 0 && channels.length === 0 ? (
        <div className="bh-note">还没有 BOT。创建向导与 Builder 随 v1.1 到来。</div>
      ) : null}
      {visibleCount === 0 && (state.bots.length > 0 || channels.length > 0) ? (
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

      {groupOpen ? (
        <div className="bh-create-card">
          <div className="bh-create-title">新建群聊</div>
          <div className="bh-note">先建一个本地群聊；BOT 参与和消息投递随 v1.1 到来。</div>
          <Input
            autoFocus
            placeholder="群聊名称"
            value={groupName}
            onChange={(event) => setGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                void submitGroup();
              }
            }}
          />
          <div className="bh-create-actions">
            <Button variant="ghost" size="sm" onClick={() => setGroupOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={groupName.trim().length === 0 || creating}
              onClick={() => void submitGroup()}
            >
              创建
            </Button>
          </div>
          {groupError !== undefined ? <div className="bh-error">创建失败：{groupError}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
