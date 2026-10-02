import type { ToolCallView } from '@deepseek-ai/dsh-tools';
import {
  aggregateToolActivity,
  activityEffectForToolKind,
  toolKindForView,
  type PersonaBotToolActivity,
} from './tool-activity.js';
import type { SessionOwnership } from '../sessions/ownership.js';
import type { DshSessionEvent } from '../sessions/source.js';
import type { BotStateTracker, SessionState } from './bot-state.js';

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

export function deriveSessionState(events: readonly DshSessionEvent[]): SessionState | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event === undefined) continue;
    const state = sessionStateForEvent(event);
    if (state !== undefined) return state;
  }
  return undefined;
}

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
  rebuilt: number;

  attributed: number;

  unowned: number;
}

export interface DshActivityProjection {
  handleSessionEvent(sessionId: string, event: DshSessionEvent): void;

  handleAgentCreated(session: DshActivitySession): boolean;

  handleSessionDisposed(sessionId: string): void;

  rebuild(sessions: readonly DshActivitySession[]): DshActivityRebuildReport;
}

export function createDshActivityProjection(options: {
  ownership: SessionOwnership;
  states: BotStateTracker;
  now?: () => Date;
  describeCall?(
    sessionId: string,
    name: string,
    args: unknown,
  ): { name: string; view?: ToolCallView } | undefined;
}): DshActivityProjection {
  const { ownership, states } = options;
  const now = options.now ?? (() => new Date());

  const pending = new Map<string, Map<string, PersonaBotToolActivity>>();
  const project = (sessionId: string, event: DshSessionEvent): SessionState | undefined => {
    const state = sessionStateForEvent(event);
    if (state === undefined) return undefined;
    let calls = pending.get(sessionId);
    if (calls === undefined) {
      calls = new Map();
      pending.set(sessionId, calls);
    }
    const data =
      typeof event.data === 'object' && event.data !== null
        ? (event.data as Record<string, unknown>)
        : {};
    if (event.type === 'tool/call') {
      const name =
        typeof data['name'] === 'string' && /^[A-Za-z0-9_.:/-]{1,80}$/.test(data['name'])
          ? data['name']
          : undefined;
      const callId = typeof data['callId'] === 'string' ? data['callId'] : undefined;
      let declaration: { name: string; view?: ToolCallView } | undefined;
      try {
        if (name !== undefined && typeof data['arguments'] === 'string')
          declaration = options.describeCall?.(sessionId, name, JSON.parse(data['arguments']));
      } catch {}
      const toolKind = toolKindForView(declaration?.view);
      const toolName =
        declaration !== undefined && /^[A-Za-z0-9_.:/-]{1,80}$/.test(declaration.name)
          ? declaration.name
          : undefined;
      if (callId !== undefined)
        calls.set(callId, {
          toolKind,
          effect: activityEffectForToolKind(toolKind),
          ...(toolName === undefined ? {} : { toolName }),
          startedAt:
            Number.isSafeInteger(event.time) && event.time >= 0 ? event.time : now().getTime(),
          activeToolCount: 1,
        });
    } else if (event.type === 'tool/result') {
      const message = data['message'];
      if (
        typeof message === 'object' &&
        message !== null &&
        'toolCallId' in message &&
        typeof message.toolCallId === 'string'
      )
        calls.delete(message.toolCallId);
    } else if (
      event.type === 'turn/end' ||
      event.type === 'turn/start' ||
      event.type === 'step/start'
    )
      calls.clear();
    return calls.size > 0 ? 'working' : state;
  };

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
      const state = project(sessionId, event);
      if (state === undefined) return;
      states.setSessionState(
        owner.botSlug,
        sessionId,
        state,
        aggregateToolActivity([...(pending.get(sessionId)?.values() ?? [])]),
      );
    },
    handleAgentCreated(session) {
      return attribute(session);
    },
    handleSessionDisposed(sessionId) {
      const owner = ownership.resolve(sessionId);
      if (owner === undefined) return;
      pending.delete(sessionId);
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
        pending.delete(session.id);
        let state: SessionState | undefined;
        for (const event of session.snapshotEvents()) state = project(session.id, event) ?? state;
        if (state === undefined) continue;
        states.setSessionState(
          owner.botSlug,
          session.id,
          state,
          aggregateToolActivity([...(pending.get(session.id)?.values() ?? [])]),
        );
        rebuilt += 1;
      }
      return { rebuilt, attributed, unowned };
    },
  };
}
