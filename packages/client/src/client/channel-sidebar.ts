import type { ComponentType } from 'react';

import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ClientState } from './store.js';
import type { MemoryWorkingChange } from './bridge.js';

export type ChannelSidebarScope = 'channel' | 'personabot';

export interface ChannelSidebarEntryProps {
  scope: ChannelSidebarScope;
  channelId: string;
  conversationRevision?: number;
  refreshRevision?: number;
  requestRefresh?: () => void;
  botSlug: string | undefined;
  actions: BridgeActions;
  onMemoryCommitSelect?: ((sha: string) => void) | undefined;
  selectedMemoryCommitSha?: string | undefined;
  onMemoryFileSelect?: ((path: string) => void) | undefined;
  selectedMemoryFilePath?: string | undefined;
  onMemoryWorkingSelect?: ((change: MemoryWorkingChange) => void) | undefined;
  selectedMemoryWorking?: MemoryWorkingChange | undefined;
  expanded?: boolean;
  setExpanded?: (expanded: boolean) => void;
  setExpandable?: (expandable: boolean) => void;
  t: BotHarnessTranslate;
}

export interface ChannelSidebarSettingsProps extends ChannelSidebarEntryProps {
  onClose(): void;
  onPreview?: (() => void) | undefined;
}

export interface ChannelSidebarEntry {
  id: string;
  label: string;
  icon?: string;
  settings?: ComponentType<ChannelSidebarSettingsProps>;
  order?: number;
  scope: ChannelSidebarScope;
  component: ComponentType<ChannelSidebarEntryProps>;
  headerAction?: ComponentType<ChannelSidebarEntryProps>;
  badge?: ComponentType<ChannelSidebarEntryProps>;
  visible?: (state: ClientState) => boolean;
}

export interface ChannelSidebarRegistry {
  register(entry: ChannelSidebarEntry): () => void;
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
