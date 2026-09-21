import { useEffect, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';

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
import { sectionSortMode, type BotModePrefsSnapshot } from './bot-mode-prefs.js';
import { HashIcon } from './hash-icon.js';
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
  resolvedSortMode,
  resolveBlockDropTarget,
  rowDropHalf,
  type ChannelMoveSink,
  type FlatAnchor,
} from './roster-order.js';
import {
  channelMoveMenuItems,
  CreateChannelModal,
  CreateSectionModal,
  globalSortMenuItems,
  SectionDeleteModal,
  SectionRenameModal,
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
  useBotModePrefs: SnapshotSelectorHook<BotModePrefsSnapshot>;
  setSortMode: (mode: BotModeSortMode) => void;
  setSectionSortMode: (sectionId: string, mode: BotModeSortMode | undefined) => void;
  t: BotHarnessTranslate;
}

/** One row's request to open its `移动到` context menu at a viewport point. */
interface ChannelMenuRequest {
  channelId: string;
  x: number;
  y: number;
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
}: {
  bot: BotSummary;
  channel: ChannelSummary;
  activity: PersonaBotActivityState;
  selected: boolean;
  actions: BridgeActions;
  drag: ChannelDragProps;
  onMenu: (request: ChannelMenuRequest) => void;
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
      }}
      onDragEnd={drag.end}
      onDragOver={(event) => {
        if (!drag.active) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        drag.hover(rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()));
      }}
      onDrop={(event) => {
        if (!drag.active) return;
        event.preventDefault();
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
}: {
  channel: ChannelSummary;
  selected: boolean;
  actions: BridgeActions;
  drag?: ChannelDragProps | undefined;
  onMenu: (request: ChannelMenuRequest) => void;
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
            }
      }
      onDragEnd={drag?.end}
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

/** Open creation dialog for one production-backed Bot, Channel, or section. */
type CreateRequest =
  | { kind: 'bot' }
  | { kind: 'section' }
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
  const [sectionMenuId, setSectionMenuId] = useState<string | undefined>(undefined);
  const [searchOpen, setSearchOpen] = useState(false);
  const [channelMenu, setChannelMenu] = useState<ChannelMenuRequest | undefined>(undefined);
  const [createRequest, setCreateRequest] = useState<CreateRequest | undefined>(undefined);
  const [renameTarget, setRenameTarget] = useState<RosterSection | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<RosterSection | undefined>(undefined);
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

  const query = state.query.trim().toLowerCase();
  const bots = state.bots.filter((bot) => matchesQuery(query, bot.displayName, ...bot.roles));
  const botBySlug = new Map(state.bots.map((bot) => [bot.slug, bot]));
  const pinned = new Set(state.roster.pins);
  const pinnedBots = state.roster.pins.flatMap((slug) => {
    const bot = bots.find((candidate) => candidate.slug === slug);
    return bot === undefined ? [] : [bot];
  });
  const rosterChannels = state.channels.filter(
    (channel) =>
      channel.type === 'group' || (channel.botSlug !== undefined && !pinned.has(channel.botSlug)),
  );
  const channels = rosterChannels.filter((channel) => {
    if (channel.type === 'group') return matchesQuery(query, channel.name);
    const bot = channel.botSlug === undefined ? undefined : botBySlug.get(channel.botSlug);
    return bot !== undefined && matchesQuery(query, bot.displayName, ...bot.roles);
  });
  const sectionedIds = new Set(state.roster.sections.flatMap((section) => section.channelIds));
  const rosterChannelIds = flatRosterChannelIds(state.channels, pinned);
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
        rosterChannels.filter((channel) => !sectioned.has(channel.id)),
        prefs.sortMode,
      );
    }
    const section = store
      .getSnapshot()
      .roster.sections.find((candidate) => candidate.id === scopeId);
    return section === undefined ? [] : sectionOrder(section, rosterChannels);
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
  const visibleCount =
    pinnedBots.length + flatBlocks.reduce((total, block) => total + block.channels.length, 0);
  const selectedBot = state.selection?.kind === 'bot' ? state.selection.slug : undefined;
  const selectedChannel =
    state.selection?.kind === 'channel' ? state.selection.channelId : undefined;

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
    if (isBotModeSortMode(id)) setSortMode(id);
  };

  const selectSectionMenu = (section: RosterSection, id: string): void => {
    setSectionMenuId(undefined);
    if (id === 'inherit') {
      setSectionSortMode(section.id, undefined);
      return;
    }
    if (isBotModeSortMode(id)) {
      setSectionSortMode(section.id, id);
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
    target: { kind: 'row'; channelId: string; half: 'before' | 'after' } | { kind: 'scope' },
  ): void => {
    const plan = planChannelMove(sourceScopeId, channelId, {
      targetScopeId,
      target,
      targetOrder: scopeChannelsOf(targetScopeId).map((channel) => channel.id),
      targetManualOverride:
        targetScopeId !== undefined && prefs.sortModes[targetScopeId] === 'manual',
    });
    if (plan === undefined) return;
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

  /** A row-less section body targets the whole scope; the move appends. */
  const commitChannelScopeDrop = (
    drag: { scopeId: ScopeId; channelId: string },
    scopeId: ScopeId,
  ): void => {
    runChannelMove(drag.channelId, drag.scopeId, scopeId, { kind: 'scope' });
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
    const snapshotChannelIds = flatRosterChannelIds(
      snapshot.channels,
      new Set(snapshot.roster.pins),
    );
    const flat = completeFlatEntries(
      snapshot.roster.topOrder,
      snapshot.roster.sections.map((section) => section.id),
      snapshotChannelIds,
      sectioned,
    );
    const plan = planFlatInsert(flat, channelId, sourceScopeId !== undefined, anchor);
    if (plan === undefined) return;
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
  const commitChannelMenuMove = (channelId: string, targetSectionId: string | undefined): void => {
    runChannelMove(channelId, sectionOfChannel(channelId), targetSectionId, { kind: 'scope' });
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
    setChannelMenu(request);
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
      />
    );
  };

  if (!wide) return <div className="bh-root bh-region bh-region-rail" />;

  const createSectionId = createRequest?.kind === 'channel' ? createRequest.sectionId : undefined;
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
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) {
          clearGapHover();
          return;
        }
        channelGapDropProps(resolved.sectionId).hover(resolved.half);
      }}
      onDrop={(event) => {
        if (!channelDragActive) return;
        const target = event.target as HTMLElement | null;
        if (target !== null && target.closest('.bh-section, [data-channel-id]') !== null) return;
        event.preventDefault();
        const resolved = resolveGapTarget(event.currentTarget, event.clientY);
        if (resolved === null) return;
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
        <div className="bh-note">正在加载 BOT…</div>
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
                <PersonaBotAvatar
                  personaBotId={bot.slug}
                  name={bot.displayName}
                  src={bot.avatar}
                  state={personaBotActivity(state, bot)}
                  size={54}
                />
                <span className="bh-name">{bot.displayName}</span>
                <RoleBadges roles={bot.roles} />
              </button>
            );
          })}
        </div>
      ) : null}

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
        const collapsed = state.config.collapsed[section.id] === true;
        const menuOpenForSection = sectionMenuId === section.id;
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
        return (
          <div
            key={section.id}
            data-section-id={section.id}
            className={`bh-section${blockMarkerClass}`}
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
                sectionDrag.drop(
                  rowDropHalf(event.clientY, event.currentTarget.getBoundingClientRect()),
                );
                return;
              }
              if (!channelDragActive) return;
              const target = event.target as HTMLElement | null;
              if (target !== null && target.closest('[data-channel-id]') !== null) return;
              event.preventDefault();
              const resolution = resolveBlockTarget(event.currentTarget, event.clientY);
              if (resolution.kind === 'scope') channelScope.drop();
              else channelDragProps(section.id, resolution.channelId).drop(resolution.half);
            }}
          >
            <div className="bh-list-area">
              <div
                className={`bh-section-head${menuOpenForSection ? ' bh-menu-open' : ''}`}
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
                  if (event.key !== 'Enter' && event.key !== ' ') return;
                  event.preventDefault();
                  toggleSection(section.id);
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
                        }}
                      >
                        <IconEllipsisOutline16 />
                      </button>
                    }
                    items={sectionMenuItems(t)}
                    selectedId={sectionSortMode(prefs, section.id)}
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
                : sectionChannels.map((channel) => renderChannelRow(channel, section.id))}
            </div>
          </div>
        );
      })}

      {createRequest?.kind === 'bot' ? (
        <CreatePersonaBotModal
          actions={actions}
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
            void actions.createSection(name);
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
              await actions.assignChannel(channel.id, createSectionId);
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
            void actions.renameSection(renameTarget.id, name);
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
            setSectionSortMode(deleteTarget.id, undefined);
            void actions.removeSection(deleteTarget.id);
            if (createSectionId === deleteTarget.id) setCreateRequest(undefined);
            setDeleteTarget(undefined);
          }}
        />
      ) : null}

      {channelMenu !== undefined ? (
        <ChannelMoveMenu
          menu={channelMenu}
          sections={state.roster.sections}
          currentSectionId={sectionOfChannel(channelMenu.channelId)}
          t={t}
          onPick={(targetSectionId) => {
            commitChannelMenuMove(channelMenu.channelId, targetSectionId);
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
  t,
  onPick,
  onClose,
}: {
  menu: ChannelMenuRequest;
  sections: readonly RosterSection[];
  currentSectionId: string | undefined;
  t: BotHarnessTranslate;
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
  return (
    <span className="bh-menu-anchor" style={{ left: menu.x, top: menu.y }}>
      <Menu
        open
        portal
        dense
        autoFocus
        anchor={<span ref={proxy} aria-hidden="true" />}
        getAnchorRect={() => proxy.current?.getBoundingClientRect() ?? null}
        items={channelMoveMenuItems(t, sections, currentSectionId)}
        onSelect={(id) => {
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
