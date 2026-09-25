import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
} from 'react';
import { createPortal } from 'react-dom';

import {
  Button,
  IconAgentPresetOutlineRegular,
  IconChevronDownOutlineRegular,
  IconCloseFillRegular,
  IconEllipsisOutlineRegular,
  IconFolderOpenOutlineRegular,
  IconNewChatOutlineRegular,
  IconPlusOutlineRegular,
  IconSearchOutlineRegular,
  IconSettingsOutlineRegular,
  HoverCard,
  Menu,
  StateDot,
  Tag,
  Tooltip,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { SnapshotSelectorHook } from '@deepseek-ai/dsh-client-store';

import {
  isBotModeSortMode,
  PINNED_SORT_SCOPE_ID,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar, type PersonaBotActivityState } from './avatar.js';
import { BotIcon, botBackdropUri } from './bot-icon.js';
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { HashIcon } from './hash-icon.js';
import {
  webChannelShortcutIndex,
  webChannelShortcutLabel,
  webShortcutBlocked,
} from './channel-shortcuts.js';
import {
  reconcileChannelSelection,
  selectChannels,
  type ChannelSelection,
  type ChannelSelectionGesture,
} from './channel-selection.js';
import { HiddenChannelsModal, type HiddenChannelItem } from './hidden-channels.js';
import {
  useChannelDrag,
  useSectionDrag,
  type ChannelDragProps,
  type ChannelDropTarget,
  type ScopeId,
  type SectionDropTarget,
} from './channel-drag.js';
import { botStateLabel, needsYou, toBotState, toStateDot } from './labels.js';
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
  pinnedSortMenuItems,
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
    const button = glyph.current?.closest('button') ?? null;
    setRow(button);
    // The switch's texture layer is the chosen variant's transparent artwork.
    button?.style.setProperty('--bh-bot-texture', `url("${botBackdropUri(icon)}")`);
  }, [size, icon]);

  // The shell row is a button, so keyboard activation would re-select the
  // panel; while Bot mode is on, Enter and Space leave it instead. The gear
  // handles its own keys, so events originating there are left alone.
  useEffect(() => {
    if (row === null || !active) return () => {};
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if ((event.target as Element | null)?.closest('.bh-panel-gear') !== null) return;
      event.preventDefault();
      event.stopPropagation();
      onExit();
    };
    row.addEventListener('keydown', onKeyDown);
    return () => {
      row.removeEventListener('keydown', onKeyDown);
    };
  }, [row, active, onExit]);

  return (
    <span className="bh-panel-glyph" ref={glyph} {...(wide ? { 'data-wide': 'true' } : {})}>
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
                  tabIndex={0}
                  aria-label={t('panel.settings')}
                  title={t('panel.settings')}
                  onClick={(event) => {
                    event.stopPropagation();
                    openSettings();
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return;
                    event.preventDefault();
                    event.stopPropagation();
                    openSettings();
                  }}
                >
                  <IconSettingsOutlineRegular size={14} />
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
  channelIds?: readonly string[];
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
  multiSelected,
  onActivate,
  shortcut,
  showShortcutHints,
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
  t,
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: PersonaBotActivityState;
  selected: boolean;
  multiSelected: boolean;
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
  drag: ChannelDragProps;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart: (channelId: string) => void;
  onPinDragEnd: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const botState = toBotState(bot.aggregateState);
  const markerClass =
    drag.marker === 'before' ? ' bh-drop-before' : drag.marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag.source ? ' bh-drag-source' : '';
  return (
    <button
      type="button"
      data-channel-id={channel.id}
      className={`bh-contact${selected ? ' bh-selected' : ''}${multiSelected ? ' bh-multi-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
      aria-pressed={multiSelected}
      aria-keyshortcuts={shortcut}
      title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
      onClick={onActivate}
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
        t={t}
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
          {needsYou(botState) ? <span className="bh-unread" title={t('roster.needsYou')} /> : null}
        </span>
        <span className="bh-msg">{bot.description ?? botStateLabel(botState, t)}</span>
      </span>
      <StateDot state={toStateDot(botState)} size={8} className="bh-state" />
      {showShortcutHints && shortcut !== undefined ? (
        <kbd className="bh-shortcut-badge" aria-hidden="true">
          {shortcut.slice(4)}
        </kbd>
      ) : null}
    </button>
  );
}
function ChannelRow({
  channel,
  selected,
  multiSelected,
  onActivate,
  shortcut,
  showShortcutHints,
  drag,
  onMenu,
  onPinDragStart,
  onPinDragEnd,
  t,
}: {
  channel: ChannelSummary;
  selected: boolean;
  multiSelected: boolean;
  onActivate: (event: ReactMouseEvent<HTMLButtonElement>) => void;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
  drag?: ChannelDragProps | undefined;
  onMenu: (request: ChannelMenuRequest) => void;
  onPinDragStart?: ((channelId: string) => void) | undefined;
  onPinDragEnd?: (() => void) | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const marker = drag?.marker ?? null;
  const markerClass =
    marker === 'before' ? ' bh-drop-before' : marker === 'after' ? ' bh-drop-after' : '';
  const sourceClass = drag?.source === true ? ' bh-drag-source' : '';
  return (
    <button
      type="button"
      data-channel-id={channel.id}
      className={`bh-channel-row${selected ? ' bh-selected' : ''}${multiSelected ? ' bh-multi-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}${markerClass}${sourceClass}`}
      aria-pressed={multiSelected}
      aria-keyshortcuts={shortcut}
      title={shortcut === undefined ? undefined : t('shortcut.web.open', { key: shortcut })}
      onClick={onActivate}
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
        {channel.members.length > 0
          ? t('roster.members.count', { count: channel.members.length })
          : t('roster.members.empty')}
      </span>
      {showShortcutHints && shortcut !== undefined ? (
        <kbd className="bh-shortcut-badge" aria-hidden="true">
          {shortcut.slice(4)}
        </kbd>
      ) : null}
    </button>
  );
}

function RailChannel({
  channel,
  bot,
  activity,
  selected,
  shortcut,
  showShortcutHints,
  summary,
  actions,
  t,
}: {
  channel: ChannelSummary;
  bot: BotSummary | undefined;
  activity: PersonaBotActivityState | undefined;
  selected: boolean;
  shortcut?: string | undefined;
  showShortcutHints: boolean;
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
          className={`bh-rail-channel${selected ? ' bh-selected' : ''}${showShortcutHints && shortcut !== undefined ? ' bh-shortcut-active' : ''}`}
          aria-label={title}
          aria-current={selected ? 'page' : undefined}
          aria-keyshortcuts={shortcut}
          onClick={open}
        >
          {bot === undefined ? (
            <span className="bh-rail-channel-icon" aria-hidden="true">
              <HashIcon size={18} />
            </span>
          ) : (
            <PersonaBotAvatar
              t={t}
              personaBotId={bot.slug}
              name={bot.displayName}
              src={bot.avatar}
              state={activity}
              size={32}
            />
          )}
          {showShortcutHints && shortcut !== undefined ? (
            <kbd className="bh-shortcut-badge" aria-hidden="true">
              {shortcut.slice(4)}
            </kbd>
          ) : null}
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
                t={t}
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
          {shortcut === undefined ? null : (
            <span className="bh-rail-preview-meta">
              {t('shortcut.web.open', { key: shortcut })}
            </span>
          )}
        </div>
      }
    />
  );
}

/** Open creation dialog for one production-backed Bot, Channel, or section. */
type CreateRequest =
  | { kind: 'bot'; sectionId?: string }
  | {
      kind: 'section';
      moveChannelId?: string;
      moveChannelIds?: readonly string[];
      pinned?: boolean;
    }
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
  const [pinSortMenuOpen, setPinSortMenuOpen] = useState(false);
  const [hiddenManagerOpen, setHiddenManagerOpen] = useState(false);
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [sectionCreateMenuId, setSectionCreateMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuRequest | undefined>(undefined);
  const [channelSelection, setChannelSelection] = useState<ChannelSelection>({
    ids: [],
    anchorId: undefined,
  });
  const [batchBusy, setBatchBusy] = useState(false);
  const [showShortcutHints, setShowShortcutHints] = useState(false);
  const [batchError, setBatchError] = useState<'failed' | 'limit' | 'reorder' | undefined>();
  const [pinDrag, setPinDrag] = useState<PinDragState | undefined>(undefined);
  const [pinReorderTarget, setPinReorderTarget] = useState<
    { channelId: string; half: 'before' | 'after' } | undefined
  >(undefined);

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
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && !event.getModifierState('AltGraph')) setShowShortcutHints(true);
    };
    const onKeyUp = (event: KeyboardEvent): void => {
      if (!event.altKey || event.getModifierState('AltGraph')) setShowShortcutHints(false);
    };
    const clear = (): void => setShowShortcutHints(false);
    const onVisibilityChange = (): void => {
      if (document.hidden) clear();
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', clear);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', clear);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (webShortcutBlocked(event.target, document)) return;
      if (document.querySelector('[role="menu"]') !== null) return;
      setChannelSelection((current) =>
        current.ids.length === 0 ? current : { ids: [], anchorId: undefined },
      );
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

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
  const pinnedById = new Map(state.channels.map((channel) => [channel.id, channel]));
  const orderedPinnedIds = orderScopeChannels(
    allPinnedChannelIds.flatMap((id) => pinnedById.get(id) ?? []),
    resolvedSortMode(prefs.sortModes[PINNED_SORT_SCOPE_ID], prefs.sortMode),
    allPinnedChannelIds,
  ).map((channel) => channel.id);
  const pinnedChannelIds = orderedPinnedIds.filter((id) => !hiddenChannelSet.has(id));
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
  const visibleChannelIds = [
    ...pinnedChannels.map((channel) => channel.id),
    ...flatBlocks.flatMap((block) =>
      block.kind === 'section' && state.config.collapsed[block.section.id] === true
        ? []
        : block.channels.map((channel) => channel.id),
    ),
  ];
  const visibleIdsRef = useRef<readonly string[]>(visibleChannelIds);
  visibleIdsRef.current = visibleChannelIds;
  const visibleIdsKey = visibleChannelIds.join('|');
  useEffect(() => {
    setChannelSelection((current) => {
      const next = reconcileChannelSelection(current, visibleIdsRef.current);
      return next.ids.length === current.ids.length &&
        next.ids.every((id, index) => id === current.ids[index]) &&
        next.anchorId === current.anchorId
        ? current
        : next;
    });
  }, [visibleIdsKey]);
  const selectedChannelIds = reconcileChannelSelection(channelSelection, visibleChannelIds).ids;
  const selectedChannelSet = new Set(selectedChannelIds);
  const selectedChannels = visibleChannelIds
    .filter((id) => selectedChannelSet.has(id))
    .flatMap((id) => state.channels.find((channel) => channel.id === id) ?? []);
  const selectedBotCount = selectedChannels.filter(
    (channel) => channel.botSlug !== undefined,
  ).length;
  const selectedItems = t(
    selectedBotCount === selectedChannels.length ? 'bulk.bots' : 'bulk.channels',
    { count: selectedChannels.length },
  );
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
  const shortcutIds = wide
    ? visibleChannelIds
    : [...railPinnedChannels, ...railChannels].map((channel) => channel.id);
  const shortcutIdsRef = useRef<readonly string[]>(shortcutIds);
  shortcutIdsRef.current = shortcutIds;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const index = webChannelShortcutIndex(event.code, {
        alt: event.altKey,
        ctrl: event.ctrlKey,
        meta: event.metaKey,
        shift: event.shiftKey,
        altGraph: event.getModifierState('AltGraph'),
        composing: event.isComposing,
        repeat: event.repeat,
        prevented: event.defaultPrevented,
      });
      if (index === undefined) return;
      if (webShortcutBlocked(event.target, document)) return;
      const id = shortcutIdsRef.current[index];
      if (id === undefined) return;
      const channel = store.getSnapshot().channels.find((candidate) => candidate.id === id);
      if (channel === undefined) return;
      event.preventDefault();
      void (channel.botSlug === undefined
        ? actions.openChannel(id)
        : actions.openBot(channel.botSlug));
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [actions]);
  const shortcutFor = (channelId: string): string | undefined =>
    webChannelShortcutLabel(shortcutIds.indexOf(channelId));
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

  const selectPinnedSortMenu = (id: string): void => {
    setPinSortMenuOpen(false);
    if (id === 'inherit') {
      setSectionSortMode(PINNED_SORT_SCOPE_ID, undefined);
      return;
    }
    if (isBotModeSortMode(id)) setSectionSortMode(PINNED_SORT_SCOPE_ID, id);
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

  const commitBulkChange = async (
    input: Parameters<BridgeActions['batchRoster']>[0],
  ): Promise<void> => {
    if (batchBusy) return;
    setChannelMenu(undefined);
    if (input.channelIds.length > 100) {
      setBatchError('limit');
      return;
    }
    setBatchBusy(true);
    setBatchError(undefined);
    // A roster SSE invalidation may arrive before the RPC response. Freeze the
    // target's display order first so that snapshot never auto-sorts a partial
    // visual placement; restore the prior preference if the Host rejects it.
    const previousSortMode =
      input.action === 'move' && input.sectionId !== undefined
        ? prefs.sortModes[input.sectionId]
        : undefined;
    if (input.action === 'move' && input.sectionId !== undefined) {
      setSectionSortMode(input.sectionId, 'manual');
    }
    const succeeded = await actions.batchRoster(input);
    setBatchBusy(false);
    if (!succeeded) {
      if (input.action === 'move' && input.sectionId !== undefined) {
        setSectionSortMode(input.sectionId, previousSortMode);
      }
      setBatchError('failed');
      return;
    }
    setChannelSelection({ ids: [], anchorId: undefined });
  };

  const commitBulkPin = (ids: readonly string[], targetPinned: boolean): Promise<void> =>
    commitBulkChange({ action: targetPinned ? 'pin' : 'unpin', channelIds: ids });

  const commitBulkHide = (ids: readonly string[]): Promise<void> =>
    commitBulkChange({ action: 'hide', channelIds: ids });

  const commitBulkMove = (
    ids: readonly string[],
    targetSectionId: string | undefined,
  ): Promise<void> =>
    commitBulkChange({
      action: 'move',
      channelIds: ids,
      ...(targetSectionId === undefined ? {} : { sectionId: targetSectionId }),
    });

  const activateChannel = (
    channel: ChannelSummary,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    const gesture: ChannelSelectionGesture = event.shiftKey
      ? 'range'
      : event.ctrlKey || event.metaKey
        ? 'toggle'
        : 'plain';
    setChannelSelection((current) =>
      selectChannels(
        reconcileChannelSelection(current, visibleChannelIds),
        visibleChannelIds,
        channel.id,
        gesture,
      ),
    );
    if (gesture !== 'plain') return;
    void (channel.botSlug === undefined
      ? actions.openChannel(channel.id)
      : actions.openBot(channel.botSlug));
  };

  const openChannelMenu = (request: ChannelMenuRequest): void => {
    const inSelection = selectedChannelSet.has(request.channelId);
    const channelIds =
      inSelection && selectedChannelIds.length > 1 ? selectedChannelIds : [request.channelId];
    if (!inSelection) setChannelSelection({ ids: [], anchorId: request.channelId });
    setMenuOpen(false);
    setSortMenuOpen(false);
    setSectionMenuId(undefined);
    setSectionCreateMenuId(undefined);
    setSectionContextMenu(undefined);
    setChannelMenu({ ...request, channelIds });
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
    setPinReorderTarget(undefined);
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

  const commitPinnedReorder = (
    sourceId: string,
    targetId: string,
    half: 'before' | 'after',
  ): void => {
    const order = moveWithinOrder(orderedPinnedIds, sourceId, targetId, half);
    if (order === undefined) return;
    setBatchError(undefined);
    void actions
      .reorderPinnedChannels(order, () => {
        setSectionSortMode(PINNED_SORT_SCOPE_ID, 'manual');
      })
      .then((succeeded) => {
        if (!succeeded) setBatchError('reorder');
      });
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
          t={t}
          key={channel.id}
          bot={bot}
          channel={channel}
          activity={personaBotActivity(state, bot)}
          selected={selectedBot === bot.slug || selectedChannel === channel.id}
          multiSelected={selectedChannelSet.has(channel.id)}
          onActivate={(event) => activateChannel(channel, event)}
          shortcut={shortcutFor(channel.id)}
          showShortcutHints={showShortcutHints}
          drag={drag}
          onMenu={openChannelMenu}
          onPinDragStart={(channelId) => startPinDrag(channelId, 'roster')}
          onPinDragEnd={endPinDrag}
        />
      );
    }
    return (
      <ChannelRow
        t={t}
        key={channel.id}
        channel={channel}
        selected={selectedChannel === channel.id}
        multiSelected={selectedChannelSet.has(channel.id)}
        onActivate={(event) => activateChannel(channel, event)}
        shortcut={shortcutFor(channel.id)}
        showShortcutHints={showShortcutHints}
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
          shortcut={shortcutFor(channel.id)}
          showShortcutHints={showShortcutHints}
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
          {t('roster.messages')}
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
            <Tooltip
              label={t('roster.search.label')}
              side="bottom"
              delayMs={500}
              disabled={searchOpen}
            >
              <button
                type="button"
                className="bh-search-btn"
                aria-label={t('roster.search.label')}
                aria-expanded={searchOpen}
                onClick={() => {
                  setMenuOpen(false);
                  setSortMenuOpen(false);
                  setSearchOpen(true);
                }}
              >
                <IconSearchOutlineRegular size={searchOpen ? 11 : 14} />
              </button>
            </Tooltip>
            <input
              ref={searchInput}
              className="bh-search-input"
              type="text"
              placeholder={t('roster.search.placeholder')}
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
                aria-label={t('roster.search.clear')}
                onClick={(event) => {
                  event.stopPropagation();
                  store.setQuery('');
                  setSearchOpen(false);
                }}
              >
                <IconCloseFillRegular />
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
                  <IconEllipsisOutlineRegular size={16} />
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
              <Tooltip label={t('roster.new.label')} side="bottom" delayMs={500}>
                <button
                  type="button"
                  className="bh-icon-btn"
                  aria-label={t('roster.new.label')}
                  onClick={() => {
                    setMenuOpen((value) => !value);
                  }}
                >
                  <IconPlusOutlineRegular size={16} />
                </button>
              </Tooltip>
            }
            items={menuItems(t)}
            onSelect={selectMenu}
            onClose={() => {
              setMenuOpen(false);
            }}
          />
        </div>
      </div>

      {state.status === 'loading' && state.bots.length === 0 ? (
        <div className="bh-note">{t('roster.loading')}</div>
      ) : null}
      {state.status === 'error' && state.error !== undefined ? (
        <div className="bh-error">{t('roster.error', { error: state.error })}</div>
      ) : null}
      {state.roster.readOnly ? <div className="bh-note">{t('roster.readOnly')}</div> : null}
      {state.status === 'ready' && state.bots.length === 0 ? (
        <div className="bh-empty-create">
          <span>{t('roster.empty')}</span>
          <Button variant="outline" size="sm" onClick={() => setCreateRequest({ kind: 'bot' })}>
            {t('roster.empty.create')}
          </Button>
        </div>
      ) : null}
      {visibleCount === 0 && (state.bots.length > 0 || state.channels.length > 0) ? (
        <div className="bh-note">
          {query.length === 0 && hiddenItems.length > 0 ? t('hidden.all') : t('roster.noMatch')}
        </div>
      ) : null}

      {batchError !== undefined ? (
        <div className="bh-error">
          {t(
            batchError === 'limit'
              ? 'bulk.limit'
              : batchError === 'reorder'
                ? 'pin.reorderFailed'
                : 'bulk.failed',
          )}
        </div>
      ) : null}

      {hasPinnableChannels ? (
        <div
          className={`bh-pin-zone${hasPinnedChannels ? ' bh-pin-zone-filled' : ' bh-pin-zone-empty'}${!hasPinnedChannels && !pinZoneArmed ? ' bh-pin-zone-hidden' : ''}${pinZoneHovered ? ' bh-pin-zone-active' : ''}`}
          role="region"
          aria-label={t('pin.zone.label')}
          aria-hidden={!hasPinnedChannels && !pinZoneArmed}
          onDragOver={(event) => {
            if (pinDrag?.source === 'pinned') {
              setPinReorderTarget(undefined);
              return;
            }
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
              <div className="bh-pinned-header">
                <span>{t('pin.title')}</span>
                <Menu
                  open={pinSortMenuOpen}
                  portal
                  dense
                  align="end"
                  anchor={
                    <button
                      type="button"
                      className="bh-row-action"
                      aria-label={t('pin.sort')}
                      onClick={() => setPinSortMenuOpen((value) => !value)}
                    >
                      <IconEllipsisOutlineRegular />
                    </button>
                  }
                  items={pinnedSortMenuItems(t)}
                  selectedId={sectionSortMode(prefs, PINNED_SORT_SCOPE_ID)}
                  onSelect={selectPinnedSortMenu}
                  onClose={() => setPinSortMenuOpen(false)}
                />
              </div>
              {pinnedChannels.map((channel) => {
                const bot =
                  channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
                const selected =
                  selectedChannel === channel.id || (bot !== undefined && selectedBot === bot.slug);
                const dragSource = pinDrag?.source === 'pinned' && pinDrag.channelId === channel.id;
                const channelDrag = channelDragProps(sectionOfChannel(channel.id), channel.id);
                const pinMarker =
                  pinReorderTarget?.channelId === channel.id ? pinReorderTarget.half : null;
                return (
                  <button
                    key={channel.id}
                    type="button"
                    data-channel-id={channel.id}
                    className={`bh-pinned${selected ? ' bh-selected' : ''}${selectedChannelSet.has(channel.id) ? ' bh-multi-selected' : ''}${showShortcutHints && shortcutFor(channel.id) !== undefined ? ' bh-shortcut-active' : ''}${dragSource ? ' bh-drag-source' : ''}${pinMarker === null ? '' : ` bh-pin-drop-${pinMarker}`}`}
                    aria-pressed={selectedChannelSet.has(channel.id)}
                    aria-keyshortcuts={shortcutFor(channel.id)}
                    title={
                      shortcutFor(channel.id) === undefined
                        ? undefined
                        : t('shortcut.web.open', { key: shortcutFor(channel.id) ?? '' })
                    }
                    onClick={(event) => activateChannel(channel, event)}
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
                    onDragOver={(event) => {
                      if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      event.dataTransfer.dropEffect = 'move';
                      const rect = event.currentTarget.getBoundingClientRect();
                      setPinReorderTarget({
                        channelId: channel.id,
                        half: event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
                      });
                    }}
                    onDragLeave={(event) => {
                      if (
                        event.relatedTarget instanceof Node &&
                        event.currentTarget.contains(event.relatedTarget)
                      ) {
                        return;
                      }
                      setPinReorderTarget((current) =>
                        current?.channelId === channel.id ? undefined : current,
                      );
                    }}
                    onDrop={(event) => {
                      if (pinDrag?.source !== 'pinned' || pinDrag.channelId === channel.id) return;
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      commitPinnedReorder(
                        pinDrag.channelId,
                        channel.id,
                        event.clientX < rect.left + rect.width / 2 ? 'before' : 'after',
                      );
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
                        t={t}
                        personaBotId={bot.slug}
                        name={bot.displayName}
                        src={bot.avatar}
                        state={personaBotActivity(state, bot)}
                        size={54}
                      />
                    )}
                    <span className="bh-name">{bot?.displayName ?? channel.name}</span>
                    {bot === undefined ? null : <RoleBadges roles={bot.roles} />}
                    {showShortcutHints && shortcutFor(channel.id) !== undefined ? (
                      <kbd className="bh-shortcut-badge" aria-hidden="true">
                        {shortcutFor(channel.id)?.slice(4)}
                      </kbd>
                    ) : null}
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
                  <IconChevronDownOutlineRegular
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
                          aria-label={t('roster.section.sort', { name: section.name })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionMenuId((value) =>
                              value === section.id ? undefined : section.id,
                            );
                            setSectionCreateMenuId(undefined);
                          }}
                        >
                          <IconEllipsisOutlineRegular />
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
                          aria-label={t('roster.section.create', { name: section.name })}
                          onClick={(event) => {
                            event.stopPropagation();
                            setSectionMenuId(undefined);
                            setSectionCreateMenuId((value) =>
                              value === section.id ? undefined : section.id,
                            );
                          }}
                        >
                          <IconPlusOutlineRegular />
                        </button>
                      }
                      items={sectionCreateMenuItems(t)}
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
          t={t}
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
          t={t}
          onCancel={() => {
            setCreateRequest(undefined);
          }}
          onCreate={(name) => {
            const request = createRequest;
            void actions.createSection(name).then((section) => {
              if (section !== undefined && request.moveChannelIds !== undefined) {
                void commitBulkMove(request.moveChannelIds, section.id);
              } else if (section !== undefined && request.moveChannelId !== undefined) {
                commitChannelMenuMove(request.moveChannelId, section.id, request.pinned === true);
              }
              setCreateRequest(undefined);
            });
          }}
        />
      ) : null}
      {createRequest?.kind === 'channel' ? (
        <CreateChannelModal
          t={t}
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
          t={t}
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
          t={t}
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
          t={t}
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

      {channelMenu !== undefined && (channelMenu.channelIds?.length ?? 0) > 1 ? (
        <BulkChannelMenu
          menu={channelMenu}
          sections={state.roster.sections}
          itemsLabel={selectedItems}
          allPinned={(channelMenu.channelIds ?? []).every((id) => allPinnedChannelSet.has(id))}
          t={t}
          onCreateSection={() => {
            setCreateRequest({ kind: 'section', moveChannelIds: channelMenu.channelIds ?? [] });
            setChannelMenu(undefined);
          }}
          onPin={(pinned) => void commitBulkPin(channelMenu.channelIds ?? [], pinned)}
          onHide={() => void commitBulkHide(channelMenu.channelIds ?? [])}
          onPick={(sectionId) => void commitBulkMove(channelMenu.channelIds ?? [], sectionId)}
          onClose={() => setChannelMenu(undefined)}
        />
      ) : channelMenu !== undefined ? (
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
/** Context actions shared by all selected Bot DMs and group channels. */
export function BulkChannelMenu({
  menu,
  sections,
  allPinned = false,
  itemsLabel,
  t,
  onCreateSection,
  onPin,
  onHide,
  onPick,
  onClose,
}: {
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  allPinned?: boolean;
  itemsLabel: string;
  t: BotHarnessTranslate;
  onCreateSection: () => void;
  onPin: (pinned: boolean) => void;
  onHide: () => void;
  onPick: (sectionId: string | undefined) => void;
  onClose: () => void;
}): ReactElement {
  const proxy = useRef<HTMLSpanElement | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const lists = document.querySelectorAll<HTMLElement>('div[role="menu"]');
      lists
        .item(lists.length - 1)
        ?.querySelector<HTMLButtonElement>('button:not(:disabled)')
        ?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  const items: readonly MenuEntry[] = [
    {
      id: allPinned ? 'unpin' : 'pin',
      label: t(allPinned ? 'bulk.unpin' : 'bulk.pin', { items: itemsLabel }),
    },
    { type: 'separator', id: 'bulk-pin-separator' },
    {
      id: 'move',
      label: t('bulk.move', { items: itemsLabel }),
      submenu: [
        { id: NEW_SECTION_MOVE_TARGET, label: t('move.newSection') },
        ...sections.map((section) => ({ id: section.id, label: section.name })),
        { id: UNGROUPED_MOVE_TARGET, label: t('roster.ungrouped') },
      ],
    },
    { type: 'separator', id: 'bulk-action-separator' },
    { id: 'hide', label: t('bulk.hide', { items: itemsLabel }) },
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
          if (id === 'pin' || id === 'unpin') onPin(id === 'pin');
          else if (id === 'hide') onHide();
          else if (id === NEW_SECTION_MOVE_TARGET) onCreateSection();
          else onPick(id === UNGROUPED_MOVE_TARGET ? undefined : id);
        }}
        onClose={onClose}
      />
    </span>
  );
}

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

function menuItems(t: BotHarnessTranslate): MenuEntry[] {
  return [
    {
      id: 'bot',
      label: t('roster.menu.createBot'),
      icon: <IconAgentPresetOutlineRegular size={16} />,
    },
    {
      id: 'channel',
      label: t('roster.menu.createChannel'),
      icon: <IconNewChatOutlineRegular size={16} />,
    },
    {
      id: 'section',
      label: t('roster.menu.createSection'),
      icon: <IconFolderOpenOutlineRegular size={16} />,
    },
  ];
}

/** Creation choices available from one section header. */
function sectionCreateMenuItems(t: BotHarnessTranslate): MenuEntry[] {
  return menuItems(t).filter((item) => item.id === 'bot' || item.id === 'channel');
}
