import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { createPortal } from 'react-dom';

import {
  Button,
  IconAgentPresetOutline16,
  IconChevronDownOutline14,
  IconCloseFill14,
  IconEllipsisOutline16,
  IconFolderOpenOutline16,
  IconNewChatOutline16,
  IconPlusOutline16,
  IconSearchOutline16,
  IconSettingsOutline16,
  HoverCard,
  Menu,
  StateDot,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';

import { isBotModeSortMode, type BotModeSortMode } from '../bot-mode-settings.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { BotIcon } from './bot-icon.js';
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { HashIcon } from './hash-icon.js';
import { HiddenChannelsModal, type HiddenChannelItem } from './hidden-channels.js';
import {
  useChannelDrag,
  useSectionDrag,
  type ChannelDragProps,
  type ChannelDropTarget,
  type ScopeId,
  type SectionDropTarget,
} from './channel-drag.js';
import { needsYou, STATE_LABELS, toBotState, toStateDot } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { personaBotActivity } from './persona-activity.js';
import { CreatePersonaBotModal } from './persona-bot-create.js';
import {
  defaultStorage,
  saveRosterConfig,
  toggleSectionCollapsed,
  type RosterConfig,
} from './roster-config.js';
import type { RosterSection } from './roster.js';
import {
  applyChannelMove,
  completeFlatEntries,
  flatRosterChannelIds,
  moveWithinOrder,
  orderScopeChannels,
  planChannelMove,
  planFlatInsert,
  resolvePinnedChannelIds,
  resolvedSortMode,
  resolveBlockDropTarget,
  rowDropHalf,
  type ChannelMoveSink,
  type FlatAnchor,
  type ScopeDropTarget,
} from './roster-order.js';
import {
  ChannelRenameModal,
  channelMoveMenuItems,
  CreateChannelModal,
  CreateSectionModal,
  globalSortMenuItems,
  SectionDeleteModal,
  SectionRenameModal,
  NEW_SECTION_MOVE_TARGET,
  sectionMenuItems,
  UNGROUPED_MOVE_TARGET,
} from './section-management.js';
import { store, type BotSummary, type ChannelSummary, type ClientState } from './store.js';

export function useClientState(): ClientState {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}

export interface BotPanelEntryProps {
  size: number;
  active: boolean;
  /** Live preference hook injected by the panellist registration. */
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  /** Open Settings on the Bot section; injected by the panellist registration. */
  openSettings: () => void;
  /** Slot-provided translator for the BotHarness namespace. */
  t: BotHarnessTranslate;
}

/**
 * Sidebar panel glyph for the selected panel. While the panel is active the
 * whole shell row becomes the exit target (a hit layer portaled into the row
 * button) and, in the wide sidebar, a settings gear fades in on hover that
 * opens the Bot section of the Settings dialog. The shell's row is a button,
 * so the overlay is a span with a button role — nesting a real button inside
 * it would be invalid.
 */
export function BotPanelIcon({
  size,
  active,
  onExit,
  useBotModePrefs,
  openSettings,
  t,
}: BotPanelEntryProps & { onExit: () => void }): ReactElement {
  const icon = useBotModePrefs((prefs) => prefs.botIcon);
  const glyph = useRef<HTMLSpanElement>(null);
  const [row, setRow] = useState<HTMLElement | null>(null);
  const wide = size === 16;

  useEffect(() => {
    setRow(glyph.current?.closest('button') ?? null);
  }, []);

  return (
    <span className="bh-panel-glyph" ref={glyph}>
      <BotIcon icon={icon} size={size} />
      {active && row !== null
        ? createPortal(
            <>
              <span
                className="bh-panel-glyph-hit"
                aria-hidden="true"
                onClickCapture={(event) => {
                  event.stopPropagation();
                  onExit();
                }}
              />
              {wide ? (
                <span
                  className="bh-panel-gear"
                  role="button"
                  aria-label={t('panel.settings')}
                  title={t('panel.settings')}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSettings();
                  }}
                >
                  <IconSettingsOutline16 size={14} />
                </span>
              ) : null}
            </>,
            row,
          )
        : null}
    </span>
  );
}

export function createBotPanelEntry(
  onExit: () => void,
): (props: BotPanelEntryProps) => ReactElement {
  return function BotPanelEntry({ size, active, useBotModePrefs, openSettings, t }) {
    return (
      <BotPanelIcon
        size={size}
        active={active}
        onExit={onExit}
        useBotModePrefs={useBotModePrefs}
        openSettings={openSettings}
        t={t}
      />
    );
  };
}

interface SidebarProps {
  wide: boolean;
  actions: BridgeActions;
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  t: BotHarnessTranslate;
}

/** One row/card's request to open its context menu at a viewport point. */
interface ChannelMenuRequest {
  channelId: string;
  pinnedView?: boolean;
  x: number;
  y: number;
}

/** One section header's request to open the same menu at a viewport point. */
interface SectionMenuRequest {
  sectionId: string;
  x: number;
  y: number;
}

/** One Channel moving between the ordinary roster and the pinned grid. */
interface PinDragState {
  channelId: string;
  source: 'roster' | 'pinned';
}

function matchesQuery(query: string, ...values: (string | undefined)[]): boolean {
  if (query.length === 0) return true;
  return values.some((value) => (value ?? '').toLowerCase().includes(query));
}

function RoleBadges({ roles }: { roles: readonly string[] }): ReactElement | null {
  if (roles.length === 0) return null;
  return (
    <span className="bh-role-badges">
      {roles.map((role) => (
        <Tag key={role} tone="neutral">
          {role}
        </Tag>
      ))}
    </span>
  );
}

function BotRow({
  bot,
  channel,
  activity,
  selected,
  actions,
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: PersonaBotActivityState;
  selected: boolean;
  actions: BridgeActions;
  drag: ChannelDragProps;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart: (channelId: string) => void;
  onPinDragEnd: () => void;
}): ReactElement {
  const botState = toBotState(bot.aggregateState);
  const markerClass =
    drag.marker === 'before' ? ' bh-drop-before' : drag.marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag.source ? ' bh-drag-source' : '';
  return (
    <button
      type="button"
      data-channel-id={channel.id}
      className={`bh-contact${selected ? ' bh-selected' : ''}${markerClass}${sourceClass}`}
      onClick={() => void actions.openBot(bot.slug)}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', channel.id);
        drag.start();
        onPinDragStart(channel.id);
      }}
      onDragEnd={() => {
        drag.end();
        onPinDragEnd();
      }}
      onDragOver={(event) => {
        if (!drag.active) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
      }}
      onDrop={(event) => {
        if (!drag.active) return;
        event.preventDefault();
        event.stopPropagation();
        drag.drop(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ channelId: channel.id, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        const keyboardMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
        if (!keyboardMenu) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu({ channelId: channel.id, x: rect.left + 8, y: rect.bottom });
      }}
    >
      <PersonaBotAvatar
        personaBotId={bot.slug}
        name={bot.displayName}
        src={bot.avatar}
        state={activity}
        size={34}
      />
      <span className="bh-body">
        <span className="bh-top">
          <span className="bh-name">{bot.displayName}</span>
          <RoleBadges roles={bot.roles} />
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
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
}: {
  channel: ChannelSummary;
  selected: boolean;
  actions: BridgeActions;
  drag?: ChannelDragProps | undefined;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart?: ((channelId: string) => void) | undefined;
  onPinDragEnd?: (() => void) | undefined;
}): ReactElement {
  const marker = drag?.marker ?? null;
  const markerClass =
    marker === 'before' ? ' bh-drop-before' : marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag?.source === true ? ' bh-drag-source' : '';
  return (
    <button
      type="button"
      data-channel-id={channel.id}
      className={`bh-channel-row${selected ? ' bh-selected' : ''}${markerClass}${sourceClass}`}
      onClick={() => void actions.openChannel(channel.id)}
      draggable={drag !== undefined}
      onDragStart={
        drag === undefined
          ? undefined
          : (event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', channel.id);
              drag.start();
              onPinDragStart?.(channel.id);
            }
      }
      onDragEnd={
        drag === undefined
          ? undefined
          : () => {
              drag.end();
              onPinDragEnd?.();
            }
      }
      onDragOver={
        drag === undefined
          ? undefined
          : (event) => {
              if (!drag.active) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = 'move';
              drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
            }
      }
      onDrop={
        drag === undefined
          ? undefined
          : (event) => {
              if (!drag.active) return;
              event.preventDefault();
              event.stopPropagation();
              drag.drop(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
            }
      }
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu({ channelId: channel.id, x: event.clientX, y: event.clientY });
      }}
      onKeyDown={(event) => {
        const keyboardMenu = event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
        if (!keyboardMenu) return;
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        onMenu({ channelId: channel.id, x: rect.left + 8, y: rect.bottom });
      }}
    >
      <span className="bh-channel-slot" aria-hidden="true">
        <HashIcon size={16} />
      </span>
      <span className="bh-channel-title">{channel.name}</span>
      <span className="bh-channel-meta">
        {channel.members.length > 0 ? `${channel.members.length} 位成员` : '还没有成员'}
      </span>
    </button>
  );
}

function RailChannel({
  channel,
  bot,
  activity,
  selected,
  summary,
  actions,
  t,
}: {
  channel: ChannelSummary;
  bot: BotSummary | undefined;
  activity: PersonaBotActivityState | undefined;
  selected: boolean;
  summary: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const title = bot?.displayName ?? channel.name;
  const open = (): void => {
    void (bot === undefined ? actions.openChannel(channel.id) : actions.openBot(bot.slug));
  };
  return (
    <HoverCard
      openDelayMs={350}
      copyLabel={t('rail.copy')}
      copiedLabel={t('rail.copied')}
      anchor={
        <button
          type="button"
          className={`bh-rail-channel${selected ? ' bh-selected' : ''}`}
          aria-label={title}
          aria-current={selected ? 'page' : undefined}
          onClick={open}
        >
          {bot === undefined ? (
            <span className="bh-rail-channel-icon" aria-hidden="true">
              <HashIcon size={18} />
            </span>
          ) : (
            <PersonaBotAvatar
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              state={activity}
              size={32}
            />
          )}
        </button>
      }
      content={
        <div className="bh-rail-preview">
          <div className="bh-rail-preview-head">
            {bot === undefined ? (
              <span className="bh-rail-preview-icon" aria-hidden="true">
                <HashIcon size={16} />
              </span>
            ) : (
              <PersonaBotAvatar
                personaBotId={bot.slug}
                name={bot.displayName}
                src={bot.avatar}
                state={activity}
                size={24}
                indicator={false}
              />
            )}
            <span className="bh-rail-preview-title">{title}</span>
          </div>
          {bot !== undefined && bot.roles.length > 0 ? (
            <span className="bh-rail-preview-meta">{bot.roles.join(' · ')}</span>
          ) : null}
          {bot?.description === undefined ? null : (
            <span className="bh-rail-preview-description">{bot.description}</span>
          )}
          <span className="bh-rail-preview-summary">{summary}</span>
        </div>
      }
    />
  );
}

/** Open creation dialog for one production-backed Bot, Channel, or section. */
type CreateRequest =
  | { kind: 'bot'; sectionId?: string }
  | { kind: 'section'; moveChannelId?: string; pinned?: boolean }
  | { kind: 'channel'; sectionId?: string };

/** One rendered flat block: a section with its visible rows, or a loose channel run. */
type FlatBlockView =
  | { kind: 'section'; section: RosterSection; channels: ChannelSummary[] }
  | { kind: 'loose'; channels: ChannelSummary[] };

export function BotSidebar({
  wide,
  actions,
  useBotModePrefs,
  setSortMode,
  setSectionSortMode,
  t,
}: SidebarProps): ReactElement {
  const state = useClientState();
  const prefs = useBotModePrefs((value) => value);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [hiddenManagerOpen, setHiddenManagerOpen] = useState(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [sectionCreateMenuId, setSectionCreateMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuRequest | undefined>(undefined);
  const [pinDrag, setPinDrag] = useState<PinDragState | undefined>(undefined);
  const [pinZoneArmed, setPinZoneArmed] = useState(false);
  const [sectionContextMenu, setSectionContextMenu] = useState<SectionMenuRequest | undefined>();
  const [channelRenameTarget, setChannelRenameTarget] = useState<ChannelSummary | undefined>();
  const [pinZoneHovered, setPinZoneHovered] = useState(false);
  const [unpinZoneArmed, setUnpinZoneArmed] = useState(false);
  const [unpinZoneHovered, setUnpinZoneHovered] = useState(false);
  const [createRequest, setCreateRequest] = useState<CreateRequest | undefined>(undefined);
  const [renameTarget, setRenameTarget] = useState<RosterSection | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<RosterSection | undefined>(undefined);
  const searchRoot = useRef<HTMLDivElement | null>(null);
  const searchInput = useRef<HTMLInputElement | null>(null);
  const pinZoneArmTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    },
    [],
  );

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

  const query = state.query.trim().toLowerCase();
  const botBySlug = new Map(state.bots.map((bot) => [bot.slug, bot]));
  const hiddenChannelSet = new Set(state.roster.hidden);
  const allPinnedChannelIds = resolvePinnedChannelIds(state.channels, state.roster.pins);
  const allPinnedChannelSet = new Set(allPinnedChannelIds);
  const pinnedChannelIds = allPinnedChannelIds.filter((id) => !hiddenChannelSet.has(id));
  const hasPinnedChannels = pinnedChannelIds.length > 0;
  const hasPinnableChannels = state.channels.some(
    (channel) =>
      !hiddenChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined),
  );
  const pinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined) return [];
    if (channel.type === 'group') {
      return matchesQuery(query, channel.name) ? [channel] : [];
    }
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles) ? [channel] : [];
  });
  const arrangedChannels = state.channels.filter(
    (channel) =>
      !allPinnedChannelSet.has(channel.id) &&
      (channel.type === 'group' || channel.botSlug !== undefined),
  );
  const rosterChannels = arrangedChannels.filter((channel) => !hiddenChannelSet.has(channel.id));
  const channels = rosterChannels.filter((channel) => {
    if (channel.type === 'group') return matchesQuery(query, channel.name);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles);
  });
  const sectionedIds = new Set(state.roster.sections.flatMap((section) => section.channelIds));
  const rosterChannelIds = flatRosterChannelIds(state.channels, allPinnedChannelSet);
  /**
   * Flat top-level entries in display order: the host `topOrder` completed
   * with channels the flat list does not know yet (appended at the end), or —
   * for a pre-flat host — the legacy projection (sections, then every
   * unsectioned channel loose at the end). The bottom-fixed 未分组 bucket is
   * retired: unsectioned channels render as loose runs between the blocks.
   */
  const flatEntries = completeFlatEntries(
    state.roster.topOrder,
    state.roster.sections.map((section) => section.id),
    rosterChannelIds,
    sectionedIds,
  );
  /**
   * Resolve one section's order from a channel source. Rendering passes the
   * query-filtered list; the drag commit passes the unfiltered list so a
   * filtered view can never change membership semantics.
   */
  const sectionOrder = (
    section: RosterSection,
    source: readonly ChannelSummary[],
  ): ChannelSummary[] => {
    const visible = source.filter((channel) => section.channelIds.includes(channel.id));
    const mode = resolvedSortMode(prefs.sortModes[section.id], prefs.sortMode);
    return orderScopeChannels(visible, mode, section.channelIds);
  };
  /**
   * One scope's full displayed order from the unfiltered roster and the live
   * host snapshot, so a search filter can never change membership or drop
   * position. `undefined` resolves the 未分组 bucket.
   */
  const scopeChannelsOf = (scopeId: ScopeId): ChannelSummary[] => {
    if (scopeId === undefined) {
      const snapshot = store.getSnapshot();
      const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
      return orderScopeChannels(
        arrangedChannels.filter((channel) => !sectioned.has(channel.id)),
        prefs.sortMode,
      );
    }
    const section = store
      .getSnapshot()
      .roster.sections.find((candidate) => candidate.id === scopeId);
    return section === undefined ? [] : sectionOrder(section, arrangedChannels);
  };
  const sectionOfChannel = (channelId: string): string | undefined =>
    store.getSnapshot().roster.sections.find((section) => section.channelIds.includes(channelId))
      ?.id;
  const channelById = new Map(channels.map((channel) => [channel.id, channel]));
  /**
   * Partition the flat entries into render blocks, resolving loose entries to
   * their channels and grouping consecutive loose channels into one run.
   * Loose runs keep their flat positions in every sort mode (explicit
   * placements — auto never yanks them); only section members auto-sort.
   */
  const flatBlocks: FlatBlockView[] = (() => {
    const blocks: FlatBlockView[] = [];
    let run: ChannelSummary[] = [];
    const flushRun = (): void => {
      if (run.length > 0) {
        blocks.push({ kind: 'loose', channels: run });
        run = [];
      }
    };
    for (const entry of flatEntries) {
      if (entry.kind === 'section') {
        flushRun();
        const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
        if (section === undefined) continue;
        const visible = sectionOrder(section, channels);
        if (query.length > 0 && visible.length === 0) continue;
        blocks.push({ kind: 'section', section, channels: visible });
      } else {
        const channel = channelById.get(entry.id);
        if (channel === undefined) continue;
        run.push(channel);
      }
    }
    flushRun();
    if (query.length > 0) return blocks.filter((block) => block.channels.length > 0);
    return blocks;
  })();
  const railPinnedChannels = pinnedChannelIds.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    return channel === undefined ? [] : [channel];
  });
  const railChannels = flatEntries.flatMap((entry) => {
    if (entry.kind === 'channel') {
      const channel = rosterChannels.find((candidate) => candidate.id === entry.id);
      return channel === undefined ? [] : [channel];
    }
    const section = state.roster.sections.find((candidate) => candidate.id === entry.id);
    return section === undefined ? [] : sectionOrder(section, rosterChannels);
  });
  const hiddenItems: HiddenChannelItem[] = state.roster.hidden.flatMap((channelId) => {
    const channel = state.channels.find((candidate) => candidate.id === channelId);
    if (channel === undefined || (channel.type === 'dm' && channel.botSlug === undefined))
      return [];
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return [
      {
        channel,
        ...(bot === undefined ? {} : { bot, activity: personaBotActivity(state, bot) }),
      },
    ];
  });
  const visibleCount =
    pinnedChannels.length + flatBlocks.reduce((total, block) => total + block.channels.length, 0);
  const selectedBot = state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    state.selection?.kind === 'channel' ? state.selection.channelId : undefined;
  const contextSection = state.roster.sections.find(
    (section) => section.id === sectionContextMenu?.sectionId,
  );
  const contextSectionIndex =
    contextSection === undefined ? -1 : state.roster.sections.indexOf(contextSection);

  const persistConfig = (next: RosterConfig): void => {
    store.setConfig(next);
    saveRosterConfig(next, defaultStorage());
  };

  const selectMenu = (id: string): void => {
    setMenuOpen(false);
    if (id === 'bot') setCreateRequest({ kind: 'bot' });
    if (id === 'channel') setCreateRequest({ kind: 'channel' });
    if (id === 'section') setCreateRequest({ kind: 'section' });
  };

  const selectSortMenu = (id: string): void => {
    setSortMenuOpen(false);
    if (id === 'hidden') {
      setHiddenManagerOpen(true);
      return;
    }
    if (isBotModeSortMode(id)) setSortMode(id);
  };

  const selectSectionMenu = (section: RosterSection, id: string): void => {
    setSectionMenuId(undefined);
    setSectionContextMenu(undefined);
    if (id === 'inherit') {
      setSectionSortMode(section.id, undefined);
      return;
    }
    if (isBotModeSortMode(id)) {
      setSectionSortMode(section.id, id);
      return;
    }
    if (id === 'move-up' || id === 'move-down') {
      const sections = store.getSnapshot().roster.sections;
      const index = sections.findIndex((candidate) => candidate.id === section.id);
      const target = sections[index + (id === 'move-up' ? -1 : 1)];
      if (target === undefined) return;
      const order = moveWithinOrder(
        sections.map((candidate) => candidate.id),
        section.id,
        target.id,
        id === 'move-up' ? 'before' : 'after',
      );
      if (order !== undefined) void actions.reorderSections(order);
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

  /**
   * Callbacks that apply one planned move: the settings-store unlock, the
   * positioned section writes, and the single ungrouped assign.
   */
  const moveSink: ChannelMoveSink = {
    assignToUngrouped: (channelId) => {
      void actions.assignChannel(channelId, undefined);
    },
    moveToSection: (channelId, sectionId, order) => {
      void actions.moveChannel(channelId, sectionId, order);
    },
    setSectionManual: (sectionId) => {
      setSectionSortMode(sectionId, 'manual');
    },
  };

  /**
   * Resolve and commit one move: the target's full displayed order drives the
   * plan, so a search filter can never change membership or drop position and
   * members hidden by the filter keep their place. The source scope is never
   * touched.
   */
  const runChannelMove = (
    channelId: string,
    sourceScopeId: ScopeId,
    targetScopeId: ScopeId,
    target: ScopeDropTarget,
  ): void => {
    const plan = planChannelMove(sourceScopeId, channelId, {
      targetScopeId,
      target,
      targetOrder: scopeChannelsOf(targetScopeId).map((channel) => channel.id),
      targetManualOverride:
        targetScopeId !== undefined && prefs.sortModes[targetScopeId] === 'manual',
    });
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    if (plan === undefined) {
      if (movingPinned && targetScopeId !== undefined && sourceScopeId === targetScopeId) {
        void actions.setChannelPinned(channelId, false);
        endPinDrag();
      }
      return;
    }
    if (movingPinned) {
      if (plan.kind === 'section') {
        if (plan.setManualOverride) setSectionSortMode(plan.sectionId, 'manual');
        void actions.movePinnedChannel(channelId, plan.sectionId, plan.order);
      } else {
        void actions.setChannelPinned(channelId, false);
      }
      endPinDrag();
      return;
    }
    applyChannelMove(moveSink, channelId, plan);
  };

  const commitChannelDrag = (
    drag: { scopeId: ScopeId; channelId: string },
    target: ChannelDropTarget,
  ): void => {
    if (target.channelId === drag.channelId) return;
    if (sectionOfChannel(target.channelId) === undefined) {
      // Loose row anchor: same flat position as a gap beside its entry.
      runFlatInsert(drag.channelId, drag.scopeId, {
        kind: 'channel',
        id: target.channelId,
        side: target.half,
      });
      return;
    }
    runChannelMove(drag.channelId, drag.scopeId, target.scopeId, {
      kind: 'row',
      channelId: target.channelId,
      half: target.half,
    });
  };

  /** A row-less section body uses its top prediction line as index zero. */
  const commitChannelScopeDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    scopeId: ScopeId,
  ): void => {
    runChannelMove(drag.channelId, drag.scopeId, scopeId, { kind: 'scope', position: 'first' });
  };

  /**
   * Resolve and commit one loose flat placement: the unfiltered flat entries
   * drive the plan, so a search filter can never move hidden channels. A
   * sectioned source is unassigned first (single ownership); no scope mode
   * changes anywhere — loose positions are explicit in every sort mode.
   */
  const runFlatInsert = (channelId: string, sourceScopeId: ScopeId, anchor: FlatAnchor): void => {
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const snapshotPinned = resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins);
    const snapshotChannelIds = flatRosterChannelIds(snapshot.channels, new Set(snapshotPinned));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      snapshotChannelIds,
      sectioned,
    );
    const movingPinned = pinDrag?.source === 'pinned' && pinDrag.channelId === channelId;
    const plan = planFlatInsert(
      flat,
      channelId,
      movingPinned || sourceScopeId !== undefined,
      anchor,
    );
    if (plan === undefined) return;
    if (movingPinned) {
      void actions.movePinnedChannelToFlat(channelId, plan.order);
      endPinDrag();
      return;
    }
    if (plan.unassign) {
      void actions.moveToFlat(channelId, plan.order);
    } else {
      void actions.reorderFlat(plan.order);
    }
  };

  /** A flat gap beside a section block: loose placement, no mode changes. */
  const commitChannelGapDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    target: { sectionId: string; half: 'before' | 'after' },
  ): void => {
    runFlatInsert(drag.channelId, drag.scopeId, {
      kind: 'section',
      id: target.sectionId,
      side: target.half,
    });
  };

  /** A context-menu pick targets a whole scope; the move appends to a section. */
  const commitChannelMenuMove = (
    channelId: string,
    targetSectionId: string | undefined,
    pinned: boolean,
  ): void => {
    if (!pinned) {
      runChannelMove(channelId, sectionOfChannel(channelId), targetSectionId, { kind: 'scope' });
      return;
    }
    if (targetSectionId !== undefined) {
      const order = [
        ...scopeChannelsOf(targetSectionId)
          .map((channel) => channel.id)
          .filter((id) => id !== channelId),
        channelId,
      ];
      setSectionSortMode(targetSectionId, 'manual');
      void actions.movePinnedChannel(channelId, targetSectionId, order);
      return;
    }
    const snapshot = store.getSnapshot();
    const sectioned = new Set(snapshot.roster.sections.flatMap((section) => section.channelIds));
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      flatRosterChannelIds(
        snapshot.channels,
        new Set(resolvePinnedChannelIds(snapshot.channels, snapshot.roster.pins)),
      ),
      sectioned,
    );
    void actions.movePinnedChannelToFlat(channelId, [...flat, { kind: 'channel', id: channelId }]);
  };

  /** Reorder the section headers with the same in-scope insert math as rows. */
  const commitSectionDrag = (sectionId: string, target: SectionDropTarget): void => {
    const order = moveWithinOrder(
      store.getSnapshot().roster.sections.map((section) => section.id),
      sectionId,
      target.sectionId,
      target.half,
    );
    if (order === undefined) return;
    void actions.reorderSections(order);
  };

  const openChannelMenu = (request: ChannelMenuRequest): void => {
    setMenuOpen(false);
    setSortMenuOpen(false);
    setSectionMenuId(undefined);
    setSectionCreateMenuId(undefined);
    setSectionContextMenu(undefined);
    setChannelMenu(request);
  };

  /**
   * Start one pin gesture. A layout-taking target opens on the next task so
   * its height transition cannot invalidate Chromium's native `dragstart`.
   */
  const startPinDrag = (channelId: string, source: PinDragState['source']): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    setPinDrag({ channelId, source });
    if (source === 'roster' && hasPinnedChannels) return;
    pinZoneArmTimer.current = window.setTimeout(() => {
      pinZoneArmTimer.current = undefined;
      if (source === 'roster') setPinZoneArmed(true);
      else setUnpinZoneArmed(true);
    }, 0);
  };

  /** End either pin gesture and clear every transient drop affordance. */
  const endPinDrag = (): void => {
    if (pinZoneArmTimer.current !== undefined) window.clearTimeout(pinZoneArmTimer.current);
    pinZoneArmTimer.current = undefined;
    setPinDrag(undefined);
    setPinZoneArmed(false);
    setPinZoneHovered(false);
    setUnpinZoneArmed(false);
    setUnpinZoneHovered(false);
  };

  const commitPinDrop = (pinned: boolean): void => {
    if (pinDrag === undefined) return;
    if (pinned ? pinDrag.source !== 'roster' : pinDrag.source !== 'pinned') return;
    void actions.setChannelPinned(pinDrag.channelId, pinned);
    endPinDrag();
  };

  const {
    active: channelDragActive,
    propsFor: channelDragProps,
    scopePropsFor: channelScopeDropProps,
    gapPropsFor: channelGapDropProps,
    clearGapHover,
  } = useChannelDrag(commitChannelDrag, commitChannelScopeDrop, commitChannelGapDrop);
  const { propsFor: sectionDragProps } = useSectionDrag(commitSectionDrag);

  const renderChannelRow = (channel: ChannelSummary, scopeId: ScopeId): ReactElement => {
    const drag = channelDragProps(scopeId, channel.id);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    if (channel.type === 'dm' && bot !== undefined) {
      return (
        <BotRow
          key={channel.id}
          bot={bot}
          channel={channel}
          activity={personaBotActivity(state, bot)}
          selected={selectedBot === bot.slug || selectedChannel === channel.id}
          actions={actions}
          drag={drag}
          onMenu={openChannelMenu}
          onPinDragStart={(channelId) => startPinDrag(channelId, 'roster')}
          onPinDragEnd={endPinDrag}
        />
      );
    }
    return (
      <ChannelRow
        key={channel.id}
        channel={channel}
        selected={selectedChannel === channel.id}
        actions={actions}
        drag={drag}
        onMenu={openChannelMenu}
        onPinDragStart={(channelId) => startPinDrag(channelId, 'roster')}
        onPinDragEnd={endPinDrag}
      />
    );
  };

  if (!wide) {
    const renderRailChannel = (channel: ChannelSummary): ReactElement => {
      const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
      const message = channel.latestMessage;
      const author =
        message?.author.kind === 'human'
          ? t('rail.you')
          : message?.author.kind === 'bot'
            ? (botBySlug.get(message.author.slug)?.displayName ?? message.author.slug)
            : message?.author.kind === 'bridged'
              ? message.author.source
              : undefined;
      const summary =
        message === undefined
          ? t('rail.noMessages')
          : `${author === undefined ? '' : `${author}：`}${message.body}`;
      return (
        <RailChannel
          key={channel.id}
          channel={channel}
          bot={bot}
          activity={bot === undefined ? undefined : personaBotActivity(state, bot)}
          selected={
            selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug)
          }
          summary={summary}
          actions={actions}
          t={t}
        />
      );
    };
    return (
      <div className="bh-root bh-region bh-region-rail" aria-label={t('rail.label')}>
        <div className="bh-rail-group">
          {railPinnedChannels.map((channel) => renderRailChannel(channel))}
        </div>
        {railPinnedChannels.length > 0 && railChannels.length > 0 ? (
          <span className="bh-rail-divider" aria-hidden="true" />
        ) : null}
        <div className="bh-rail-group">
          {railChannels.map((channel) => renderRailChannel(channel))}
        </div>
      </div>
    );
  }

  const createSectionId =
    createRequest?.kind === 'channel' || createRequest?.kind === 'bot'
      ? createRequest.sectionId
      : undefined;
  const createSection =
    createSectionId === undefined
      ? undefined
      : state.roster.sections.find((section) => section.id === createSectionId);

  /**
   * Resolve a channel drag over the sidebar root (outside every section
   * block and row) to a flat gap beside a section: the 12px margin bands
   * above/below each block. Anything else (bots, header, search) clears a
   * stale gap hover instead of committing.
   */
  const resolveGapTarget = (
    root: HTMLElement,
    clientY: number,
  ): { sectionId: string; half: 'before' | 'after' } | null => {
    const band = 12;
    const blocks = [...root.querySelectorAll('.bh-section[data-section-id]')]
      .map((element) => ({
        id: element.getAttribute('data-section-id') ?? '',
        top: element.getBoundingClientRect().top,
        bottom: element.getBoundingClientRect().bottom,
      }))
      .filter((block) => block.id !== '');
    for (const block of blocks) {
      if (clientY >= block.top - band && clientY < block.top) {
        return { sectionId: block.id, half: 'before' };
      }
      if (clientY >= block.bottom && clientY < block.bottom + band) {
        return { sectionId: block.id, half: 'after' };
      }
    }
    return null;
  };

  return (
    <div
      className="bh-root bh-region"
      onDragOver={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) {
          clearGapHover();
          return;
        }
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        channelGapDropProps(resolved.sectionId).hover(resolved.half);
      }}
      onDrop={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) return;
        event.preventDefault();
        channelGapDropProps(resolved.sectionId).drop(resolved.half);
      }}
    >
      <div className="bh-header">
        <span className={`bh-header-label${searchOpen ? ' bh-header-label-hidden' : ''}`}>
          消息
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
              placeholder="搜索 Bot 或频道"
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
              <Tooltip label={t('roster.menu.label')} side="bottom" delayMs={500}>
                <button
                  type="button"
                  className="bh-icon-btn"
                  aria-label={t('roster.menu.label')}
                  onClick={() => {
                    setSortMenuOpen((value) => !value);
                  }}
                >
                  <IconEllipsisOutline16 size={16} />
                </button>
              </Tooltip>
            }
            items={globalSortMenuItems(t)}
            selectedId={prefs.sortMode}
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
        <div className="bh-note">正在加载 Bot…</div>
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">名册加载失败：{state.error}</div>
      ) : null}
      {state.roster.readOnly ? <div className="bh-note">{t('roster.readOnly')}</div> : null}
      {state.status === 'ready' && state.bots.length === 0 ? (
        <div className="bh-empty-create">
          <span>还没有 PersonaBot。</span>
          <Button variant="outline" size="sm" onClick={() => setCreateRequest({ kind: 'bot' })}>
            创建第一个 PersonaBot
          </Button>
        </div>
      ) : null}
      {visibleCount === 0 && (state.bots.length > 0 || state.channels.length > 0) ? (
        <div className="bh-note">
          {query.length === 0 && hiddenItems.length > 0 ? t('hidden.all') : '没有匹配的 Bot 或频道'}
        </div>
      ) : null}

      {hasPinnableChannels ? (
        <div
          className={`bh-pin-zone${hasPinnedChannels ? ' bh-pin-zone-filled' : ' bh-pin-zone-empty'}${!hasPinnedChannels && !pinZoneArmed ? ' bh-pin-zone-hidden' : ''}${pinZoneHovered ? ' bh-pin-zone-active' : ''}`}
          role="region"
          aria-label={t('pin.zone.label')}
          aria-hidden={!hasPinnedChannels && !pinZoneArmed}
          onDragOver={(event) => {
            if (pinDrag?.source !== 'roster') return;
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = 'move';
            setPinZoneHovered(true);
          }}
          onDragLeave={(event) => {
            if (
              event.relatedTarget instanceof Node &&
              event.currentTarget.contains(event.relatedTarget)
            ) {
              return;
            }
            setPinZoneHovered(false);
          }}
          onDrop={(event) => {
            if (pinDrag?.source !== 'roster') return;
            event.preventDefault();
            event.stopPropagation();
            commitPinDrop(true);
          }}
        >
          {!hasPinnedChannels ? (
            <span className="bh-pin-zone-hint">{t('pin.drop')}</span>
          ) : (
            <div className="bh-pinned-grid">
              {pinnedChannels.map((channel) => {
                const bot =
                  channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
                const selected =
                  selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug);
                const dragSource = pinDrag?.source === 'pinned' && pinDrag.channelId === channel.id;
                const channelDrag = channelDragProps(sectionOfChannel(channel.id), channel.id);
                return (
                  <button
                    key={channel.id}
                    type="button"
                    className={`bh-pinned${selected ? ' bh-selected' : ''}${dragSource ? ' bh-drag-source' : ''}`}
                    onClick={() =>
                      void (bot === undefined
                        ? actions.openChannel(channel.id)
                        : actions.openBot(bot.slug))
                    }
                    draggable
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData('text/plain', channel.id);
                      channelDrag.start();
                      startPinDrag(channel.id, 'pinned');
                    }}
                    onDragEnd={() => {
                      channelDrag.end();
                      endPinDrag();
                    }}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      openChannelMenu({
                        channelId: channel.id,
                        pinnedView: true,
                        x: event.clientX,
                        y: event.clientY,
                      });
                    }}
                    onKeyDown={(event) => {
                      const keyboardMenu =
                        event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
                      if (!keyboardMenu) return;
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openChannelMenu({
                        channelId: channel.id,
                        pinnedView: true,
                        x: rect.left + 8,
                        y: rect.bottom,
                      });
                    }}
                  >
                    {bot === undefined ? (
                      <span className="bh-pinned-channel-icon" aria-hidden="true">
                        <HashIcon size={24} />
                      </span>
                    ) : (
                      <PersonaBotAvatar
                        personaBotId={bot.slug}
                        name={bot.displayName}
                        src={bot.avatar}
                        state={personaBotActivity(state, bot)}
                        size={54}
                      />
                    )}
                    <span className="bh-name">{bot?.displayName ?? channel.name}</span>
                    {bot === undefined ? null : <RoleBadges roles={bot.roles} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div
        className={`bh-unpin-zone${!unpinZoneArmed ? ' bh-unpin-zone-hidden' : ''}${unpinZoneHovered ? ' bh-unpin-zone-active' : ''}`}
        role="region"
        aria-label={t('pin.restore.zone.label')}
        aria-hidden={!unpinZoneArmed}
        onDragOver={(event) => {
          if (pinDrag?.source !== 'pinned') return;
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = 'move';
          clearGapHover();
          setUnpinZoneHovered(true);
        }}
        onDragLeave={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ) {
            return;
          }
          setUnpinZoneHovered(false);
        }}
        onDrop={(event) => {
          if (pinDrag?.source !== 'pinned') return;
          event.preventDefault();
          event.stopPropagation();
          commitPinDrop(false);
        }}
      >
        <span className="bh-unpin-zone-hint">
          {t(unpinZoneHovered ? 'pin.restore.release' : 'pin.restore.drop')}
        </span>
      </div>

      <div className="bh-roster-list">
        {flatBlocks.map((block) => {
          if (block.kind === 'loose') {
            const key = `loose:${block.channels.map((channel) => channel.id).join(',')}`;
            return (
              <div key={key} className="bh-section bh-loose">
                <div
                  className="bh-list-area"
                  onDragOver={(event) => {
                    if (!channelDragActive) return;
                    const target = event.target as HTMLElement | null;
                    if (target !== null && target.closest('[data-channel-id]') !== null) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    const rows = [...event.currentTarget.querySelectorAll('[data-channel-id]')].map(
                      (element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      },
                    );
                    const resolution = resolveBlockDropTarget(
                      rows.filter((row) => row.id !== ''),
                      Number.NEGATIVE_INFINITY,
                      event.clientY,
                    );
                    if (resolution.kind === 'row') {
                      channelDragProps(undefined, resolution.channelId).hover(resolution.half);
                    }
                  }}
                  onDrop={(event) => {
                    if (!channelDragActive) return;
                    const target = event.target as HTMLElement | null;
                    if (target !== null && target.closest('[data-channel-id]') !== null) return;
                    event.preventDefault();
                    const rows = [...event.currentTarget.querySelectorAll('[data-channel-id]')].map(
                      (element, index) => {
                        const rect = element.getBoundingClientRect();
                        return {
                          id: block.channels[index]?.id ?? '',
                          top: rect.top,
                          height: rect.height,
                        };
                      },
                    );
                    const resolution = resolveBlockDropTarget(
                      rows.filter((row) => row.id !== ''),
                      Number.NEGATIVE_INFINITY,
                      event.clientY,
                    );
                    if (resolution.kind === 'row') {
                      event.stopPropagation();
                      channelDragProps(undefined, resolution.channelId).drop(resolution.half);
                    }
                  }}
                >
                  {block.channels.map((channel) => renderChannelRow(channel, undefined))}
                </div>
              </div>
            );
          }
          const { section, channels: sectionChannels } = block;
          const sectionIndex = state.roster.sections.findIndex((item) => item.id === section.id);
          const collapsed = state.config.collapsed[section.id] === true;
          const menuOpenForSection = sectionMenuId === section.id;
          const createMenuOpenForSection = sectionCreateMenuId === section.id;
          const sectionDrag = sectionDragProps(section.id);
          const channelGap = channelGapDropProps(section.id);
          const channelScope = channelScopeDropProps(section.id);
          const before = sectionDrag.marker === 'before' || channelGap.marker === 'before';
          const after = sectionDrag.marker === 'after' || channelGap.marker === 'after';
          const blockMarkerClass = `${before ? ' bh-drop-before' : ''}${after ? ' bh-drop-after' : ''}${channelScope.hovered ? ' bh-drop-scope' : ''}`;
          /**
           * Resolve a channel drag anywhere inside this block that is not on a
           * row — header area, body padding, inter-row gaps — to a row anchor
           * (header inserts at the first index). Row-less bodies (empty,
           * collapsed, filtered out) resolve to the scope itself at index 0.
           */
          const resolveBlockTarget = (element: HTMLElement, clientY: number) => {
            const rows = [...element.querySelectorAll('[data-channel-id]')].map((row, index) => {
              const rect = row.getBoundingClientRect();
              return { id: sectionChannels[index]?.id ?? '', top: rect.top, height: rect.height };
            });
            const headBottom =
              element.querySelector('.bh-section-head')?.getBoundingClientRect().bottom ?? clientY;
            return resolveBlockDropTarget(
              rows.filter((row) => row.id !== ''),
              headBottom,
              clientY,
            );
          };
          const openSectionContextMenu = (x: number, y: number): void => {
            setMenuOpen(false);
            setSortMenuOpen(false);
            setSectionMenuId(undefined);
            setSectionCreateMenuId(undefined);
            setChannelMenu(undefined);
            setSectionContextMenu({ sectionId: section.id, x, y });
          };
          return (
            <div
              key={section.id}
              data-section-id={section.id}
              className={`bh-section${blockMarkerClass}`}
              onContextMenu={(event) => {
                const target = event.target as HTMLElement | null;
                // Channel rows own their own menu. Every other visible point
                // in the section block, including the name label and gaps,
                // opens the section menu.
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.stopPropagation();
                openSectionContextMenu(event.clientX, event.clientY);
              }}
              onDragOver={(event) => {
                if (sectionDrag.active) {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  sectionDrag.hover(
                    rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                  );
                  return;
                }
                if (!channelDragActive) return;
                const target = event.target as HTMLElement | null;
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                if (resolution.kind === 'scope') channelScope.hover();
                else channelDragProps(section.id, resolution.channelId).hover(resolution.half);
              }}
              onDrop={(event) => {
                if (sectionDrag.active) {
                  event.preventDefault();
                  event.stopPropagation();
                  sectionDrag.drop(
                    rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                  );
                  return;
                }
                if (!channelDragActive) return;
                const target = event.target as HTMLElement | null;
                if (target !== null && target.closest('[data-channel-id]') !== null) return;
                event.preventDefault();
                event.stopPropagation();
                const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
                if (resolution.kind === 'scope') channelScope.drop();
                else channelDragProps(section.id, resolution.channelId).drop(resolution.half);
              }}
            >
              <div className="bh-list-area">
                <div
                  className={`bh-section-head${menuOpenForSection || createMenuOpenForSection || sectionContextMenu?.sectionId === section.id ? ' bh-menu-open' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-expanded={!collapsed}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', section.id);
                    sectionDrag.start();
                  }}
                  onDragEnd={sectionDrag.end}
                  onClick={() => toggleSection(section.id)}
                  onKeyDown={(event) => {
                    const keyboardMenu =
                      event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
                    if (keyboardMenu) {
                      event.preventDefault();
                      const rect = event.currentTarget.getBoundingClientRect();
                      openSectionContextMenu(rect.left + 8, rect.bottom);
                      return;
                    }
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      toggleSection(section.id);
                    }
                  }}
                >
                  <span className="bh-section-name">{section.name}</span>
                  <IconChevronDownOutline14
                    size={14}
                    className={
                      collapsed ? 'bh-section-chevron bh-chevron-collapsed' : 'bh-section-chevron'
                    }
                  />
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
                            setSectionCreateMenuId(undefined);
                          }}
                        >
                          <IconEllipsisOutline16 />
                        </button>
                      }
                      items={sectionMenuItems(t, {
                        canMoveUp: sectionIndex > 0,
                        canMoveDown: sectionIndex < state.roster.sections.length - 1,
                      })}
                      selectedId={sectionSortMode(prefs, section.id)}
                      onSelect={(id) => selectSectionMenu(section, id)}
                      onClose={() => {
                        setSectionMenuId(undefined);
                      }}
                    />
                    <Menu
                      open={createMenuOpenForSection}
                      portal
                      dense
                      align="end"
                      closeOnPointerLeave
                      anchor={
                        <button
                          type="button"
                          className="bh-row-action"
                          aria-label={`在「${section.name}」中新建`}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionMenuId(undefined);
                            setSectionCreateMenuId((value) =>
                              value === section.id ? undefined : section.id,
                            );
                          }}
                        >
                          <IconPlusOutline16 />
                        </button>
                      }
                      items={sectionCreateMenuItems()}
                      onSelect={(id) => {
                        setSectionCreateMenuId(undefined);
                        if (id === 'bot') {
                          setCreateRequest({ kind: 'bot', sectionId: section.id });
                        }
                        if (id === 'channel') {
                          setCreateRequest({ kind: 'channel', sectionId: section.id });
                        }
                      }}
                      onClose={() => {
                        setSectionCreateMenuId(undefined);
                      }}
                    />
                  </span>
                </div>
                {collapsed
                  ? null
                  : sectionChannels.map((channel) => renderChannelRow(channel, section.id))}
              </div>
            </div>
          );
        })}
      </div>

      {createRequest?.kind === 'bot' ? (
        <CreatePersonaBotModal
          actions={actions}
          {...(createSectionId === undefined ? {} : { sectionId: createSectionId })}
          {...(createSection === undefined ? {} : { sectionName: createSection.name })}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreated={() => {
            setCreateRequest(undefined);
          }}
        />
      ) : null}
      {createRequest?.kind === 'section' ? (
        <CreateSectionModal
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={(name) => {
            const request = createRequest;
            void actions.createSection(name).then((section) => {
              if (section !== undefined && request.moveChannelId !== undefined) {
                commitChannelMenuMove(request.moveChannelId, section.id, request.pinned === true);
              }
              setCreateRequest(undefined);
            });
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
            const channel = await actions.createGroup(name, createSectionId);
            if (channel === undefined) return;
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
            void actions.renameSection(renameTarget.id, name);
            setRenameTarget(undefined);
          }}
        />
      ) : null}
      {channelRenameTarget !== undefined ? (
        <ChannelRenameModal
          key={channelRenameTarget.id}
          name={channelRenameTarget.name}
          bot={channelRenameTarget.type === 'dm'}
          onCancel={() => {
            setChannelRenameTarget(undefined);
          }}
          onRename={(name) => {
            void actions.renameChannel(channelRenameTarget.id, name);
            setChannelRenameTarget(undefined);
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
            setSectionSortMode(deleteTarget.id, undefined);
            void actions.removeSection(deleteTarget.id);
            if (createSectionId === deleteTarget.id) setCreateRequest(undefined);
            setDeleteTarget(undefined);
          }}
        />
      ) : null}

      {hiddenManagerOpen ? (
        <HiddenChannelsModal
          items={hiddenItems}
          t={t}
          onRestore={(channelId) => {
            void actions.setChannelHidden(channelId, false);
          }}
          onClose={() => {
            setHiddenManagerOpen(false);
          }}
        />
      ) : null}
      {sectionContextMenu !== undefined && contextSection !== undefined ? (
        <SectionContextMenu
          menu={sectionContextMenu}
          index={contextSectionIndex}
          count={state.roster.sections.length}
          selectedId={sectionSortMode(prefs, contextSection.id)}
          t={t}
          onSelect={(id) => selectSectionMenu(contextSection, id)}
          onClose={() => {
            setSectionContextMenu(undefined);
          }}
        />
      ) : null}

      {channelMenu !== undefined ? (
        <ChannelMoveMenu
          menu={channelMenu}
          sections={state.roster.sections}
          currentSectionId={sectionOfChannel(channelMenu.channelId)}
          pinned={channelMenu.pinnedView === true}
          t={t}
          onSetPinned={(channelId, pinned) => {
            void actions.setChannelPinned(channelId, pinned);
            setChannelMenu(undefined);
          }}
          onRename={(channelId) => {
            const channel = state.channels.find((candidate) => candidate.id === channelId);
            if (channel !== undefined) setChannelRenameTarget(channel);
            setChannelMenu(undefined);
          }}
          onCreateSection={(channelId) => {
            setCreateRequest({
              kind: 'section',
              moveChannelId: channelId,
              pinned: channelMenu.pinnedView === true,
            });
            setChannelMenu(undefined);
          }}
          onHide={(channelId) => {
            void actions.setChannelHidden(channelId, true);
            setChannelMenu(undefined);
          }}
          onPick={(targetSectionId) => {
            commitChannelMenuMove(
              channelMenu.channelId,
              targetSectionId,
              channelMenu.pinnedView === true,
            );
            setChannelMenu(undefined);
          }}
          onClose={() => {
            setChannelMenu(undefined);
          }}
        />
      ) : null}
    </div>
  );
}

/** Cursor-positioned section menu shared by right-click and keyboard access. */
export function SectionContextMenu({
  menu,
  index,
  count,
  selectedId,
  t,
  onSelect,
  onClose,
}: {
  menu: SectionMenuRequest;
  index: number;
  count: number;
  selectedId: string;
  t: BotHarnessTranslate;
  onSelect: (id: string) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  return (
    <span className="bh-menu-anchor" style={{ left: menu.x, top: menu.y }}>
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={sectionMenuItems(t, {
          canMoveUp: index > 0,
          canMoveDown: index >= 0 && index < count - 1,
        })}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={onClose}
      />
    </span>
  );
}

/**
 * A channel row's `移动到 ▸ [sections + 未分组]` menu. A zero-size fixed proxy
 * carries the cursor point; `Menu` reads it through `getAnchorRect` and portals
 * the list there (the JsonTree proxy-rect recipe), clamping it to the viewport.
 * `autoFocus` keeps the submenu reachable from the keyboard, which is the
 * move path ADR-0031 requires.
 */
export function ChannelMoveMenu({
  menu,
  sections,
  currentSectionId,
  pinned = false,
  t,
  onSetPinned,
  onHide,
  onRename,
  onCreateSection,
  onPick,
  onClose,
}: {
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  currentSectionId: string | undefined;
  pinned?: boolean;
  t: BotHarnessTranslate;
  onSetPinned?: (channelId: string, pinned: boolean) => void;
  onHide?: (channelId: string) => void;
  onRename?: (channelId: string) => void;
  onCreateSection?: (channelId: string) => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    // `Menu`'s own autoFocus focuses the first row while the portaled list is
    // still `visibility: hidden` (its placement re-render lands after passive
    // effects), so the focus is dropped. Focus the placed list once more to
    // keep the keyboard path: focus opens the submenu, arrows navigate it.
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, []);
  const pinItems: readonly MenuEntry[] = [
    { id: pinned ? 'unpin' : 'pin', label: t(pinned ? 'pin.remove' : 'pin.add') },
  ];
  const hideItems: readonly MenuEntry[] = [
    { type: 'separator', id: 'hide-separator' },
    { id: 'hide', label: t('hidden.action') },
  ];
  const items: readonly MenuEntry[] = [
    ...pinItems,
    { type: 'separator', id: 'pin-separator' },
    ...channelMoveMenuItems(t, sections, currentSectionId),
    { type: 'separator', id: 'channel-action-separator' },
    { id: 'rename', label: t('channel.rename') },
    ...hideItems,
  ];
  return (
    <span className="bh-menu-anchor" style={{ left: menu.x, top: menu.y }}>
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={items}
        onSelect={(id) => {
          if (id === 'pin' || id === 'unpin') {
            onSetPinned?.(menu.channelId, id === 'pin');
            return;
          }
          if (id === 'hide') {
            onHide?.(menu.channelId);
            return;
          }
          if (id === 'rename') {
            onRename?.(menu.channelId);
            return;
          }
          if (id === NEW_SECTION_MOVE_TARGET) {
            onCreateSection?.(menu.channelId);
            return;
          }
          onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

function menuItems(): MenuEntry[] {
  return [
    {
      id: 'bot',
      label: '创建 PersonaBot',
      icon: <IconAgentPresetOutline16 size={16} />,
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

/** Creation choices available from one section header. */
function sectionCreateMenuItems(): MenuEntry[] {
  return menuItems().filter((item) => item.id === 'bot' || item.id === 'channel');
}
