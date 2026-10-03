import type { MemoryGitGraph, MemorySnapshot, MemoryWorkingChange } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';

type MemoryFile = { path: string; body: string; head: string; binary?: boolean };
export interface MemoryReadCache {
  key: number;
  snapshot: MemorySnapshot | undefined;
  graph: MemoryGitGraph | undefined;
  working: MemoryWorkingChange[] | undefined;
  snapshotError: string | undefined;
  graphError: string | undefined;
  workingError: string | undefined;
  files: Map<string, MemoryFile>;
}
const memoryCaches = new WeakMap<
  ChannelSidebarEntryProps['actions'],
  Map<string, MemoryReadCache>
>();
let nextKey = 0;
export function cachedMemory(
  actions: ChannelSidebarEntryProps['actions'],
  channelId: string,
): MemoryReadCache {
  let channels = memoryCaches.get(actions);
  if (channels === undefined) {
    channels = new Map();
    memoryCaches.set(actions, channels);
  }
  let cache = channels.get(channelId);
  if (cache === undefined) {
    cache = {
      key: ++nextKey,
      snapshot: undefined,
      graph: undefined,
      working: undefined,
      snapshotError: undefined,
      graphError: undefined,
      workingError: undefined,
      files: new Map(),
    };
    channels.set(channelId, cache);
    if (channels.size > 30) channels.delete(channels.keys().next().value!);
  }
  return cache;
}
