import {
  MAX_ACTIVITY_TRACE_ENTRIES,
  type PersonaBotActivityTraceEntry,
} from '../../../core/src/state/tool-activity.js';
import { parsePublicToolActivity } from './activity-detail.js';
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
      const activity =
        bot['activity'] === undefined ? undefined : parsePublicToolActivity(bot['activity']);
      if (bot['activity'] !== undefined && (activity === undefined || state !== 'working'))
        return undefined;
      let trace: PersonaBotActivityTraceEntry[] | undefined;
      if (bot['trace'] !== undefined) {
        if (
          state === 'idle' ||
          !Array.isArray(bot['trace']) ||
          bot['trace'].length === 0 ||
          bot['trace'].length > MAX_ACTIVITY_TRACE_ENTRIES
        )
          return undefined;
        trace = [];
        let revision = -1;
        for (const entry of bot['trace']) {
          if (typeof entry !== 'object' || entry === null) return undefined;
          const traceState = PERSONA_BOT_ACTIVITY_STATES.find(
            (candidate) => candidate === entry.state,
          );
          const detail =
            entry.activity === undefined ? undefined : parsePublicToolActivity(entry.activity);
          if (
            traceState === undefined ||
            traceState === 'idle' ||
            !Number.isSafeInteger(entry.revision) ||
            entry.revision <= revision ||
            entry.revision > item['revision'] ||
            !Number.isSafeInteger(entry.at) ||
            entry.at < 0 ||
            entry.at > 8_640_000_000_000_000 ||
            (entry.activity !== undefined && (detail === undefined || traceState !== 'working'))
          )
            return undefined;
          revision = entry.revision;
          trace.push({
            revision,
            at: entry.at,
            state: traceState,
            ...(detail === undefined ? {} : { activity: detail }),
          });
        }
      }
      bots.push({
        slug: bot['slug'],
        state,
        ...(activity === undefined ? {} : { activity }),
        ...(trace === undefined ? {} : { trace }),
      });
    }
    return { generation: item['generation'], revision: item['revision'], bots };
  } catch {
    return undefined;
  }
}

export function mountActivityLive(
  store: ClientStore,
  makeSource: (url: string) => EventSource | undefined = (url) =>
    typeof EventSource === 'undefined' ? undefined : new EventSource(url),
  readSnapshot: (signal: AbortSignal) => Promise<unknown> = async () => undefined,
): () => void {
  let source: EventSource | undefined;
  let disposed = false;
  let active = false;
  let healthy = false;
  let latest: PersonaBotActivitySnapshot | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  const apply = (snapshot: PersonaBotActivitySnapshot): void => {
    if (latest?.generation === snapshot.generation && snapshot.revision <= latest.revision) return;
    latest = snapshot;
    store.applyActivity(snapshot);
  };
  const clearTimer = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const refresh = (): void => {
    if (!active || controller !== undefined) return;
    const next = new AbortController();
    controller = next;
    const generation = latest?.generation;
    deadline = setTimeout(() => {
      next.abort();
      if (controller !== next) return;
      controller = undefined;
      deadline = undefined;
      if (active && !healthy) schedule();
    }, 5_000);
    void readSnapshot(next.signal)
      .then((value) => {
        if (!active || next.signal.aborted || controller !== next) return;
        const snapshot = parseActivitySnapshot(JSON.stringify(value));
        if (snapshot === undefined) return;
        if (latest?.generation !== generation && snapshot.generation !== latest?.generation) return;
        apply(snapshot);
      })
      .catch(() => undefined)
      .finally(() => {
        if (controller !== next) return;
        if (deadline !== undefined) clearTimeout(deadline);
        deadline = undefined;
        controller = undefined;
        if (active && !healthy) schedule();
      });
  };
  const schedule = (): void => {
    if (timer !== undefined || !active) return;
    timer = setTimeout(() => {
      timer = undefined;
      connect();
      refresh();
    }, 10_000);
  };
  const connect = (): void => {
    if (source !== undefined) return;
    let next: EventSource | undefined;
    try {
      next = makeSource('/api/botharness/stream?scope=activity');
    } catch {
      schedule();
      return;
    }
    if (next === undefined) {
      schedule();
      return;
    }
    source = next;
    next.addEventListener('activity/snapshot', (event) => {
      if (!active || source !== next || !(event instanceof MessageEvent)) return;
      const snapshot = parseActivitySnapshot(event.data as string);
      if (snapshot === undefined) return;
      const gap =
        latest?.generation === snapshot.generation && snapshot.revision > latest.revision + 1;
      healthy = true;
      clearTimer();
      apply(snapshot);
      if (gap) refresh();
    });
    next.addEventListener('error', () => {
      if (!active || source !== next) return;
      healthy = false;
      if (next.readyState === 2) {
        next.close();
        source = undefined;
      }
      schedule();
    });
  };
  const sync = (): void => {
    const visible = typeof document === 'undefined' || document.visibilityState !== 'hidden';
    const enabled = !disposed && store.getSnapshot().mode === 'bot' && visible;
    if (enabled === active) return;
    active = enabled;
    if (!active) {
      source?.close();
      source = undefined;
      healthy = false;
      clearTimer();
      controller?.abort();
      controller = undefined;
      if (deadline !== undefined) clearTimeout(deadline);
      deadline = undefined;
      return;
    }
    connect();
    refresh();
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
