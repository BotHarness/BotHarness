import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type { ToolExecution } from '@deepseek-ai/dsh-tools';
import type { ApprovalOutcome } from '@deepseek-ai/dsh-user-approval';

import { dmChannelId, type ChannelMessage } from '../channels/channel.js';
import type { ChannelStore } from '../channels/store.js';
import type { SessionOwnership } from '../sessions/ownership.js';

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
  outcome: 'allowed-once' | 'rejected';
}

type TrackedCall = ToolApprovalRequestCard & { botSlug: string; agent: Agent };
type Pending = {
  botSlug: string;
  channelId: string;
  resolve(outcome: ApprovalOutcome): void;
  signal?: AbortSignal;
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
  readonly #tracked = new Map<string, TrackedCall>();
  readonly #pending = new Map<string, Pending>();

  constructor(channels: ChannelStore, ownership: SessionOwnership) {
    this.#channels = channels;
    this.#ownership = ownership;
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

  status(botSlug: string, messageId: string): 'pending' | 'expired' {
    return this.#pending.get(messageId)?.botSlug === botSlug ? 'pending' : 'expired';
  }

  async decide(
    botSlug: string,
    messageId: string,
    outcome: 'allowed-once' | 'rejected',
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (pending === undefined || pending.botSlug !== botSlug || pending.deciding) return false;
    if (pending.signal?.aborted) {
      this.#settle(messageId, 'cancelled');
      return false;
    }
    pending.deciding = true;
    try {
      const decision: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: outcome === 'allowed-once' ? '已批准这一次工具调用' : '已拒绝这一次工具调用',
        replyTo: messageId,
        toolApprovalDecision: { requestMessageId: messageId, outcome },
      };
      if ((await this.#channels.appendMessage(pending.channelId, decision)) === undefined)
        return false;
      if (this.#pending.get(messageId) !== pending || pending.signal?.aborted) return false;
      this.#settle(messageId, outcome);
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
