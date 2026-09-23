import { randomUUID } from 'node:crypto';

export type SessionState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'done';

export type AggregatedState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked';

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
  setSessionState(slug: string, sessionId: string, state: SessionState): void;
  clearSession(slug: string, sessionId: string): void;
  snapshot(slug: string): BotStateSnapshot;
  /** A new generation starts whenever the Host restarts. */
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
  const generation = randomUUID();
  let revision = 0;

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

  return {
    setSessionState(slug, sessionId, state) {
      const sessions = sessionsOf(slug);
      const previousAggregate = aggregateSessionStates(toRecord(sessions));
      const previousState = sessions.get(sessionId);
      sessions.set(sessionId, state);
      const snapshot = snapshotOf(slug, sessions);
      if (previousState !== state) {
        revision += 1;
        emit({ type: 'session-changed', slug, sessionId, state, snapshot });
      }
      emitAggregateIfChanged(slug, snapshot, previousAggregate);
    },
    clearSession(slug, sessionId) {
      const sessions = bots.get(slug);
      if (sessions === undefined) return;
      const previousAggregate = aggregateSessionStates(toRecord(sessions));
      if (!sessions.delete(sessionId)) return;
      revision += 1;
      const snapshot = snapshotOf(slug, sessions);
      emit({ type: 'session-removed', slug, sessionId, snapshot });
      emitAggregateIfChanged(slug, snapshot, previousAggregate);
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
}
