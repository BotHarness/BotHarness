const listeners = new Set<() => void>();
let source: EventSource | undefined;
const notify = () => {
  for (const listener of [...listeners]) listener();
};
export function subscribeMessagingDefaults(listener: () => void): () => void {
  listeners.add(listener);
  if (!source && typeof EventSource !== 'undefined') {
    source = new EventSource('/api/botharness/stream?scope=roster');
    source.addEventListener('roster/changed', notify);
    source.addEventListener('open', notify);
  }
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      source?.close();
      source = undefined;
    }
  };
}
