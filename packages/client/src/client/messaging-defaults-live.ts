import type { PurgedPlacement } from '../../../core/src/purge/contracts.js';
import { parseContentRedactions } from './content-redactions.js';

const listeners = new Set<() => void>();
const purgeListeners = new Set<(placements: PurgedPlacement[]) => void>();
const redactions = new Map<string, PurgedPlacement>();
let source: EventSource | undefined;
const notify = () => {
  for (const listener of [...listeners]) listener();
};
export function subscribeMessagingDefaults(
  listener: () => void,
  onPurge?: (placements: PurgedPlacement[]) => void,
): () => void {
  listeners.add(listener);
  if (onPurge) {
    purgeListeners.add(onPurge);
    queueMicrotask(() => {
      if (!purgeListeners.has(onPurge)) return;
      const values = [...redactions.values()];
      for (let offset = 0; offset < values.length; offset += 100)
        onPurge(values.slice(offset, offset + 100));
    });
  }
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/botharness/stream?scope=roster');
    source.addEventListener('roster/changed', notify);
    source.addEventListener('open', notify);
    source.addEventListener('content/purged', (event) => {
      const placements = parseContentRedactions(event);
      for (const placement of placements)
        redactions.set(JSON.stringify([placement.channelId, placement.messageId]), placement);
      for (const callback of [...purgeListeners]) callback(placements);
    });
  }
  return () => {
    listeners.delete(listener);
    if (onPurge) purgeListeners.delete(onPurge);
    if (!listeners.size) {
      source?.close();
      source = undefined;
      redactions.clear();
    }
  };
}
