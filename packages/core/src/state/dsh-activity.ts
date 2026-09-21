import type { SessionOwnership } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';
import type { BotStateTracker, SessionState } from './bot-state.js';

/**
 * Map one durable DSH Session event to the coarse presentation state the
 * PersonaBot tracker exposes. Waiting and blocked are not derivable from raw
 * execution events; they come from BotHarness attention facts later.
 */
export function sessionStateForEvent(event: DshSessionEvent): SessionState | undefined {
  switch (event.type) {
    case 'tool/call':
      return 'working';
    case 'turn/start':
    case 'step/start':
    case 'user/message':
    case 'assistant/message':
    case 'assistant/attempt':
    case 'tool/result':
      return 'thinking';
    case 'turn/end':
      return 'done';
    default:
      return undefined;
  }
}

/** The last state-bearing event wins; logs without one stay unknown. */
export function deriveSessionState(events: readonly DshSessionEvent[]): SessionState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    const state = sessionStateForEvent(event);
    if (state !== undefined) return state;
  }
  return undefined;
}

/** The durable header fields lineage attribution reads; never ownership proof. */
export interface DshActivitySessionHeader {
  parentSession?: string;
  origin?: 'subagent';
}

export interface DshActivitySession {
  id: string;
  header: DshActivitySessionHeader;
  snapshotEvents(): readonly DshSessionEvent[];
}

export interface DshActivityRebuildReport {
  /** Owned Sessions whose state was derived and published. */
  rebuilt: number;
  /** Sessions newly attributed to an owned parent through lineage. */
  attributed: number;
  /** Sessions without an ownership record; they never enter a PersonaBot. */
  unowned: number;
}

export interface DshActivityProjection {
  /** Live `session/event` sink; unowned Sessions are ignored. */
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;
  /**
   * `agent/created` sink: a fork or DSH Subagent inherits its parent's
   * PersonaBot through lineage, and never becomes an independent root.
   */
  handleAgentCreated(session: DshActivitySession): boolean;
  /** `agent/disposed` sink; the Session leaves its PersonaBot's projection. */
  handleSessionDisposed(sessionId: string): void;
  /** Cold rebuild from durable logs, bounded by owned Sessions. */
  rebuild(sessions: readonly DshActivitySession[]): DshActivityRebuildReport;
}

export function createDshActivityProjection(options: {
  ownership: SessionOwnership;
  states: BotStateTracker;
  now?: () => Date;
}): DshActivityProjection {
  const { ownership, states } = options;
  const now = options.now ?? (() => new Date());

  const attribute = (session: DshActivitySession): boolean => {
    if (ownership.resolve(session.id) !== undefined) return false;
    const parentId = session.header.parentSession;
    if (parentId === undefined) return false;
    const parent = ownership.resolve(parentId);
    if (parent === undefined) return false;
    ownership.claim({
      sessionId: session.id,
      botSlug: parent.botSlug,
      rootRole: 'assignment',
      provenance: session.header.origin === 'subagent' ? 'subagent' : 'fork',
      parentSessionId: parentId,
      at: now().toISOString(),
    });
    return true;
  };

  return {
    handleSessionEvent(sessionId, event) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return;
      const state = sessionStateForEvent(event);
      if (state === undefined) return;
      states.setSessionState(owner.botSlug, sessionId, state);
    },
    handleAgentCreated(session) {
      return attribute(session);
    },
    handleSessionDisposed(sessionId) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return;
      states.clearSession(owner.botSlug, sessionId);
    },
    rebuild(sessions) {
      let attributed = 0;
      let claimed = true;
      while (claimed) {
        claimed = false;
        for (const session of sessions) {
          if (attribute(session)) {
            claimed = true;
            attributed += 1;
          }
        }
      }
      let rebuilt = 0;
      let unowned = 0;
      for (const session of sessions) {
        const owner = ownership.resolve(session.id);
        if (owner === undefined) {
          unowned += 1;
          continue;
        }
        const state = deriveSessionState(session.snapshotEvents());
        if (state === undefined) continue;
        states.setSessionState(owner.botSlug, session.id, state);
        rebuilt += 1;
      }
      return { rebuilt, attributed, unowned };
    },
  };
}
