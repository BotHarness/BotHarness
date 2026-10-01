import { PERSONA_BOT_ACTIVITY_STATES } from './avatar.js';
import type { ClientStore, PersonaBotActivitySnapshot } from './store.js';

export function parseActivitySnapshot(data: string): PersonaBotActivitySnapshot | undefined {
  try {
    const value: unknown = JSON.parse(data);
    if (typeof value !== 'object' || value === null) return undefined;
    const item = value as Record<string, unknown>;
    if (
      typeof item['generation'] !== 'string' ||
      item['generation'].length === 0 ||
      typeof item['revision'] !== 'number' ||
      !Number.isSafeInteger(item['revision']) ||
      item['revision'] < 0 ||
      !Array.isArray(item['bots'])
    )
      return undefined;
    const bots: PersonaBotActivitySnapshot['bots'] = [];
    const slugs = new Set<string>();
    for (const value of item['bots']) {
      if (typeof value !== 'object' || value === null) return undefined;
      const bot = value as Record<string, unknown>;
      const state = PERSONA_BOT_ACTIVITY_STATES.find((candidate) => candidate === bot['state']);
      if (
        typeof bot['slug'] !== 'string' ||
        bot['slug'].length === 0 ||
        slugs.has(bot['slug']) ||
        state === undefined
      )
        return undefined;
      slugs.add(bot['slug']);
      bots.push({ slug: bot['slug'], state });
    }
    return { generation: item['generation'], revision: item['revision'], bots };
  } catch {
    return undefined;
  }
}

export function mountActivityLive(
  store: ClientStore,
  makeSource: (url: string) => EventSource = (url) => new EventSource(url),
): () => void {
  let source: EventSource | undefined;
  let disposed = false;
  const sync = (): void => {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    if (disposed || store.getSnapshot().mode !== 'bot' || !visible) {
      source?.close();
      source = undefined;
      return;
    }
    if (source !== undefined) return;
    const next = makeSource('/api/botharness/stream?scope=activity');
    source = next;
    next.addEventListener('activity/snapshot', (event) => {
      if (disposed || source !== next || !(event instanceof MessageEvent)) return;
      const snapshot = parseActivitySnapshot(event.data as string);
      if (snapshot !== undefined) store.applyActivity(snapshot);
    });
  };
  const unsubscribe = store.subscribe(sync);
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', sync);
  sync();
  return () => {
    disposed = true;
    unsubscribe();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', sync);
    sync();
  };
}
