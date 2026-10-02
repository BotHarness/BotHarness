import { randomUUID } from 'node:crypto';
import {
  aggregateToolActivity,
  type PersonaBotSessionActivity,
  type ActivitySourceRole,
  isPublicToolDetail,
  isSessionActivityName,
  type PersonaBotToolActivity,
} from './tool-activity.js';

export type SessionState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'done';

export type AggregatedState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

export type { PersonaBotSessionActivity } from './tool-activity.js';

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
    role?: ActivitySourceRole,
    name?: string,
  ): void;
  activity(slug: string): PersonaBotToolActivity | undefined;
  sessionActivity(slug: string): readonly PersonaBotSessionActivity[];
  rebuildSessionStates(
    rows: readonly {
      slug: string;
      sessionId: string;
      state: SessionState;
      activity?: PersonaBotToolActivity;
      role?: ActivitySourceRole;
      name?: string;
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
  const sessionDetails = new Map<string, Omit<PersonaBotSessionActivity, 'state' | 'activity'>>();
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
  const sessionActivityOf = (slug: string): readonly PersonaBotSessionActivity[] => {
    const result: PersonaBotSessionActivity[] = [];
    for (const [sessionId, state] of bots.get(slug) ?? []) {
      const detail = sessionDetails.get(sessionId);
      if (state === 'done' || detail === undefined) continue;
      const activity = state === 'working' ? tools.get(sessionId) : undefined;
      result.push({ ...detail, state, ...(activity === undefined ? {} : { activity }) });
    }
    return structuredClone(result);
  };
  const publishActivity = (slug: string, cause: PersonaBotActivityEvent['cause']): void => {
    const activity = activityOf(slug);
    const state = snapshotOf(slug, bots.get(slug) ?? new Map()).state;
    const sessions = sessionActivityOf(slug);
    const event: PersonaBotActivityEvent = {
      generation,
      revision,
      slug,
      state,
      cause,
      ...(sessions.length === 0 ? {} : { sessions }),
      ...(activity === undefined ? {} : { activity }),
    };
    for (const listener of activityListeners) listener(event);
  };

  const notify = (slug: string, cause: PersonaBotActivityEvent['cause']): void => {
    if (rebuilding) {
      rebuildNotifications.set(slug, cause);
      return;
    }
    publishActivity(slug, cause);
  };

  const tracker: BotStateTracker = {
    rebuildSessionStates(rows) {
      const slugs = new Set(rows.map((row) => row.slug));
      rebuilding = true;
      try {
        for (const row of rows)
          tracker.setSessionState(
            row.slug,
            row.sessionId,
            row.state,
            row.activity,
            row.role,
            row.name,
          );
      } finally {
        rebuilding = false;
      }
      if (slugs.size > 0) revision += 1;
      for (const slug of slugs)
        publishActivity(slug, rebuildNotifications.get(slug) ?? 'session-changed');
      rebuildNotifications.clear();
      for (const event of rebuildEvents.splice(0)) emit(event);
    },
    setSessionState(slug, sessionId, state, activity, role, name) {
      const sessions = sessionsOf(slug);
      const previousAggregate = aggregateSessionStates(toRecord(sessions));
      const previousState = sessions.get(sessionId);
      const previousActivity = tools.get(sessionId);
      const previousDetail = sessionDetails.get(sessionId);
      const sourceRole =
        role ??
        previousDetail?.role ??
        (activity?.sources?.length === 1 ? activity.sources[0]?.role : undefined);
      const sessionName = isSessionActivityName(name) ? name : undefined;
      const nextActivity = state === 'working' ? activity : undefined;
      if (nextActivity === undefined) tools.delete(sessionId);
      else
        tools.set(sessionId, {
          ...(nextActivity.detailRefs === undefined
            ? {}
            : { detailRefs: [...nextActivity.detailRefs] }),
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
        previousDetail?.role !== sourceRole ||
        previousDetail?.name !== sessionName ||
        JSON.stringify(previousActivity) !== JSON.stringify(tools.get(sessionId));
      if (changed) {
        revision += 1;
        if (sourceRole !== undefined)
          sessionDetails.set(sessionId, {
            id: previousDetail?.id ?? `activity-${randomUUID()}`,
            role: sourceRole,
            ...(sessionName === undefined ? {} : { name: sessionName }),
            at: Date.now(),
            revision,
          });
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
      sessionDetails.delete(sessionId);
      revision += 1;
      const snapshot = snapshotOf(slug, sessions);
      notify(slug, 'session-removed');
      emit({ type: 'session-removed', slug, sessionId, snapshot });
      emitAggregateIfChanged(slug, snapshot, previousAggregate);
    },
    activity: activityOf,
    sessionActivity: sessionActivityOf,
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
  sessions?: readonly PersonaBotSessionActivity[];
}

export interface PersonaBotActivitySnapshot {
  generation: string;
  revision: number;
  bots: {
    slug: string;
    state: AggregatedState;
    activity?: PersonaBotToolActivity;
    sessions?: readonly PersonaBotSessionActivity[];
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
      const sessions = states.sessionActivity(slug);
      return {
        slug,
        state: states.snapshot(slug).state,
        ...(activity === undefined ? {} : { activity }),
        ...(sessions.length === 0 ? {} : { sessions }),
      };
    }),
  };
}
