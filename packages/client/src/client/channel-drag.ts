import { useEffect, useState } from 'react';

/**
 * Channel and section drag (ADR-0031): the transient marker state, the
 * document-level native acceptance, and the rule that only a real drop on a
 * row, a section block, or a flat gap commits. A channel scope is a section
 * id or `undefined` for a loose (section-less) channel, so cross-container
 * moves reuse the in-section lifecycle; the section hook reorders the section
 * headers with the same marker rules.
 *
 * Nothing here ever takes layout: row, block, and gap markers are all
 * absolutely positioned overlays, and the drag source stays in place faded —
 * so no block changes height while a drag is in flight (a synchronous layout
 * shift inside the `dragstart` dispatch makes Chromium end the gesture with a
 * bare `dragend`; the native session rows likewise never reserve space).
 */

/** A channel scope: a section id, or `undefined` for a loose channel. */
export type ScopeId = string | undefined;

/** In-flight channel drag: source scope/row plus the current insert marker. */
interface ChannelDragState {
  scopeId: ScopeId;
  channelId: string;
  over: { scopeId: ScopeId; channelId: string; half: 'before' | 'after' } | null;
  /** Section body currently hovered (empty, collapsed, or filtered row-less). */
  overScope: { scopeId: ScopeId } | null;
  /** Flat gap beside a section block (loose placement, no membership change). */
  overGap: { sectionId: string; half: 'before' | 'after' } | null;
}

/** Drop target reported when a real drop lands on a channel row. */
export interface ChannelDropTarget {
  scopeId: ScopeId;
  channelId: string;
  half: 'before' | 'after';
}

/**
 * Drag wiring one channel row receives from its scope owner. `drop` is the
 * only commit point; `end` tears down the marker after a cancelled drag.
 */
export interface ChannelDragProps {
  start: () => void;
  /** True while any channel drag is in flight; every scope stays a drop target. */
  active: boolean;
  /** True on the dragged row itself; it stays in place, faded. */
  source: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  drop: (half: 'before' | 'after') => void;
  end: () => void;
}

/**
 * Accept the native drag at document level while a row drag is active
 * (ui-workspace acceptance): row hover still owns the insertion marker and a
 * release outside the rows keeps the browser from painting a rejected cursor.
 * The document-level drop never commits — only a row's own drop, a section
 * block's drop, or a flat gap's drop does.
 */
function useNativeDragAcceptance(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const acceptDrag = (event: DragEvent): void => {
      event.preventDefault();
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = 'move';
    };
    const acceptDrop = (event: DragEvent): void => {
      event.preventDefault();
    };
    document.addEventListener('dragover', acceptDrag);
    document.addEventListener('drop', acceptDrop);
    return () => {
      document.removeEventListener('dragover', acceptDrag);
      document.removeEventListener('drop', acceptDrop);
    };
  }, [active]);
}

/** Commit one real channel drop: the dragged row plus the row and side it landed on. */
export type ChannelDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  target: ChannelDropTarget,
) => void;

/**
 * Commit one real drop on a section body without visible rows (empty,
 * collapsed, or filtered row-less): the dragged row plus the target scope.
 * The owner resolves it as a scope (append) move.
 */
export type ChannelScopeDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  scopeId: ScopeId,
) => void;

/**
 * Commit one real drop into a flat gap beside a section block: the dragged
 * row plus the anchor section and side. The owner resolves it as a loose flat
 * placement (no scope mode changes).
 */
export type ChannelGapDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  target: { sectionId: string; half: 'before' | 'after' },
) => void;

/**
 * Drag wiring one scope's row-less section body receives. `drop` is the only
 * commit point; row, body, and gap markers are mutually exclusive, so
 * hovering one clears the others.
 */
export interface ChannelScopeDropProps {
  /** True while any channel drag is in flight. */
  active: boolean;
  /** True while the drag hovers this body; the insert line shows. */
  hovered: boolean;
  hover: () => void;
  leave: () => void;
  drop: () => void;
}

/**
 * Drag wiring one section block receives for flat gap drops beside it.
 * `drop` is the only commit point; the block-edge insert line reuses the
 * section insert-line visuals.
 */
export interface ChannelGapDropProps {
  /** True while any channel drag is in flight. */
  active: boolean;
  /** Insert line at this block's edge while a gap hover resolves here. */
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  leave: () => void;
  drop: (half: 'before' | 'after') => void;
}

/** Handle returned by {@link useChannelDrag} for one sidebar's channel rows. */
export interface ChannelDragHandle {
  /** True while any channel drag is in flight. */
  active: boolean;
  /** Drag props for one channel row, in any scope. */
  propsFor: (scopeId: ScopeId, channelId: string) => ChannelDragProps;
  /** Drop props for one scope's row-less section body. */
  scopePropsFor: (scopeId: ScopeId) => ChannelScopeDropProps;
  /** Gap props for one section block's margins. */
  gapPropsFor: (sectionId: string) => ChannelGapDropProps;
  /** Clear a stale gap hover (pointer left all margin bands without landing). */
  clearGapHover: () => void;
}

/**
 * One drag lifecycle for channel rows across scopes and flat gaps. `commit`
 * runs only for a real drop on a row, `commitScope` only for a real drop on a
 * row-less section body, and `commitGap` only for a real drop into a flat
 * gap; `dragend` just clears the transient marker, so a cancelled drag
 * (Escape) or a release outside the rows commits nothing.
 * @param commit - Receives the source scope/row and the drop target.
 * @param commitScope - Receives the source scope/row and the row-less target scope.
 * @param commitGap - Receives the source scope/row and the gap anchor.
 * @returns The per-row drag props factory plus the scope and gap factories.
 */
export function useChannelDrag(
  commit: ChannelDropCommit,
  commitScope: ChannelScopeDropCommit,
  commitGap: ChannelGapDropCommit,
): ChannelDragHandle {
  const [drag, setDrag] = useState<ChannelDragState | null>(null);
  useNativeDragAcceptance(drag !== null);

  const clearOver = (
    current: ChannelDragState,
    over: ChannelDragState['over'],
    overScope: ChannelDragState['overScope'],
    overGap: ChannelDragState['overGap'],
  ): ChannelDragState => ({ ...current, over, overScope, overGap });

  const propsFor = (scopeId: ScopeId, channelId: string): ChannelDragProps => {
    const over = drag?.over ?? null;
    const marker =
      over !== null && over.scopeId === scopeId && over.channelId === channelId ? over.half : null;
    return {
      start: () => {
        setDrag({ scopeId, channelId, over: null, overScope: null, overGap: null });
      },
      active: drag !== null,
      source: drag !== null && drag.scopeId === scopeId && drag.channelId === channelId,
      marker,
      hover: (half) => {
        setDrag((current) =>
          current === null ? current : clearOver(current, { scopeId, channelId, half }, null, null),
        );
      },
      drop: (half) => {
        if (drag === null) return;
        commit({ scopeId: drag.scopeId, channelId: drag.channelId }, { scopeId, channelId, half });
        setDrag(null);
      },
      end: () => {
        setDrag(null);
      },
    };
  };

  const scopePropsFor = (scopeId: ScopeId): ChannelScopeDropProps => {
    const hovered = drag?.overScope?.scopeId === scopeId;
    return {
      active: drag !== null,
      hovered,
      hover: () => {
        setDrag((current) =>
          current === null ? current : clearOver(current, null, { scopeId }, null),
        );
      },
      leave: () => {
        setDrag((current) =>
          current === null || current.overScope?.scopeId !== scopeId
            ? current
            : clearOver(current, current.over, null, current.overGap),
        );
      },
      drop: () => {
        if (drag === null) return;
        commitScope({ scopeId: drag.scopeId, channelId: drag.channelId }, scopeId);
        setDrag(null);
      },
    };
  };

  const gapPropsFor = (sectionId: string): ChannelGapDropProps => {
    const overGap = drag?.overGap ?? null;
    const marker = overGap !== null && overGap.sectionId === sectionId ? overGap.half : null;
    return {
      active: drag !== null,
      marker,
      hover: (half) => {
        setDrag((current) =>
          current === null ? current : clearOver(current, null, null, { sectionId, half }),
        );
      },
      leave: () => {
        setDrag((current) =>
          current === null || current.overGap?.sectionId !== sectionId
            ? current
            : clearOver(current, current.over, current.overScope, null),
        );
      },
      drop: (half) => {
        if (drag === null) return;
        commitGap({ scopeId: drag.scopeId, channelId: drag.channelId }, { sectionId, half });
        setDrag(null);
      },
    };
  };

  return {
    active: drag !== null,
    propsFor,
    scopePropsFor,
    gapPropsFor,
    clearGapHover: () => {
      setDrag((current) =>
        current === null || current.overGap === null ? current : { ...current, overGap: null },
      );
    },
  };
}

/** In-flight section drag: source header plus the current insert marker. */
interface SectionDragState {
  sectionId: string;
  over: { sectionId: string; half: 'before' | 'after' } | null;
}

/** Drop target reported when a real drop lands on a section block. */
export interface SectionDropTarget {
  sectionId: string;
  half: 'before' | 'after';
}

/** Drag wiring one section block receives; `drop` is the only commit point. */
export interface SectionDragProps {
  start: () => void;
  active: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  drop: (half: 'before' | 'after') => void;
  end: () => void;
}

/** Commit one real section drop: the dragged section plus the block and side it landed on. */
export type SectionDropCommit = (sectionId: string, target: SectionDropTarget) => void;

/** Handle returned by {@link useSectionDrag} for one sidebar's section blocks. */
export interface SectionDragHandle {
  /** Drag props for one section block; the marker renders on its wrapper. */
  propsFor: (sectionId: string) => SectionDragProps;
}

/**
 * One drag lifecycle for the section headers. The marker lands on the whole
 * section block (the native `.groupSection` recipe), which is also the drop
 * target, so a release between rows still reorders sections. Only a real drop
 * commits; `end` merely clears the marker.
 * @param commit - Receives the dragged section id and the drop target.
 * @returns The per-section drag props factory.
 */
export function useSectionDrag(commit: SectionDropCommit): SectionDragHandle {
  const [drag, setDrag] = useState<SectionDragState | null>(null);
  useNativeDragAcceptance(drag !== null);

  const propsFor = (sectionId: string): SectionDragProps => {
    const marker = drag !== null && drag.over?.sectionId === sectionId ? drag.over.half : null;
    return {
      start: () => {
        setDrag({ sectionId, over: null });
      },
      active: drag !== null,
      marker,
      hover: (half) => {
        setDrag((current) =>
          current === null ? current : { ...current, over: { sectionId, half } },
        );
      },
      drop: (half) => {
        if (drag === null) return;
        commit(drag.sectionId, { sectionId, half });
        setDrag(null);
      },
      end: () => {
        setDrag(null);
      },
    };
  };

  return { propsFor };
}
