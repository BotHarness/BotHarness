/** Transient sidebar selection, independent of the currently open conversation. */
export interface ChannelSelection {
  ids: readonly string[];
  anchorId: string | undefined;
}

export type ChannelSelectionGesture = 'plain' | 'toggle' | 'range';

/** Visible order is the authority: pinned first, then expanded roster rows. */
export function selectChannels(
  current: ChannelSelection,
  visibleIds: readonly string[],
  targetId: string,
  gesture: ChannelSelectionGesture,
): ChannelSelection {
  if (!visibleIds.includes(targetId)) return current;
  if (gesture === 'plain') return { ids: [], anchorId: targetId };
  const selected = new Set(current.ids.filter((id) => visibleIds.includes(id)));
  if (gesture === 'toggle') {
    if (
      selected.size === 0 &&
      current.anchorId !== undefined &&
      current.anchorId !== targetId &&
      visibleIds.includes(current.anchorId)
    ) {
      selected.add(current.anchorId);
    }
    if (selected.has(targetId)) selected.delete(targetId);
    else selected.add(targetId);
    return { ids: visibleIds.filter((id) => selected.has(id)), anchorId: targetId };
  }
  const anchorIndex = visibleIds.indexOf(current.anchorId ?? targetId);
  const targetIndex = visibleIds.indexOf(targetId);
  const first = Math.min(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex);
  const last = Math.max(anchorIndex < 0 ? targetIndex : anchorIndex, targetIndex);
  return { ids: visibleIds.slice(first, last + 1), anchorId: current.anchorId ?? targetId };
}

export function reconcileChannelSelection(
  current: ChannelSelection,
  visibleIds: readonly string[],
): ChannelSelection {
  const visible = new Set(visibleIds);
  return {
    ids: current.ids.filter((id) => visible.has(id)),
    anchorId:
      current.anchorId !== undefined && visible.has(current.anchorId)
        ? current.anchorId
        : undefined,
  };
}
