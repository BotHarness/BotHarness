import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import { dmChannelId, type ChannelMessage } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { SessionOwnership, SessionOwnershipRecord } from '../sessions/ownership.js';
import type { ToolApprovalRuleStore } from './tool-approval-rules.js';

export interface ToolApprovalRequestCard {
  sessionId: string;
  callId: string;
  toolName: string;
  role: 'orchestrator' | 'assignment';
  cwd: string;
  input: string;
}

export interface ToolApprovalDecision {
  requestMessageId: string;
  outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected';
}

type TrackedCall = ToolApprovalRequestCard & {
  botSlug: string;
  agent: Agent;
  scopeKey: string;
  automatic?: boolean;
};
type Pending = {
  botSlug: string;
  channelId: string;
  resolve(outcome: ApprovalOutcome): void;
  signal?: AbortSignal;
  sessionId: string;
  callId: string;
  abort(): void;
  deciding: boolean;
};

const MAX_APPROVAL_INPUT = 16_000;

function callKey(sessionId: string, callId: string): string {
  return sessionId + ':' + callId;
}

function inputOf(execution: ToolExecution): string | undefined {
  try {
    const input = JSON.stringify(execution.arguments, null, 2);
    return typeof input === 'string' && input.length > 0 && input.length <= MAX_APPROVAL_INPUT
      ? input
      : undefined;
  } catch {
    return undefined;
  }
}

/** Live DSH approval answerer presented in the owning PersonaBot DM. */
export class ChannelToolApproval {
  readonly #channels: ChannelStore;
  readonly #ownership: SessionOwnership;
  readonly #rules: ToolApprovalRuleStore | undefined;
  readonly #scope: (agent: Agent, owner: SessionOwnershipRecord) => string | undefined;
  readonly #tracked = new Map<string, TrackedCall>();
  readonly #pending = new Map<string, Pending>();

  constructor(
    channels: ChannelStore,
    ownership: SessionOwnership,
    rules?: ToolApprovalRuleStore,
    scope?: (agent: Agent, owner: SessionOwnershipRecord) => string | undefined,
  ) {
    this.#channels = channels;
    this.#ownership = ownership;
    this.#rules = rules;
    this.#scope =
      scope ?? ((agent, owner) => JSON.stringify([owner.rootRole, agent.session.header.cwd]));
  }

  track(execution: ToolExecution): (() => void) | undefined {
    const agent = execution.agent;
    if (agent === undefined) return undefined;
    const owner = this.#ownership.resolve(agent.session.id);
    if (
      owner === undefined ||
      (owner.rootRole !== 'orchestrator' && owner.rootRole !== 'assignment')
    ) {
      return undefined;
    }
    const input = inputOf(execution);
    const cwd = agent.session.header.cwd;
    if (input === undefined || cwd === undefined) return undefined;
    const scopeKey = this.#scope(agent, owner);
    if (scopeKey === undefined) return undefined;
    const key = callKey(agent.session.id, execution.callId);
    this.#tracked.set(key, {
      agent,
      botSlug: owner.botSlug,
      sessionId: agent.session.id,
      callId: execution.callId,
      toolName: execution.name,
      role: owner.rootRole,
      cwd,
      input,
      scopeKey,
    });
    return () => {
      if (this.#tracked.get(key)?.agent === agent) this.#tracked.delete(key);
    };
  }

  async ask(request: {
    agent: Agent;
    toolName: string;
    callId?: string;
    signal?: AbortSignal;
  }): Promise<ApprovalOutcome | undefined> {
    if (request.callId === undefined) return undefined;
    const tracked = this.#tracked.get(callKey(request.agent.session.id, request.callId));
    if (
      tracked === undefined ||
      tracked.agent !== request.agent ||
      tracked.toolName !== request.toolName
    ) {
      return undefined;
    }
    if (request.signal?.aborted) return 'cancelled';
    const owner = this.#ownership.resolve(request.agent.session.id);
    if (owner === undefined || this.#scope(request.agent, owner) !== tracked.scopeKey)
      return 'unavailable';
    if (this.#rules?.match(tracked) !== undefined) {
      tracked.automatic = true;
      return 'allowed-once';
    }
    const channelId = dmChannelId(tracked.botSlug);
    if (this.#channels.get(channelId)?.botSlug !== tracked.botSlug) return 'unavailable';
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: tracked.botSlug },
      body: '请求批准执行 ' + tracked.toolName,
      toolApprovalRequest: {
        sessionId: tracked.sessionId,
        callId: tracked.callId,
        toolName: tracked.toolName,
        role: tracked.role,
        cwd: tracked.cwd,
        input: tracked.input,
      },
    };
    let resolve!: (outcome: ApprovalOutcome) => void;
    const answer = new Promise<ApprovalOutcome>((done) => {
      resolve = done;
    });
    const pending: Pending = {
      botSlug: tracked.botSlug,
      channelId,
      sessionId: tracked.sessionId,
      callId: tracked.callId,
      resolve,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      abort: () => this.#settle(message.id, 'cancelled'),
      deciding: false,
    };
    this.#pending.set(message.id, pending);
    request.signal?.addEventListener('abort', pending.abort, { once: true });
    try {
      const committed = await this.#channels.appendMessage(channelId, message);
      if (committed === undefined) return 'unavailable';
      return await answer;
    } catch {
      return 'unavailable';
    } finally {
      this.#settle(message.id, 'unavailable');
    }
  }

  validAfterDecision(agent: Agent, callId: string): boolean {
    const tracked = this.#tracked.get(callKey(agent.session.id, callId));
    if (tracked === undefined || tracked.agent !== agent) return false;
    const owner = this.#ownership.resolve(agent.session.id);
    if (owner === undefined || this.#scope(agent, owner) !== tracked.scopeKey) return false;
    return !tracked.automatic || this.#rules?.match(tracked) !== undefined;
  }

  /** Expire requests whose Host-owned access scope changed after they were shown. */
  cancelInvalid(): void {
    for (const [messageId, pending] of this.#pending) {
      const tracked = this.#tracked.get(callKey(pending.sessionId, pending.callId));
      const owner = tracked === undefined ? undefined : this.#ownership.resolve(tracked.sessionId);
      if (
        tracked === undefined ||
        owner === undefined ||
        this.#scope(tracked.agent, owner) !== tracked.scopeKey
      ) {
        this.#settle(messageId, 'unavailable');
      }
    }
  }

  activeMessageIds(): string[] {
    this.cancelInvalid();
    return [...this.#pending.keys()];
  }

  status(botSlug: string, messageId: string): 'pending' | 'expired' {
    return this.#pending.get(messageId)?.botSlug === botSlug ? 'pending' : 'expired';
  }

  async decide(
    botSlug: string,
    messageId: string,
    outcome: ToolApprovalDecision['outcome'],
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (pending === undefined || pending.botSlug !== botSlug || pending.deciding) return false;
    if (pending.signal?.aborted) {
      this.#settle(messageId, 'cancelled');
      return false;
    }
    pending.deciding = true;
    try {
      const tracked = this.#tracked.get(callKey(pending.sessionId, pending.callId));
      if (tracked === undefined || tracked.botSlug !== botSlug) return false;
      const owner = this.#ownership.resolve(tracked.sessionId);
      if (owner === undefined || this.#scope(tracked.agent, owner) !== tracked.scopeKey) {
        this.#settle(messageId, 'unavailable');
        return false;
      }
      const kind =
        outcome === 'allowed-always-exact'
          ? 'exact'
          : outcome === 'allowed-always-all'
            ? 'all-opaque'
            : undefined;
      const rule =
        kind === undefined
          ? undefined
          : this.#rules?.createPending({
              botSlug,
              role: tracked.role,
              scopeKey: tracked.scopeKey,
              kind,
              toolName: kind === 'exact' ? tracked.toolName : '*',
              input: kind === 'exact' ? tracked.input : '',
            });
      if (kind !== undefined && rule === undefined) return false;
      const decision: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body:
          outcome === 'rejected'
            ? '已拒绝这一次工具调用'
            : kind === undefined
              ? '已批准这一次工具调用'
              : '已保存自动批准规则并批准这一次调用',
        replyTo: messageId,
        toolApprovalDecision: { requestMessageId: messageId, outcome },
      };
      if ((await this.#channels.appendMessage(pending.channelId, decision)) === undefined) {
        if (rule !== undefined) this.#rules?.revoke(botSlug, rule.id);
        return false;
      }
      if (rule !== undefined) this.#rules?.activate(botSlug, rule.id);
      if (this.#pending.get(messageId) !== pending || pending.signal?.aborted) return false;
      this.#settle(messageId, outcome === 'rejected' ? 'rejected' : 'allowed-once');
      return true;
    } finally {
      pending.deciding = false;
    }
  }

  close(): void {
    for (const id of this.#pending.keys()) this.#settle(id, 'cancelled');
    this.#tracked.clear();
  }

  #settle(messageId: string, outcome: ApprovalOutcome): void {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) return;
    this.#pending.delete(messageId);
    pending.signal?.removeEventListener('abort', pending.abort);
    pending.resolve(outcome);
  }
}
