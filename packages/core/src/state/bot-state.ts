import { randomUUID } from 'node:crypto';
import {
  aggregateToolActivity,
  MAX_ACTIVITY_TRACE_ENTRIES,
  type PersonaBotActivityTraceEntry,
  isPublicToolDetail,
  type PersonaBotToolActivity,
} from './tool-activity.js';

export type SessionState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'done';

export type AggregatedState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

export { MAX_ACTIVITY_TRACE_ENTRIES } from './tool-activity.js';
export type { PersonaBotActivityTraceEntry } from './tool-activity.js';

export interface BotStateSnapshot {
  slug: string;
  state: AggregatedState;
  sessions: Record<string, SessionState>;
}

export type BotStateEvent =
  | {
      type: 'aggregate-changed';
      slug: string;
      state: AggregatedState;
      previous: AggregatedState;
      snapshot: BotStateSnapshot;
    }
  | {
      type: 'session-changed';
      slug: string;
      sessionId: string;
      state: SessionState;
      snapshot: BotStateSnapshot;
    }
  | { type: 'session-removed'; slug: string; sessionId: string; snapshot: BotStateSnapshot };

export interface BotStateTracker {
  setSessionState(
    slug: string,
    sessionId: string,
    state: SessionState,
    activity?: PersonaBotToolActivity,
  ): void;
  activity(slug: string): PersonaBotToolActivity | undefined;
  trace(slug: string): readonly PersonaBotActivityTraceEntry[];
  rebuildSessionStates(
    rows: readonly {
      slug: string;
      sessionId: string;
      state: SessionState;
      activity?: PersonaBotToolActivity;
    }[],
  ): void;
  onActivity(listener: (event: PersonaBotActivityEvent) => void): () => void;
  clearSession(slug: string, sessionId: string): void;
  snapshot(slug: string): BotStateSnapshot;
  version(): { generation: string; revision: number };
  on(listener: (event: BotStateEvent) => void): () => void;
}

const RANK: Record<AggregatedState, number> = {
  idle: 0,
  thinking: 1,
  working: 2,
  waiting: 3,
  blocked: 4,
};

export function aggregateSessionStates(sessions: Record<string, SessionState>): AggregatedState {
  let result: AggregatedState = 'idle';
  for (const state of Object.values(sessions)) {
    const candidate: AggregatedState = state === 'done' ? 'idle' : state;
    if (RANK[candidate] > RANK[result]) result = candidate;
  }
  return result;
}

export function createBotStateTracker(): BotStateTracker {
  const bots = new Map<string, Map<string, SessionState>>();
  const listeners = new Set<(event: BotStateEvent) => void>();
  const tools = new Map<string, PersonaBotToolActivity>();
  const activityListeners = new Set<(event: PersonaBotActivityEvent) => void>();
  const traces = new Map<string, PersonaBotActivityTraceEntry[]>();
  const generation = randomUUID();
  let revision = 0;
  let rebuilding = false;
  const rebuildNotifications = new Map<string, PersonaBotActivityEvent['cause']>();
  const rebuildEvents: BotStateEvent[] = [];

  const sessionsOf = (slug: string): Map<string, SessionState> => {
    let sessions = bots.get(slug);
    if (sessions === undefined) {
      sessions = new Map();
      bots.set(slug, sessions);
    }
    return sessions;
  };

  const toRecord = (sessions: Map<string, SessionState>): Record<string, SessionState> =>
    Object.fromEntries(sessions);

  const snapshotOf = (slug: string, sessions: Map<string, SessionState>): BotStateSnapshot => {
    const detail = toRecord(sessions);
    return { slug, state: aggregateSessionStates(detail), sessions: detail };
  };

  const emit = (event: BotStateEvent): void => {
    if (rebuilding) {
      rebuildEvents.push(event);
      return;
    }
    for (const listener of listeners) listener(event);
  };

  const emitAggregateIfChanged = (
    slug: string,
    snapshot: BotStateSnapshot,
    previous: AggregatedState,
  ): void => {
    if (snapshot.state !== previous) {
      emit({
        type: 'aggregate-changed',
        slug,
        state: snapshot.state,
        previous,
        snapshot,
      });
    }
  };

  const activityOf = (slug: string): PersonaBotToolActivity | undefined => {
    const sessions = bots.get(slug);
    if (sessions === undefined || aggregateSessionStates(toRecord(sessions)) !== 'working')
      return undefined;
    const working = [...sessions].filter(([, state]) => state === 'working');
    const items = working.map(([id]) => tools.get(id));
    if (items.some((item) => item === undefined)) return undefined;
    return aggregateToolActivity(items.filter((item) => item !== undefined));
  };
  const traceOf = (slug: string): readonly PersonaBotActivityTraceEntry[] =>
    structuredClone(traces.get(slug) ?? []);
  const commitTrace = (slug: string): void => {
    const activity = activityOf(slug);
    const state = snapshotOf(slug, bots.get(slug) ?? new Map()).state;
    if (state === 'idle') traces.delete(slug);
    else {
      const previous = traces.get(slug) ?? [];
      const last = previous.at(-1);
      if (last?.state !== state || JSON.stringify(last?.activity) !== JSON.stringify(activity))
        traces.set(
          slug,
          [
            ...previous,
            {
              revision,
              at: Date.now(),
              state,
              ...(activity === undefined ? {} : { activity: structuredClone(activity) }),
            },
          ].slice(-MAX_ACTIVITY_TRACE_ENTRIES),
        );
    }
  };
  const publishActivity = (slug: string, cause: PersonaBotActivityEvent['cause']): void => {
    const activity = activityOf(slug);
    const state = snapshotOf(slug, bots.get(slug) ?? new Map()).state;
    const trace = traceOf(slug);
    const event: PersonaBotActivityEvent = {
      generation,
      revision,
      slug,
      state,
      cause,
      ...(trace.length === 0 ? {} : { trace }),
      ...(activity === undefined ? {} : { activity }),
    };
    for (const listener of activityListeners) listener(event);
  };

  const notify = (slug: string, cause: PersonaBotActivityEvent['cause']): void => {
    if (rebuilding) {
      rebuildNotifications.set(slug, cause);
      return;
    }
    commitTrace(slug);
    publishActivity(slug, cause);
  };

  const tracker: BotStateTracker = {
    rebuildSessionStates(rows) {
      const slugs = new Set(rows.map((row) => row.slug));
      for (const slug of slugs) traces.delete(slug);
      rebuilding = true;
      try {
        for (const row of rows)
          tracker.setSessionState(row.slug, row.sessionId, row.state, row.activity);
      } finally {
        rebuilding = false;
      }
      if (slugs.size > 0) revision += 1;
      for (const slug of slugs) commitTrace(slug);
      for (const slug of slugs)
        publishActivity(slug, rebuildNotifications.get(slug) ?? 'session-changed');
      rebuildNotifications.clear();
      for (const event of rebuildEvents.splice(0)) emit(event);
    },
    setSessionState(slug, sessionId, state, activity) {
      const sessions = sessionsOf(slug);
      const previousAggregate = aggregateSessionStates(toRecord(sessions));
      const previousState = sessions.get(sessionId);
      const previousActivity = tools.get(sessionId);
      const nextActivity = state === 'working' ? activity : undefined;
      if (nextActivity === undefined) tools.delete(sessionId);
      else
        tools.set(sessionId, {
          effect: nextActivity.effect,
          toolKind: nextActivity.toolKind,
          ...(nextActivity.toolName === undefined ? {} : { toolName: nextActivity.toolName }),
          ...(isPublicToolDetail(nextActivity.publicDetail)
            ? { publicDetail: nextActivity.publicDetail }
            : {}),
          startedAt: nextActivity.startedAt,
          activeToolCount: nextActivity.activeToolCount,
          ...(nextActivity.sources === undefined
            ? {}
            : { sources: nextActivity.sources.map(({ role, count }) => ({ role, count })) }),
        });
      sessions.set(sessionId, state);
      const snapshot = snapshotOf(slug, sessions);
      const changed =
        previousState !== state ||
        JSON.stringify(previousActivity) !== JSON.stringify(tools.get(sessionId));
      if (changed) {
        revision += 1;
        notify(slug, 'session-changed');
        emit({ type: 'session-changed', slug, sessionId, state, snapshot });
      }
      emitAggregateIfChanged(slug, snapshot, previousAggregate);
    },
    clearSession(slug, sessionId) {
      const sessions = bots.get(slug);
      if (sessions === undefined) return;
      const previousAggregate = aggregateSessionStates(toRecord(sessions));
      if (!sessions.delete(sessionId)) return;
      tools.delete(sessionId);
      revision += 1;
      const snapshot = snapshotOf(slug, sessions);
      notify(slug, 'session-removed');
      emit({ type: 'session-removed', slug, sessionId, snapshot });
      emitAggregateIfChanged(slug, snapshot, previousAggregate);
    },
    activity: activityOf,
    trace: traceOf,
    onActivity(listener) {
      activityListeners.add(listener);
      return () => {
        activityListeners.delete(listener);
      };
    },
    snapshot(slug) {
      return snapshotOf(slug, bots.get(slug) ?? new Map());
    },
    version() {
      return { generation, revision };
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return tracker;
}

export interface PersonaBotActivityEvent {
  generation: string;
  revision: number;
  slug: string;
  state: AggregatedState;
  cause: 'session-changed' | 'session-removed';
  activity?: PersonaBotToolActivity;
  trace?: readonly PersonaBotActivityTraceEntry[];
}

export interface PersonaBotActivitySnapshot {
  generation: string;
  revision: number;
  bots: {
    slug: string;
    state: AggregatedState;
    activity?: PersonaBotToolActivity;
    trace?: readonly PersonaBotActivityTraceEntry[];
  }[];
}

export function personaBotActivitySnapshot(
  slugs: readonly string[],
  states: BotStateTracker,
): PersonaBotActivitySnapshot {
  return {
    ...states.version(),
    bots: slugs.map((slug) => {
      const activity = states.activity(slug);
      const trace = states.trace(slug);
      return {
        slug,
        state: states.snapshot(slug).state,
        ...(activity === undefined ? {} : { activity }),
        ...(trace.length === 0 ? {} : { trace }),
      };
    }),
  };
}
