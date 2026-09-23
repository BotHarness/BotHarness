import { loadActivitySnapshot, type BridgeCall } from './bridge.js';
import type { ClientStore } from './store.js';

export const ACTIVITY_POLL_INTERVAL_MS = 1500;

/**
 * Poll only while Bot mode is visible. The Host's SessionEvent Projection is
 * the sole activity authority; one accepted snapshot updates every avatar
 * surface through the shared Client store.
 */
export function mountActivityPolling(
  store: ClientStore,
  call: BridgeCall,
  intervalMs = ACTIVITY_POLL_INTERVAL_MS,
): () => void {
  let timer: ReturnType<typeof setInterval> | undefined;
  let controller: AbortController | undefined;
  let inFlight: AbortController | undefined;
  let warned = false;

  const refresh = async (active: AbortController): Promise<void> => {
    if (inFlight === active) return;
    inFlight = active;
    try {
      const snapshot = await loadActivitySnapshot(call, active.signal);
      if (!active.signal.aborted && controller === active) {
        warned = false;
        store.setActivitySnapshot(snapshot);
      }
    } catch (error) {
      if (!active.signal.aborted && controller === active && !warned) {
        warned = true;
        console.warn('botharness: activity snapshot refresh failed', error);
      }
    } finally {
      if (inFlight === active) inFlight = undefined;
    }
  };

  const sync = (): void => {
    const snapshot = store.getSnapshot();
    const visible = snapshot.mode === 'bot' && snapshot.status === 'ready';
    if (visible && controller === undefined) {
      const active = new AbortController();
      controller = active;
      timer = setInterval(() => void refresh(active), intervalMs);
      void refresh(active);
    } else if (!visible && controller !== undefined) {
      controller.abort();
      controller = undefined;
      if (timer !== undefined) clearInterval(timer);
      timer = undefined;
    }
  };

  const unsubscribe = store.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    controller?.abort();
    controller = undefined;
    if (timer !== undefined) clearInterval(timer);
  };
}
