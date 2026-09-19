import { useEffect, useState } from 'react';

/**
 * Section-internal channel drag (ADR-0031): the transient marker state, the
 * document-level native acceptance, and the rule that only a real drop on a
 * row commits. Kept out of the sidebar component so #56 can widen the same
 * lifecycle to cross-scope moves without growing the roster view.
 */

/** In-flight channel drag inside one section: source row plus the current insert marker. */
interface ChannelDragState {
  sectionId: string;
  channelId: string;
  over: { channelId: string; half: 'before' | 'after' } | null;
}

/** Drop target reported when a real drop lands on a row. */
export interface ChannelDropTarget {
  channelId: string;
  half: 'before' | 'after';
}

/**
 * Drag wiring one channel row receives from its section owner. `drop` is the
 * only commit point; `end` tears down the marker after a cancelled drag.
 */
export interface ChannelDragProps {
  start: () => void;
  active: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  drop: (half: 'before' | 'after') => void;
  end: () => void;
}

/**
 * Accept the native drag at document level while a row drag is active
 * (ui-workspace acceptance): row hover still owns the insertion marker and a
 * release outside the rows keeps the browser from painting a rejected cursor.
 * The document-level drop never commits — only a row's own drop does.
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

/** Commit one real drop: the dragged row plus the row and side it landed on. */
export type ChannelDropCommit = (
  drag: { sectionId: string; channelId: string },
  target: ChannelDropTarget,
) => void;

/** Handle returned by {@link useChannelDrag} for one sidebar's section rows. */
export interface ChannelDragHandle {
  /** Drag props for one channel row; only section rows receive them. */
  propsFor: (sectionId: string, channelId: string) => ChannelDragProps;
}

/**
 * One drag lifecycle for section-internal channel reorder. `commit` runs only
 * for a real drop on a row; `dragend` just clears the transient marker, so a
 * cancelled drag (Escape) or a release outside the rows commits nothing.
 * @param commit - Receives the source scope/row and the drop target.
 * @returns The per-row drag props factory.
 */
export function useChannelDrag(commit: ChannelDropCommit): ChannelDragHandle {
  const [drag, setDrag] = useState<ChannelDragState | null>(null);
  useNativeDragAcceptance(drag !== null);

  const propsFor = (sectionId: string, channelId: string): ChannelDragProps => {
    const marker =
      drag !== null && drag.sectionId === sectionId && drag.over?.channelId === channelId
        ? drag.over.half
        : null;
    return {
      start: () => {
        setDrag({ sectionId, channelId, over: null });
      },
      active: drag !== null && drag.sectionId === sectionId,
      marker,
      hover: (half) => {
        setDrag((current) =>
          current === null ? current : { ...current, over: { channelId, half } },
        );
      },
      drop: (half) => {
        if (drag === null) return;
        commit({ sectionId: drag.sectionId, channelId: drag.channelId }, { channelId, half });
        setDrag(null);
      },
      end: () => {
        setDrag(null);
      },
    };
  };

  return { propsFor };
}
