import type { BotModeSortMode } from '../bot-mode-settings.js';
import type { ChannelSummary } from './store.js';

/**
 * Pure ordering and drag math for the BOT-mode sidebar (ADR-0031): resolve a
 * scope's mode, order its rows, and apply one drop inside a scope. Kept free
 * of React so #56 can extend the same core to cross-scope moves.
 */

/** Resolve a scope's stored override over the global default into the applied mode. */
export function resolvedSortMode(
  override: BotModeSortMode | undefined,
  global: BotModeSortMode,
): BotModeSortMode {
  return override ?? global;
}

/**
 * Restore one scope's membership to a preferred order: the preferred ids that
 * are members come first (first occurrence wins), then every member the
 * preferred order omitted, in its existing order. Shared by the render-side
 * reconciliation and the frozen `channels`-array write.
 * @param preferred - Stored order to apply.
 * @param members - Current membership ids in their existing order.
 * @returns Member ids in the reconciled order; inputs are not mutated.
 */
export function reconcileOrder(preferred: readonly string[], members: readonly string[]): string[] {
  const known = new Set(members);
  const next: string[] = [];
  const seen = new Set<string>();
  for (const id of preferred) {
    if (!known.has(id) || seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  for (const id of members) {
    if (seen.has(id)) continue;
    seen.add(id);
    next.push(id);
  }
  return next;
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
