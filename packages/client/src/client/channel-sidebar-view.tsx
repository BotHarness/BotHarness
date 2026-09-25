import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';

import { IconChevronDownOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type {
  ChannelSidebarEntry,
  ChannelSidebarEntryProps,
  ChannelSidebarRegistry,
  ChannelSidebarScope,
} from './channel-sidebar.js';
import {
  NARROW_CHANNEL_SIDEBAR_QUERY,
  resolveChannelSidebarMode,
  type ChannelSidebarMode,
} from './channel-sidebar-layout.js';
import {
  channelSidebarPrefs,
  channelSidebarScopeKey,
  clampChannelSidebarWidth,
  DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  type ChannelSidebarPrefs,
  MAX_CHANNEL_SIDEBAR_WIDTH,
  MIN_CHANNEL_SIDEBAR_WIDTH,
} from './channel-sidebar-prefs.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ClientState } from './store.js';

function matchesNarrow(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(NARROW_CHANNEL_SIDEBAR_QUERY).matches
    : false;
}

function subscribeNarrow(listener: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  const query = window.matchMedia(NARROW_CHANNEL_SIDEBAR_QUERY);
  query.addEventListener('change', listener);
  return () => {
    query.removeEventListener('change', listener);
  };
}

export function useNarrowChannelSidebar(): boolean {
  return useSyncExternalStore(subscribeNarrow, matchesNarrow, () => false);
}

/** Head-of-conversation control surface for the Channel sidebar. */
export interface ChannelSidebarController {
  mode: ChannelSidebarMode;
  narrow: boolean;
  scopeKey: string | undefined;
  /** Docked width in CSS pixels. */
  width: number;
  setWidth(width: number): void;
  isEntryExpanded(entryId: string): boolean;
  toggleEntry(entryId: string): void;
  toggle(): void;
  close(): void;
}

export function useChannelSidebar(
  state: ClientState,
  prefs: ChannelSidebarPrefs = channelSidebarPrefs,
): ChannelSidebarController {
  const narrow = useNarrowChannelSidebar();
  const [overlayOpen, setOverlayOpen] = useState(false);
  const selection = state.selection;
  const channel = state.conversation.channel;
  const scope: ChannelSidebarScope = selection?.kind === 'bot' ? 'personabot' : 'channel';
  const scopeKey =
    channel === undefined
      ? undefined
      : channelSidebarScopeKey(
          scope,
          channel.id,
          selection?.kind === 'bot' ? selection.slug : undefined,
        );
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const docked = scopeKey !== undefined && !snapshot.collapsedSidebars.includes(scopeKey);

  useEffect(() => {
    setOverlayOpen(false);
  }, [scopeKey]);

  const close = useCallback(() => {
    if (narrow) {
      setOverlayOpen(false);
      return;
    }
    if (scopeKey === undefined) return;
    prefs.setSidebarCollapsed(scopeKey, true);
  }, [narrow, scopeKey, prefs]);

  return {
    mode: resolveChannelSidebarMode({ narrow, docked, overlayOpen }),
    narrow,
    scopeKey,
    width: snapshot.width,
    setWidth: (width) => prefs.setWidth(width),
    isEntryExpanded: (entryId) =>
      scopeKey !== undefined && prefs.isEntryExpanded(scopeKey, entryId),
    toggleEntry: (entryId) => {
      if (scopeKey === undefined) return;
      prefs.setEntryExpanded(scopeKey, entryId, !prefs.isEntryExpanded(scopeKey, entryId));
    },
    toggle: () => {
      if (narrow) {
        setOverlayOpen((open) => !open);
        return;
      }
      if (scopeKey === undefined) return;
      prefs.setSidebarCollapsed(scopeKey, docked);
    },
    close,
  };
}

export function ChannelSidebarEntrySection({
  entry,
  expanded,
  onToggle,
  entryProps,
}: {
  entry: ChannelSidebarEntry;
  expanded: boolean;
  onToggle(): void;
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const bodyId = useId();
  const Badge = entry.badge;
  return (
    <section className="bh-channel-sidebar-entry">
      <button
        type="button"
        className="bh-channel-sidebar-entry-head"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={onToggle}
      >
        <span
          className={`bh-channel-sidebar-entry-chevron${expanded ? '' : ' bh-chevron-collapsed'}`}
          aria-hidden="true"
        >
          <IconChevronDownOutlineRegular size={14} />
        </span>
        <span className="bh-channel-sidebar-entry-label">{entry.label}</span>
        {Badge === undefined ? null : (
          <span className="bh-channel-sidebar-entry-badge">
            <Badge {...entryProps} />
          </span>
        )}
      </button>
      {expanded ? (
        <div id={bodyId} className="bh-channel-sidebar-entry-body">
          <entry.component {...entryProps} />
        </div>
      ) : null}
    </section>
  );
}

export function ChannelSidebar({
  registry,
  state,
  actions,
  controller,
  t,
  onMemoryCommitSelect,
  selectedMemoryCommitSha,
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  controller: ChannelSidebarController;
  t: BotHarnessTranslate;
  onMemoryCommitSelect?: ((sha: string) => void) | undefined;
  selectedMemoryCommitSha?: string | undefined;
}): ReactElement | null {
  const selection = state.selection;
  const channel = state.conversation.channel;
  const scope: ChannelSidebarScope = selection?.kind === 'bot' ? 'personabot' : 'channel';
  const entries = useSyncExternalStore(
    registry.subscribe,
    () => registry.entries(scope),
    () => registry.entries(scope),
  );
  const closeRef = useRef(controller);
  useEffect(() => {
    closeRef.current = controller;
  });
  useEffect(() => {
    if (controller.mode !== 'overlay') return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') closeRef.current.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [controller.mode]);

  if (channel === undefined || controller.scopeKey === undefined || controller.mode === 'hidden') {
    return null;
  }
  const entryProps: ChannelSidebarEntryProps = {
    scope,
    channelId: channel.id,
    botSlug: selection?.kind === 'bot' ? selection.slug : undefined,
    actions,
    t,
    onMemoryCommitSelect,
    selectedMemoryCommitSha,
  };
  const dockedWidth = clampChannelSidebarWidth(controller.width);
  const panel = (
    <div
      id="bh-channel-sidebar"
      className={`bh-channel-sidebar${controller.mode === 'overlay' ? ' bh-channel-sidebar-overlay' : ''}`}
      role="complementary"
      aria-label={t('sidebar.region')}
      style={
        controller.mode === 'overlay'
          ? undefined
          : { width: `${String(dockedWidth)}px`, flexBasis: `${String(dockedWidth)}px` }
      }
    >
      {controller.mode === 'overlay' ? null : (
        <div
          className="bh-channel-sidebar-resize"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={t('sidebar.resize.label')}
          aria-valuenow={dockedWidth}
          aria-valuemin={MIN_CHANNEL_SIDEBAR_WIDTH}
          aria-valuemax={MAX_CHANNEL_SIDEBAR_WIDTH}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 40 : 10;
            if (event.key === 'ArrowLeft') {
              event.preventDefault();
              controller.setWidth(dockedWidth + step);
            } else if (event.key === 'ArrowRight') {
              event.preventDefault();
              controller.setWidth(dockedWidth - step);
            } else if (event.key === 'Home') {
              event.preventDefault();
              controller.setWidth(MIN_CHANNEL_SIDEBAR_WIDTH);
            } else if (event.key === 'End') {
              event.preventDefault();
              controller.setWidth(MAX_CHANNEL_SIDEBAR_WIDTH);
            }
          }}
          onPointerDown={(event) => {
            const startX = event.clientX;
            const startWidth = dockedWidth;
            event.currentTarget.setPointerCapture(event.pointerId);
            const onMove = (move: PointerEvent): void => {
              controller.setWidth(startWidth - (move.clientX - startX));
            };
            const onUp = (): void => {
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
          onDoubleClick={() => controller.setWidth(DEFAULT_CHANNEL_SIDEBAR_WIDTH)}
        />
      )}
      <div className="bh-channel-sidebar-head">
        <span className="bh-channel-sidebar-title">{channel.name}</span>
      </div>
      <div className="bh-channel-sidebar-entries">
        {entries.length === 0 ? (
          <div className="bh-note">{t('sidebar.empty')}</div>
        ) : (
          entries.map((entry) => (
            <ChannelSidebarEntrySection
              key={entry.id}
              entry={entry}
              expanded={controller.isEntryExpanded(entry.id)}
              onToggle={() => controller.toggleEntry(entry.id)}
              entryProps={entryProps}
            />
          ))
        )}
      </div>
    </div>
  );
  if (controller.mode === 'overlay') {
    return (
      <div className="bh-channel-sidebar-overlay-layer">
        <div
          className="bh-channel-sidebar-backdrop"
          aria-hidden="true"
          onClick={controller.close}
        />
        {panel}
      </div>
    );
  }
  return panel;
}
