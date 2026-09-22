import type { ComponentType } from 'react';

import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';

/** Which selection a Channel sidebar entry belongs to. */
export type ChannelSidebarScope = 'channel' | 'personabot';

/** Context the shell passes to every entry it renders. */
export interface ChannelSidebarEntryProps {
  scope: ChannelSidebarScope;
  channelId: string;
  botSlug: string | undefined;
  actions: BridgeActions;
  /** Locale-bound translate of the BotHarness namespace. */
  t: BotHarnessTranslate;
}

/**
 * One Channel sidebar entry: a collapsible, ordered item that may display
 * information, offer controls, or both. Registered through
 * {@link ChannelSidebarRegistry}; the shell never imports an entry.
 */
export interface ChannelSidebarEntry {
  /** Stable identity; registering the same id twice is an error. */
  id: string;
  label: string;
  /** Ascending order; ties fall back to the id so ordering is deterministic. */
  order?: number;
  scope: ChannelSidebarScope;
  component: ComponentType<ChannelSidebarEntryProps>;
  /** Optional short status rendered beside the label (counts, state). */
  badge?: ComponentType<ChannelSidebarEntryProps>;
}

/** Ordered, disposable registry the Channel sidebar shell renders from. */
export interface ChannelSidebarRegistry {
  register(entry: ChannelSidebarEntry): () => void;
  /** Entries for one scope, ordered and reference-stable between changes. */
  entries(scope: ChannelSidebarScope): readonly ChannelSidebarEntry[];
  subscribe(listener: () => void): () => void;
}

function compareEntries(left: ChannelSidebarEntry, right: ChannelSidebarEntry): number {
  return (left.order ?? 0) - (right.order ?? 0) || left.id.localeCompare(right.id);
}

export function createChannelSidebarRegistry(): ChannelSidebarRegistry {
  const entries = new Map<string, ChannelSidebarEntry>();
  const listeners = new Set<() => void>();
  const scoped = new Map<ChannelSidebarScope, readonly ChannelSidebarEntry[]>([
    ['channel', []],
    ['personabot', []],
  ]);

  const rebuild = (): void => {
    const ordered = [...entries.values()].sort(compareEntries);
    scoped.set(
      'channel',
      ordered.filter((entry) => entry.scope === 'channel'),
    );
    scoped.set(
      'personabot',
      ordered.filter((entry) => entry.scope === 'personabot'),
    );
    for (const listener of listeners) listener();
  };

  return {
    register(entry) {
      if (entries.has(entry.id)) {
        throw new Error(`duplicate Channel sidebar entry: ${entry.id}`);
      }
      entries.set(entry.id, entry);
      rebuild();
      return () => {
        if (entries.get(entry.id) !== entry) return;
        entries.delete(entry.id);
        rebuild();
      };
    },
    entries(scope) {
      return scoped.get(scope) ?? [];
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
