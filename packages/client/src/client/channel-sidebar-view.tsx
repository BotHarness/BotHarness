import {
  useCallback,
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
import { useMountedResource } from './mounted-resource.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { moveEntry, resolveEntryOrder } from './channel-sidebar-order.js';
import { ChannelSidebarSettings } from './channel-sidebar-settings.js';

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

export interface ChannelSidebarController {
  mode: ChannelSidebarMode;
  narrow: boolean;
  scopeKey: string | undefined;
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
  const selection = state.selection;
  const scopeKey =
    selection?.kind === 'bot'
      ? channelSidebarScopeKey('personabot', selection.slug, selection.slug)
      : selection?.kind === 'channel'
        ? channelSidebarScopeKey('channel', selection.channelId, undefined)
        : undefined;
  const [overlay, setOverlay] = useState({ scopeKey, open: false });
  if (overlay.scopeKey !== scopeKey) setOverlay({ scopeKey, open: false });
  const overlayOpen = overlay.scopeKey === scopeKey && overlay.open;
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const docked = scopeKey !== undefined && !snapshot.collapsedSidebars.includes(scopeKey);

  const close = useCallback(() => {
    if (narrow) {
      setOverlay({ scopeKey, open: false });
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
        setOverlay({ scopeKey, open: !overlayOpen });
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
  editing = false,
  preview,
}: {
  preview?: boolean | undefined;
  editing?: boolean;
  entry: ChannelSidebarEntry;
  expanded: boolean;
  onToggle(): void;
  entryProps: ChannelSidebarEntryProps;
}): ReactElement {
  const bodyId = useId();
  const Badge = entry.badge;
  const HeaderAction = entry.headerAction;
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [expandable, setExpandable] = useState(true);
  const expandableRef = useRef(expandable);
  const shown = (preview ?? expanded) && !editing && expandable;
  const props = {
    ...entryProps,
    refreshRevision,
    requestRefresh: () => setRefreshRevision((value) => value + 1),
    expanded: shown,
    setExpanded: (next: boolean) => {
      if (next === expanded || (editing && next)) return;
      if (next && !expandableRef.current) return;
      onToggle();
    },
    setExpandable: (next: boolean) => {
      expandableRef.current = next;
      setExpandable(next);
      if (!next && expanded) onToggle();
    },
  };
  return (
    <section className="bh-channel-sidebar-entry">
      <div className="bh-channel-sidebar-entry-header">
        <button
          type="button"
          className="bh-channel-sidebar-entry-head"
          aria-expanded={shown}
          aria-controls={bodyId}
          aria-disabled={expandable ? undefined : true}
          disabled={!expandable || editing || preview !== undefined}
          style={expandable ? undefined : { cursor: 'default', opacity: 0.6 }}
          onClick={expandable ? onToggle : undefined}
        >
          <span
            className={`bh-channel-sidebar-entry-chevron${shown ? '' : ' bh-chevron-collapsed'}`}
            aria-hidden="true"
          >
            <IconChevronDownOutlineRegular size={14} />
          </span>
          <span className="bh-channel-sidebar-entry-icon" aria-hidden="true">
            <ChannelSidebarIcon name={entry.icon} />
          </span>
          <span className="bh-channel-sidebar-entry-label">{entry.label}</span>
          {Badge === undefined ? null : (
            <span className="bh-channel-sidebar-entry-badge">
              <Badge {...props} />
            </span>
          )}
        </button>
        {HeaderAction === undefined ? null : (
          <span className="bh-channel-sidebar-entry-action-slot">
            <HeaderAction {...props} />
          </span>
        )}
      </div>
      {shown ? (
        <div id={bodyId} className="bh-channel-sidebar-entry-body">
          <entry.component {...props} />
        </div>
      ) : null}
    </section>
  );
}

export function ChannelSidebarContents({
  entries,
  registered = entries,
  entryProps,
  controller,
  prefs = channelSidebarPrefs,
}: {
  entries: readonly ChannelSidebarEntry[];
  registered?: readonly ChannelSidebarEntry[];
  entryProps: ChannelSidebarEntryProps;
  controller: Pick<ChannelSidebarController, 'isEntryExpanded' | 'toggleEntry'>;
  prefs?: ChannelSidebarPrefs;
}): ReactElement {
  const snapshot = useSyncExternalStore(prefs.subscribe, prefs.getSnapshot, prefs.getSnapshot);
  const [draft, setDraft] = useState<readonly string[] | undefined>();
  const [announcement, setAnnouncement] = useState('');
  const [previewEntry, setPreviewEntry] = useState<string | undefined>();
  const preview = entries.some((entry) => entry.id === previewEntry) ? previewEntry : undefined;
  const drag = useRef<string | undefined>(undefined);
  const rows = useRef<HTMLDivElement>(null);
  const editing = draft !== undefined;
  const order = resolveEntryOrder(
    registered.map((entry) => entry.id),
    draft ?? snapshot.entryOrders[entryProps.scope],
  );
  const visible = order.flatMap((id) => entries.filter((entry) => entry.id === id));
  const move = (id: string, target: string): void => {
    setDraft(moveEntry(order, id, target));
    const next = moveEntry(
      visible.map((entry) => entry.id),
      id,
      target,
    );
    const entry = entries.find((entry) => entry.id === id);
    setAnnouncement(
      entryProps.t('sidebar.order.position', {
        label: entry?.label ?? id,
        position: String(next.indexOf(id) + 1),
        total: String(visible.length),
      }),
    );
    requestAnimationFrame(() => {
      const handles = rows.current?.querySelectorAll<HTMLButtonElement>('[data-order-handle]');
      for (const handle of handles ?? []) if (handle.dataset['orderHandle'] === id) handle.focus();
    });
  };
  const finish = (save: boolean): void => {
    if (save && draft !== undefined) prefs.setEntryOrder(entryProps.scope, order);
    setDraft(undefined);
    drag.current = undefined;
    setAnnouncement('');
  };
  return (
    <>
      <div className="bh-channel-sidebar-head">
        <ChannelSidebarSettings
          entries={entries}
          entryProps={entryProps}
          editing={editing}
          onPreview={setPreviewEntry}
          onEdit={() => setDraft(order)}
        />
      </div>
      <div
        className={`bh-channel-sidebar-entries${editing ? ' bh-sidebar-editing' : ''}`}
        ref={rows}
      >
        {editing ? (
          <div className="bh-sidebar-order-toolbar">
            <div className="bh-sidebar-order-hint">{entryProps.t('sidebar.order.hint')}</div>
            <div className="bh-sidebar-order-actions">
              <button type="button" onClick={() => finish(true)}>
                {entryProps.t('sidebar.order.done')}
              </button>
              <button type="button" onClick={() => finish(false)}>
                {entryProps.t('sidebar.order.cancel')}
              </button>
              <button type="button" onClick={() => setDraft(registered.map((entry) => entry.id))}>
                {entryProps.t('sidebar.order.reset')}
              </button>
            </div>
          </div>
        ) : null}
        <span className="bh-sidebar-order-announcement" role="status" aria-live="polite">
          {announcement}
        </span>
        {visible.length === 0 ? (
          <div className="bh-note">{entryProps.t('sidebar.empty')}</div>
        ) : (
          visible.map((entry, index) => (
            <div
              className="bh-sidebar-order-row"
              data-entry-id={entry.id}
              key={entry.id}
              onDragOver={(event) => {
                if (editing && drag.current !== undefined) event.preventDefault();
              }}
              onDrop={(event) => {
                if (!editing || drag.current === undefined) return;
                event.preventDefault();
                move(drag.current, entry.id);
                drag.current = undefined;
              }}
            >
              {editing ? (
                <button
                  type="button"
                  className="bh-sidebar-order-handle"
                  data-order-handle={entry.id}
                  draggable
                  aria-label={entryProps.t('sidebar.order.move', { label: entry.label })}
                  onDragStart={(event) => {
                    drag.current = entry.id;
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', entry.id);
                  }}
                  onDragEnd={() => {
                    drag.current = undefined;
                  }}
                  onKeyDown={(event) => {
                    const target =
                      event.key === 'ArrowUp'
                        ? index - 1
                        : event.key === 'ArrowDown'
                          ? index + 1
                          : event.key === 'Home'
                            ? 0
                            : event.key === 'End'
                              ? visible.length - 1
                              : undefined;
                    if (target === undefined) return;
                    event.preventDefault();
                    const next = visible[target];
                    if (next !== undefined) move(entry.id, next.id);
                  }}
                >
                  <ChannelSidebarIcon name="grip-vertical" />
                </button>
              ) : null}
              <ChannelSidebarEntrySection
                entry={entry}
                expanded={controller.isEntryExpanded(entry.id)}
                onToggle={() => controller.toggleEntry(entry.id)}
                entryProps={entryProps}
                editing={editing}
                preview={preview === undefined ? undefined : preview === entry.id}
              />
            </div>
          ))
        )}
      </div>
    </>
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
  onMemoryFileSelect,
  selectedMemoryFilePath,
  onMemoryWorkingSelect,
  selectedMemoryWorking,
}: {
  registry: ChannelSidebarRegistry;
  state: ClientState;
  actions: BridgeActions;
  controller: ChannelSidebarController;
  t: BotHarnessTranslate;
  onMemoryCommitSelect?: ((sha: string) => void) | undefined;
  selectedMemoryCommitSha?: string | undefined;
  onMemoryFileSelect?: ((path: string) => void) | undefined;
  selectedMemoryFilePath?: string | undefined;
  onMemoryWorkingSelect?: ((change: import('./bridge.js').MemoryWorkingChange) => void) | undefined;
  selectedMemoryWorking?: import('./bridge.js').MemoryWorkingChange | undefined;
}): ReactElement | null {
  const selection = state.selection;
  const channel =
    state.conversation.channel ??
    (selection?.kind === 'channel'
      ? state.channels.find((candidate) => candidate.id === selection.channelId)
      : selection?.kind === 'bot'
        ? state.channels.find(
            (candidate) => candidate.type === 'dm' && candidate.botSlug === selection.slug,
          )
        : undefined);
  const scope: ChannelSidebarScope = selection?.kind === 'bot' ? 'personabot' : 'channel';
  const entries = useSyncExternalStore(
    registry.subscribe,
    () => registry.entries(scope),
    () => registry.entries(scope),
  );
  const selectedBotSlug = selection?.kind === 'bot' ? selection.slug : undefined;
  const inboxMount = useMountedResource<HTMLDivElement>(() => {
    if (selectedBotSlug === undefined) return;
    const timer = window.setInterval(() => void actions.refreshBotInbox(selectedBotSlug), 10_000);
    return () => window.clearInterval(timer);
  }, [selectedBotSlug, actions]);
  const closeRef = useRef(controller);
  closeRef.current = controller;
  const overlayMount = useMountedResource<HTMLDivElement>(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !event.defaultPrevented) closeRef.current.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [controller.mode]);

  if (controller.scopeKey === undefined || controller.mode === 'hidden') {
    return null;
  }
  const entryProps: ChannelSidebarEntryProps | undefined =
    channel === undefined
      ? undefined
      : {
          scope,
          channelId: channel.id,
          conversationRevision: state.conversation.revision,
          botSlug: selection?.kind === 'bot' ? selection.slug : undefined,
          actions,
          t,
          onMemoryCommitSelect,
          selectedMemoryCommitSha,
          onMemoryFileSelect,
          selectedMemoryFilePath,
          onMemoryWorkingSelect,
          selectedMemoryWorking,
        };
  const visibleEntries =
    entryProps === undefined ? [] : entries.filter((entry) => entry.visible?.(state) ?? true);
  const dockedWidth = clampChannelSidebarWidth(controller.width);
  const panel = (
    <div
      id="bh-channel-sidebar"
      ref={inboxMount}
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
      {entryProps === undefined ? null : (
        <ChannelSidebarContents
          key={controller.scopeKey}
          entries={visibleEntries}
          registered={entries}
          entryProps={entryProps}
          controller={controller}
        />
      )}
    </div>
  );
  if (controller.mode === 'overlay') {
    return (
      <div ref={overlayMount} className="bh-channel-sidebar-overlay-layer">
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
