import { useEffect, useState } from 'react';

export type ScopeId = string | undefined;

interface ChannelDragState {
  scopeId: ScopeId;
  channelId: string;
  over: { scopeId: ScopeId; channelId: string; half: 'before' | 'after' } | null;
  overScope: { scopeId: ScopeId } | null;
  overGap: { sectionId: string; half: 'before' | 'after' } | null;
}

export interface ChannelDropTarget {
  scopeId: ScopeId;
  channelId: string;
  half: 'before' | 'after';
}

export interface ChannelDragProps {
  start: () => void;
  active: boolean;
  source: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  drop: (half: 'before' | 'after') => void;
  end: () => void;
}

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

export type ChannelDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  target: ChannelDropTarget,
) => void;

export type ChannelScopeDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  scopeId: ScopeId,
) => void;

export type ChannelGapDropCommit = (
  drag: { scopeId: ScopeId; channelId: string },
  target: { sectionId: string; half: 'before' | 'after' },
) => void;

export interface ChannelScopeDropProps {
  active: boolean;
  hovered: boolean;
  hover: () => void;
  leave: () => void;
  drop: () => void;
}

export interface ChannelGapDropProps {
  active: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  leave: () => void;
  drop: (half: 'before' | 'after') => void;
}

export interface ChannelDragHandle {
  active: boolean;
  propsFor: (scopeId: ScopeId, channelId: string) => ChannelDragProps;
  scopePropsFor: (scopeId: ScopeId) => ChannelScopeDropProps;
  gapPropsFor: (sectionId: string) => ChannelGapDropProps;
  clearGapHover: () => void;
}

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

interface SectionDragState {
  sectionId: string;
  over: { sectionId: string; half: 'before' | 'after' } | null;
}

export interface SectionDropTarget {
  sectionId: string;
  half: 'before' | 'after';
}

export interface SectionDragProps {
  start: () => void;
  active: boolean;
  marker: 'before' | 'after' | null;
  hover: (half: 'before' | 'after') => void;
  drop: (half: 'before' | 'after') => void;
  end: () => void;
}

export type SectionDropCommit = (sectionId: string, target: SectionDropTarget) => void;

export interface SectionDragHandle {
  propsFor: (sectionId: string) => SectionDragProps;
}

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
