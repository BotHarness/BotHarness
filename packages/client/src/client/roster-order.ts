import type { BotModeSortMode } from '../bot-mode-settings.js';
import { reconcileOrder, sameIds } from './roster.js';
import type { TopOrderEntry } from './roster.js';
import type { ChannelSummary } from './store.js';

/**
 * Pure ordering and drag math for the BOT-mode sidebar (ADR-0031): resolve a
 * scope's mode, order its rows, and plan one channel drop — inside a scope,
 * across scopes, or from the context menu. Kept free of React.
 */

/** Resolve a scope's stored override over the global default into the applied mode. */
export function resolvedSortMode(
  override: BotModeSortMode | undefined,
  global: BotModeSortMode,
): BotModeSortMode {
  return override ?? global;
}

function updatedAtTime(updatedAt: string): number {
  const parsed = Date.parse(updatedAt);
  return Number.isNaN(parsed) ? Number.NEGATIVE_INFINITY : parsed;
}

/** Newest first with the stable row id as the tie-break. */
function byRecency(left: ChannelSummary, right: ChannelSummary): number {
  const leftTime = updatedAtTime(left.updatedAt);
  const rightTime = updatedAtTime(right.updatedAt);
  if (leftTime !== rightTime) return rightTime - leftTime;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/**
 * Order one scope's visible channels by its resolved mode.
 * @param channels - Channels visible in the scope, in roster order.
 * @param mode - Resolved mode; `updated` ignores the stored order.
 * @param manualOrder - Frozen manual order (a section's `channels` array);
 *   absent means the scope has no manual order and keeps roster order.
 * @returns Ordered channels; the input is not mutated.
 */
export function orderScopeChannels(
  channels: readonly ChannelSummary[],
  mode: BotModeSortMode,
  manualOrder?: readonly string[] | undefined,
): ChannelSummary[] {
  if (mode === 'updated') return [...channels].sort(byRecency);
  if (manualOrder === undefined) return [...channels];
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  return reconcileOrder(
    manualOrder,
    channels.map((channel) => channel.id),
  ).flatMap((id) => {
    const channel = byId.get(id);
    return channel === undefined ? [] : [channel];
  });
}

/** Which half of a row the pointer is over; the insert line lands above or below it. */
export function rowDropHalf(
  clientY: number,
  rect: { top: number; height: number },
): 'before' | 'after' {
  return clientY < rect.top + rect.height / 2 ? 'before' : 'after';
}

/**
 * Apply one drop inside a single scope: remove the source row and insert it on
 * the target side.
 * @param order - Displayed row ids in their current visual order.
 * @param sourceId - Id of the dragged row.
 * @param targetId - Id of the hovered row.
 * @param half - Side of the target the pointer released on.
 * @returns The next order, or `undefined` for an unknown row or a no-op drop.
 */
export function moveWithinOrder(
  order: readonly string[],
  sourceId: string,
  targetId: string,
  half: 'before' | 'after',
): string[] | undefined {
  if (sourceId === targetId) return undefined;
  const hasSource = order.includes(sourceId);
  const hasTarget = order.includes(targetId);
  if (!hasSource || !hasTarget) return undefined;
  const withoutSource = order.filter((id) => id !== sourceId);
  const targetIndex = withoutSource.indexOf(targetId);
  const insertAt = half === 'before' ? targetIndex : targetIndex + 1;
  const next = [...withoutSource.slice(0, insertAt), sourceId, ...withoutSource.slice(insertAt)];
  if (next.length === order.length && next.every((id, index) => id === order[index])) {
    return undefined;
  }
  return next;
}

/** Result of one in-scope drop: the frozen order plus whether the scope unlocks. */
export interface ScopeReorder {
  /** Row ids in their new order. */
  order: string[];
  /** True while the scope still inherits (or overrides with `updated`). */
  setManualOverride: boolean;
}

/**
 * Plan the commit of one in-scope drop. The first manual reorder in a scope
 * freezes the displayed order and flips that scope to `manual`; later drops
 * only rewrite the order. The source scope is the only scope touched — #56
 * extends this step for drops across scopes.
 * @param displayedOrder - Row ids in the scope's full visual order.
 * @param sourceId - Id of the dragged row.
 * @param targetId - Id of the hovered row.
 * @param half - Side of the target the pointer released on.
 * @param manualOverride - Whether the scope already carries a manual override.
 * @returns The planned order and unlock flag, or `undefined` for a no-op drop.
 */
export function commitScopeReorder(
  displayedOrder: readonly string[],
  sourceId: string,
  targetId: string,
  half: 'before' | 'after',
  manualOverride: boolean,
): ScopeReorder | undefined {
  const order = moveWithinOrder(displayedOrder, sourceId, targetId, half);
  if (order === undefined) return undefined;
  return { order, setManualOverride: !manualOverride };
}

/** Where a drop landed: a row half, or a whole scope at a deliberate edge. */
export type ScopeDropTarget =
  | { kind: 'row'; channelId: string; half: 'before' | 'after' }
  | {
      kind: 'scope';
      /** Drag prediction lines use first; context-menu picks default to last. */
      position?: 'first' | 'last';
    };

/** One drop resolved against its target scope. */
export interface ChannelMoveDrop {
  /** Target scope; `undefined` is 未分组. */
  targetScopeId: string | undefined;
  target: ScopeDropTarget;
  /** Target scope's full displayed row ids (unfiltered), in visual order. */
  targetOrder: readonly string[];
  /** Whether the target section already carries an explicit `manual` override. */
  targetManualOverride: boolean;
}

/** Planned channel move: a section target carries the frozen order, 未分组 none. */
export type ChannelMovePlan =
  | { kind: 'ungrouped'; setManualOverride: false }
  | { kind: 'section'; sectionId: string; order: string[]; setManualOverride: boolean };

/**
 * Plan one channel move: an in-scope reorder, a cross-scope drop, or a
 * context-menu pick. A section target freezes the displayed order with the
 * moved channel at the drop position and unlocks to `manual` unless it already
 * overrides; the source scope's mode is never touched. 未分组 has no stored
 * order, so a drop there only changes membership.
 * @param sourceScopeId - Scope the channel currently lives in; `undefined` = 未分组.
 * @param channelId - Channel being moved.
 * @param drop - Resolved target scope, drop target, displayed order, and mode.
 * @returns The planned move, or `undefined` for a no-op.
 */
export function planChannelMove(
  sourceScopeId: string | undefined,
  channelId: string,
  drop: ChannelMoveDrop,
): ChannelMovePlan | undefined {
  if (drop.target.kind === 'row' && drop.target.channelId === channelId) return undefined;
  const sameScope = sourceScopeId === drop.targetScopeId;
  if (drop.target.kind === 'scope' && sameScope && drop.targetOrder.includes(channelId))
    return undefined;
  const without = drop.targetOrder.filter((id) => id !== channelId);
  let order: string[];
  if (drop.target.kind === 'scope') {
    order = drop.target.position === 'first' ? [channelId, ...without] : [...without, channelId];
  } else {
    const targetIndex = without.indexOf(drop.target.channelId);
    if (targetIndex === -1) return undefined;
    const insertAt = drop.target.half === 'before' ? targetIndex : targetIndex + 1;
    order = [...without.slice(0, insertAt), channelId, ...without.slice(insertAt)];
  }
  if (sameScope && sameIds(drop.targetOrder, order)) return undefined;
  if (drop.targetScopeId === undefined) {
    return { kind: 'ungrouped', setManualOverride: false };
  }
  return {
    kind: 'section',
    sectionId: drop.targetScopeId,
    order,
    setManualOverride: !drop.targetManualOverride,
  };
}

/** Callbacks applying one planned channel move to the settings store and the bridge. */
export interface ChannelMoveSink {
  /** Move the channel out of every section (`channelAssign(channelId, undefined)`). */
  assignToUngrouped: (channelId: string) => void;
  /** Frozen target order through positioned `channelAssign` writes. */
  moveToSection: (channelId: string, sectionId: string, order: readonly string[]) => void;
  /** Pin the target section to `manual` so the frozen order applies. */
  setSectionManual: (sectionId: string) => void;
}

/**
 * Apply one planned move: unlock the target section first, then write the
 * membership and order through the bridge. A 未分组 plan only moves the
 * channel; no scope's mode changes.
 * @param sink - The sidebar's settings-store and bridge callbacks.
 * @param channelId - Channel being moved.
 * @param plan - Result of {@link planChannelMove}.
 */
export function applyChannelMove(
  sink: ChannelMoveSink,
  channelId: string,
  plan: ChannelMovePlan,
): void {
  if (plan.kind === 'ungrouped') {
    sink.assignToUngrouped(channelId);
    return;
  }
  if (plan.setManualOverride) sink.setSectionManual(plan.sectionId);
  sink.moveToSection(channelId, plan.sectionId, plan.order);
}

/**
 * Complete one flat top-level order from a host projection: keep the stored
 * entries that still resolve (known sections; channel entries pass through
 * for the caller to reconcile), then append every known group channel that
 * has neither an entry nor a section home, in channel-list order — so newly
 * created channels always render (at the end) even before any flat write.
 * @param topOrder - Stored entries, or `undefined` for a pre-flat host.
 * @param sectionIds - Known section ids in snapshot order.
 * @param groupChannelIds - Known group channel ids in channel-list order.
 * @param sectionedIds - Channel ids contained in any section.
 * @returns The complete flat order; inputs are not mutated.
 */
export function completeFlatEntries(
  topOrder: readonly TopOrderEntry[] | undefined,
  sectionIds: readonly string[],
  groupChannelIds: readonly string[],
  sectionedIds: ReadonlySet<string>,
): TopOrderEntry[] {
  const knownSections = new Set(sectionIds);
  const entries: TopOrderEntry[] = [];
  const placed = new Set<string>();
  if (topOrder !== undefined) {
    for (const entry of topOrder) {
      if (entry.kind === 'section') {
        if (!knownSections.has(entry.id) || placed.has(`section:${entry.id}`)) continue;
        placed.add(`section:${entry.id}`);
        entries.push({ kind: 'section', id: entry.id });
      } else {
        if (sectionedIds.has(entry.id) || placed.has(`channel:${entry.id}`)) continue;
        placed.add(`channel:${entry.id}`);
        entries.push({ kind: 'channel', id: entry.id });
      }
    }
  } else {
    for (const id of sectionIds) {
      placed.add(`section:${id}`);
      entries.push({ kind: 'section', id });
    }
  }
  for (const id of groupChannelIds) {
    if (sectionedIds.has(id) || placed.has(`channel:${id}`)) continue;
    placed.add(`channel:${id}`);
    entries.push({ kind: 'channel', id });
  }
  return entries;
}

function flatEntryKey(entry: TopOrderEntry): string {
  return `${entry.kind}:${entry.id}`;
}

function sameFlatEntries(left: readonly TopOrderEntry[], right: readonly TopOrderEntry[]): boolean {
  return (
    left.length === right.length &&
    left.every(
      (entry, index) => flatEntryKey(entry) === flatEntryKey(right[index] as TopOrderEntry),
    )
  );
}

/** One visible row's vertical geometry for block-level drop resolution. */
export interface BlockRowGeometry {
  id: string;
  top: number;
  height: number;
}

/** Where a drop inside a section block (but not on a row) resolves. */
export type BlockDropResolution =
  /** Append position of an empty (or row-less) body: index 0 of the scope. */
  | { kind: 'scope' }
  /** A row anchor plus side: the insert line shows at that resolved index. */
  | { kind: 'row'; channelId: string; half: 'before' | 'after' };

/**
 * Resolve a drop anywhere inside a section block that is not on a row —
 * header area, body padding, inter-row gaps — to a row anchor. The header
 * area inserts at the first index (the insert line lands before the first row);
 * every other position takes the nearest row half. An empty (or row-less)
 * body resolves to the scope itself (append at index 0).
 * @param rows - Visible rows in order.
 * @param headerBottom - Bottom edge of the section header.
 * @param clientY - Pointer height.
 */
export function resolveBlockDropTarget(
  rows: readonly BlockRowGeometry[],
  headerBottom: number,
  clientY: number,
): BlockDropResolution {
  if (rows.length === 0) return { kind: 'scope' };
  if (clientY <= headerBottom) {
    const first = rows[0] as BlockRowGeometry;
    return { kind: 'row', channelId: first.id, half: 'before' };
  }
  for (const row of rows) {
    if (clientY < row.top + row.height / 2) {
      return { kind: 'row', channelId: row.id, half: 'before' };
    }
  }
  const last = rows[rows.length - 1] as BlockRowGeometry;
  return { kind: 'row', channelId: last.id, half: 'after' };
}

/** Anchor a loose flat placement beside one flat entry. */
export interface FlatAnchor {
  kind: 'section' | 'channel';
  id: string;
  side: 'before' | 'after';
}

/** Planned loose move: the absolute flat order plus whether membership must leave a section. */
export interface FlatInsertPlan {
  order: TopOrderEntry[];
  /** True when the channel currently lives in a section and must be unassigned first. */
  unassign: boolean;
}

/**
 * Resolve durable pin tokens to Channel ids. Current records already contain
 * Channel ids; a pre-channel-pinning record may contain a PersonaBot slug, so
 * resolve that slug to its DM until the next pin write canonicalises the list.
 */
export function resolvePinnedChannelIds(
  channels: readonly ChannelSummary[],
  pins: readonly string[],
): string[] {
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  const dmByBotSlug = new Map(
    channels.flatMap((channel) =>
      channel.type === 'dm' && channel.botSlug !== undefined ? [[channel.botSlug, channel]] : [],
    ),
  );
  const resolved: string[] = [];
  const seen = new Set<string>();
  for (const pin of pins) {
    const channel = byId.get(pin) ?? dmByBotSlug.get(pin);
    if (channel === undefined || seen.has(channel.id)) continue;
    if (channel.type === 'dm' && channel.botSlug === undefined) continue;
    seen.add(channel.id);
    resolved.push(channel.id);
  }
  return resolved;
}

/**
 * Channel ids that participate in the sidebar's flat order. Every renderable
 * unpinned Channel participates; orphan DMs have no PersonaBot row and are
 * omitted.
 */
export function flatRosterChannelIds(
  channels: readonly ChannelSummary[],
  pinnedChannelIds: ReadonlySet<string>,
): string[] {
  return channels.flatMap((channel) => {
    if (pinnedChannelIds.has(channel.id)) return [];
    if (channel.type === 'group') return [channel.id];
    if (channel.botSlug === undefined) return [];
    return [channel.id];
  });
}

/**
 * Plan one loose flat placement: a gap drop beside a section block, or a drop
 * onto a loose row. A sectioned source is unassigned first (single ownership;
 * no scope mode is ever touched) and lands beside the anchor; a loose source
 * only reorders. Loose channels keep their flat positions in every sort mode.
 * @param flat - Full flat entries (unfiltered), in display order.
 * @param channelId - Channel being moved.
 * @param fromSection - Whether the channel currently lives in a section.
 * @param anchor - Flat entry beside which the channel lands.
 * @returns The absolute flat order and the membership step, or `undefined`
 *   for an unknown anchor, an inconsistent source, or a no-op drop.
 */
export function planFlatInsert(
  flat: readonly TopOrderEntry[],
  channelId: string,
  fromSection: boolean,
  anchor: FlatAnchor,
): FlatInsertPlan | undefined {
  if (fromSection) {
    // A pinned loose Channel keeps its durable topOrder slot while pinned.
    // Treat it like a sectioned source: remove that stale slot before placing
    // the one accepted occurrence at the predicted drop line.
    const without = flat.filter((entry) => entry.kind !== 'channel' || entry.id !== channelId);
    const anchorIndex = without.map(flatEntryKey).indexOf(`${anchor.kind}:${anchor.id}`);
    if (anchorIndex === -1) return undefined;
    const at = anchor.side === 'before' ? anchorIndex : anchorIndex + 1;
    return {
      order: [
        ...without.slice(0, at).map((entry) => ({ ...entry })),
        { kind: 'channel' as const, id: channelId },
        ...without.slice(at).map((entry) => ({ ...entry })),
      ],
      unassign: true,
    };
  }
  const keys = flat.map(flatEntryKey);
  const anchorIndex = keys.indexOf(`${anchor.kind}:${anchor.id}`);
  if (anchorIndex === -1) return undefined;
  const selfIndex = keys.indexOf(`channel:${channelId}`);
  if (selfIndex === -1) return undefined;
  const without = flat.filter((_, index) => index !== selfIndex);
  const at =
    anchor.side === 'before'
      ? anchorIndex - (selfIndex < anchorIndex ? 1 : 0)
      : anchorIndex + (selfIndex > anchorIndex ? 1 : 0);
  const next = [
    ...without.slice(0, at).map((entry) => ({ ...entry })),
    { kind: 'channel' as const, id: channelId },
    ...without.slice(at).map((entry) => ({ ...entry })),
  ];
  return sameFlatEntries(flat, next) ? undefined : { order: next, unassign: false };
}
