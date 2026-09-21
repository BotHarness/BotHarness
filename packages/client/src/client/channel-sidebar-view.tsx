import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from 'react';

import { IconChevronDownOutline14 } from '@deepseek-ai/dsh-client-ui-primitives';

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
  type ChannelSidebarPrefs,
} from './channel-sidebar-prefs.js';
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
          <IconChevronDownOutline14 size={14} />
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
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  controller: ChannelSidebarController;
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
  };
  const panel = (
    <div
      id="bh-channel-sidebar"
      className={`bh-channel-sidebar${controller.mode === 'overlay' ? ' bh-channel-sidebar-overlay' : ''}`}
      role="complementary"
      aria-label="Channel sidebar"
    >
      <div className="bh-channel-sidebar-head">
        <span className="bh-channel-sidebar-title">{channel.name}</span>
      </div>
      <div className="bh-channel-sidebar-entries">
        {entries.length === 0 ? (
          <div className="bh-note">还没有可显示的面板。</div>
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
