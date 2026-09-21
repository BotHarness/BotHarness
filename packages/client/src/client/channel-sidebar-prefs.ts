import { defaultStorage, type ConfigStorage } from './roster-config.js';

const STORAGE_KEY = 'botharness.channel-sidebar';

/**
 * Per-scope presentation preferences for the Channel sidebar. Expanded and
 * collapsed state is client-local, exactly like the left roster's section
 * collapse; it never enters Host authority.
 */
export interface ChannelSidebarPrefsSnapshot {
  /** Scope keys whose whole sidebar is collapsed. */
  collapsedSidebars: readonly string[];
  /** `scopeKey/entryId` keys expanded by the Human. */
  expandedEntries: readonly string[];
}

export interface ChannelSidebarPrefs {
  getSnapshot(): ChannelSidebarPrefsSnapshot;
  subscribe(listener: () => void): () => void;
  isSidebarCollapsed(scopeKey: string): boolean;
  setSidebarCollapsed(scopeKey: string, collapsed: boolean): void;
  isEntryExpanded(scopeKey: string, entryId: string): boolean;
  setEntryExpanded(scopeKey: string, entryId: string, expanded: boolean): void;
}

const EMPTY: ChannelSidebarPrefsSnapshot = Object.freeze({
  collapsedSidebars: Object.freeze([]),
  expandedEntries: Object.freeze([]),
});

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

/** Stable key for one selection: a PersonaBot DM or a group Channel. */
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
      return {
        collapsedSidebars: Object.freeze(stringList(parsed['collapsedSidebars'])),
        expandedEntries: Object.freeze(stringList(parsed['expandedEntries'])),
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
          }),
        );
      } catch {
        // A full or blocked storage still leaves this session's state live.
      }
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
  };
}

/** Client-local singleton; tests construct their own instance with a fake storage. */
export const channelSidebarPrefs = createChannelSidebarPrefs(defaultStorage());
