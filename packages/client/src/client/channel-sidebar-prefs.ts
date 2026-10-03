import type { ChannelSidebarScope } from './channel-sidebar.js';
import { defaultStorage, type ConfigStorage } from './roster-config.js';

const STORAGE_KEY = 'botharness.channel-sidebar';

export const DEFAULT_CHANNEL_SIDEBAR_WIDTH = 320;
export const MIN_CHANNEL_SIDEBAR_WIDTH = 260;
export const MAX_CHANNEL_SIDEBAR_WIDTH = 560;
export type MemoryTerminology = 'memory' | 'git';

export function clampChannelSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return DEFAULT_CHANNEL_SIDEBAR_WIDTH;
  return Math.min(
    MAX_CHANNEL_SIDEBAR_WIDTH,
    Math.max(MIN_CHANNEL_SIDEBAR_WIDTH, Math.round(width)),
  );
}

export interface ChannelSidebarPrefsSnapshot {
  collapsedSidebars: readonly string[];
  expandedEntries: readonly string[];
  width: number;
  memoryTerminology: MemoryTerminology;
  entryOrders: Readonly<Record<ChannelSidebarScope, readonly string[]>>;
}

export interface ChannelSidebarPrefs {
  getSnapshot(): ChannelSidebarPrefsSnapshot;
  subscribe(listener: () => void): () => void;
  isSidebarCollapsed(scopeKey: string): boolean;
  setSidebarCollapsed(scopeKey: string, collapsed: boolean): void;
  isEntryExpanded(scopeKey: string, entryId: string): boolean;
  setEntryExpanded(scopeKey: string, entryId: string, expanded: boolean): void;
  setEntryOrder(scope: ChannelSidebarScope, ids: readonly string[]): void;
  setWidth(width: number): void;
  setMemoryTerminology(terminology: MemoryTerminology): void;
}

const EMPTY: ChannelSidebarPrefsSnapshot = Object.freeze({
  collapsedSidebars: Object.freeze([]),
  expandedEntries: Object.freeze([]),
  width: DEFAULT_CHANNEL_SIDEBAR_WIDTH,
  memoryTerminology: 'memory',
  entryOrders: Object.freeze({ personabot: Object.freeze([]), channel: Object.freeze([]) }),
});

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

export function channelSidebarScopeKey(
  scope: 'channel' | 'personabot',
  channelId: string,
  botSlug: string | undefined,
): string {
  return scope === 'personabot' ? `personabot:${botSlug ?? channelId}` : `channel:${channelId}`;
}

function entryKey(scopeKey: string, entryId: string): string {
  return `${scopeKey}/${entryId}`;
}

export function createChannelSidebarPrefs(storage: ConfigStorage | undefined): ChannelSidebarPrefs {
  let snapshot = EMPTY;
  const listeners = new Set<() => void>();

  const read = (): ChannelSidebarPrefsSnapshot => {
    if (storage === undefined) return EMPTY;
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw === null) return EMPTY;
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const width = parsed['width'];
      const memoryTerminology = parsed['memoryTerminology'];
      const orders = parsed['entryOrders'];
      const entryOrders =
        orders !== null && typeof orders === 'object' ? (orders as Record<string, unknown>) : {};
      const order = (scope: ChannelSidebarScope) =>
        Object.freeze(
          [
            ...new Set(
              stringList(entryOrders[scope]).filter((id) => id.length > 0 && id.length <= 200),
            ),
          ].slice(0, 200),
        );
      return {
        collapsedSidebars: Object.freeze(stringList(parsed['collapsedSidebars'])),
        expandedEntries: Object.freeze(stringList(parsed['expandedEntries'])),
        width:
          typeof width === 'number'
            ? clampChannelSidebarWidth(width)
            : DEFAULT_CHANNEL_SIDEBAR_WIDTH,
        memoryTerminology: memoryTerminology === 'git' ? 'git' : 'memory',
        entryOrders: Object.freeze({ personabot: order('personabot'), channel: order('channel') }),
      };
    } catch {
      return EMPTY;
    }
  };

  const publish = (next: ChannelSidebarPrefsSnapshot): void => {
    snapshot = next;
    if (storage !== undefined) {
      try {
        storage.setItem(
          STORAGE_KEY,
          JSON.stringify({
            collapsedSidebars: next.collapsedSidebars,
            expandedEntries: next.expandedEntries,
            width: next.width,
            memoryTerminology: next.memoryTerminology,
            entryOrders: next.entryOrders,
          }),
        );
      } catch {}
    }
    for (const listener of listeners) listener();
  };

  const toggleIn = (list: readonly string[], key: string, present: boolean): readonly string[] => {
    const next = new Set(list);
    if (present) next.add(key);
    else next.delete(key);
    return Object.freeze([...next]);
  };

  snapshot = read();

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    isSidebarCollapsed: (scopeKey) => snapshot.collapsedSidebars.includes(scopeKey),
    setSidebarCollapsed(scopeKey, collapsed) {
      const current = snapshot.collapsedSidebars.includes(scopeKey);
      if (current === collapsed) return;
      publish({
        ...snapshot,
        collapsedSidebars: toggleIn(snapshot.collapsedSidebars, scopeKey, collapsed),
      });
    },
    isEntryExpanded: (scopeKey, id) => snapshot.expandedEntries.includes(entryKey(scopeKey, id)),
    setEntryExpanded(scopeKey, id, expanded) {
      const key = entryKey(scopeKey, id);
      const current = snapshot.expandedEntries.includes(key);
      if (current === expanded) return;
      publish({
        ...snapshot,
        expandedEntries: toggleIn(snapshot.expandedEntries, key, expanded),
      });
    },
    setEntryOrder(scope, ids) {
      const next = Object.freeze(
        [...new Set(ids)].filter((id) => id.length > 0 && id.length <= 200).slice(0, 200),
      );
      if (
        next.length === snapshot.entryOrders[scope].length &&
        next.every((id, index) => id === snapshot.entryOrders[scope][index])
      )
        return;
      publish({
        ...snapshot,
        entryOrders: Object.freeze({ ...snapshot.entryOrders, [scope]: next }),
      });
    },
    setWidth(width) {
      const next = clampChannelSidebarWidth(width);
      if (next === snapshot.width) return;
      publish({ ...snapshot, width: next });
    },
    setMemoryTerminology(terminology) {
      if (snapshot.memoryTerminology === terminology) return;
      publish({ ...snapshot, memoryTerminology: terminology });
    },
  };
}

export const channelSidebarPrefs = createChannelSidebarPrefs(defaultStorage());
