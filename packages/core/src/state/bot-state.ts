export type SessionState = 'idle' | 'thinking' | 'working' | 'waiting' | 'blocked' | 'done';

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
  | { type: 'session-done'; slug: string; sessionId: string; snapshot: BotStateSnapshot };

export interface BotStateTracker {
  setSessionState(slug: string, sessionId: string, state: SessionState): void;
  clearSession(slug: string, sessionId: string): void;
  snapshot(slug: string): BotStateSnapshot;
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

  return {
    setSessionState(slug, sessionId, state) {
      const sessions = sessionsOf(slug);
      const previous = aggregateSessionStates(toRecord(sessions));
      sessions.set(sessionId, state);
      const snapshot = snapshotOf(slug, sessions);
      if (state === 'done') {
        emit({ type: 'session-done', slug, sessionId, snapshot });
      }
      if (snapshot.state !== previous) {
        emit({ type: 'aggregate-changed', slug, state: snapshot.state, previous, snapshot });
      }
    },
    clearSession(slug, sessionId) {
      const sessions = bots.get(slug);
      if (sessions === undefined) return;
      const previous = aggregateSessionStates(toRecord(sessions));
      sessions.delete(sessionId);
      const snapshot = snapshotOf(slug, sessions);
      if (snapshot.state !== previous) {
        emit({ type: 'aggregate-changed', slug, state: snapshot.state, previous, snapshot });
      }
    },
    snapshot(slug) {
      return snapshotOf(slug, bots.get(slug) ?? new Map());
    },
    on(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
