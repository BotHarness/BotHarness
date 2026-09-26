import { randomUUID } from 'node:crypto';

import type { Agent } from '@deepseek-ai/dsh-agent';
import type {
  AskUserQuestionAnswer,
  AskUserQuestionAnswerItem,
  AskUserQuestionItem,
  AskUserQuestionRequestEvent,
} from '@deepseek-ai/dsh-user-questions/types';

import { dmChannelId, type ChannelMessage } from './channel.js';
import type { ChannelStore } from './store.js';
import type { SessionOwnership } from '../sessions/ownership.js';

export interface ChannelQuestionRequest {
  sessionId: string;
  questions: AskUserQuestionItem[];
}

export interface ChannelQuestionResolution {
  requestMessageId: string;
  state: 'answered' | 'cancelled';
  answers?: AskUserQuestionAnswerItem[];
}

type Pending = {
  agent: Agent;
  botSlug: string;
  channelId: string;
  questions: AskUserQuestionItem[];
  signal?: AbortSignal;
  resolve(answer: AskUserQuestionAnswer): void;
  reject(reason: Error): void;
  abort(): void;
  deciding: boolean;
};

function validAnswer(questions: AskUserQuestionItem[], answer: AskUserQuestionAnswer): boolean {
  if (!Array.isArray(answer.answers) || answer.answers.length !== questions.length) return false;
  const seen = new Set<string>();
  for (const item of answer.answers) {
    if (typeof item !== 'object' || item === null) return false;
    const question = questions.find((entry) => entry.id === item.id);
    if (question === undefined || seen.has(item.id)) return false;
    seen.add(item.id);
    if (!Array.isArray(item.selected) || !item.selected.every((label) => typeof label === 'string'))
      return false;
    if (new Set(item.selected).size !== item.selected.length) return false;
    if (question.multiSelect !== true && item.selected.length > 1) return false;
    if (question.multiSelect !== true && item.selected.length > 0 && item.custom !== undefined)
      return false;
    const offered = new Set(question.options?.map((option) => option.label) ?? []);
    if (item.selected.some((label) => !offered.has(label))) return false;
    if (
      item.custom !== undefined &&
      (typeof item.custom !== 'string' ||
        item.custom.trim().length === 0 ||
        item.custom.length > 2_000)
    )
      return false;
    if (item.selected.length === 0 && item.custom === undefined) return false;
  }
  return true;
}

/** DSH's native user-question answerer, projected into the owning PersonaBot DM. */
export class ChannelUserQuestions {
  readonly #channels: ChannelStore;
  readonly #ownership: SessionOwnership;
  readonly #isLive: (agent: Agent) => boolean;
  readonly #warn: (message: string) => void;
  readonly #pending = new Map<string, Pending>();

  constructor(
    channels: ChannelStore,
    ownership: SessionOwnership,
    isLive: (agent: Agent) => boolean = () => true,
    warn: (message: string) => void = () => undefined,
  ) {
    this.#channels = channels;
    this.#ownership = ownership;
    this.#isLive = isLive;
    this.#warn = warn;
  }

  async ask(request: AskUserQuestionRequestEvent): Promise<AskUserQuestionAnswer | undefined> {
    const agent = request.agent;
    if (agent === undefined) return undefined;
    const owner = this.#ownership.resolve(agent.session.id);
    if (owner?.rootRole !== 'orchestrator' || !this.#isLive(agent)) return undefined;
    const channelId = dmChannelId(owner.botSlug);
    if (this.#channels.get(channelId)?.botSlug !== owner.botSlug) return undefined;
    if (request.signal?.aborted) throw new Error('DSH user question was cancelled');
    const questions = request.questions.map((question) => ({
      ...question,
      ...(question.options === undefined
        ? {}
        : { options: question.options.map((option) => ({ ...option })) }),
    }));
    if (questions.length === 0 || questions.length > 3 || JSON.stringify(questions).length > 16_000)
      return undefined;
    const message: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: owner.botSlug },
      body: questions.map((question) => question.question).join('\n'),
      userQuestionRequest: { sessionId: agent.session.id, questions },
    };
    let resolve!: (answer: AskUserQuestionAnswer) => void;
    let reject!: (reason: Error) => void;
    const answer = new Promise<AskUserQuestionAnswer>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    // An abort can arrive while the durable request append is still in flight.
    void answer.catch(() => undefined);
    const pending: Pending = {
      agent,
      botSlug: owner.botSlug,
      channelId,
      questions,
      ...(request.signal === undefined ? {} : { signal: request.signal }),
      resolve,
      reject,
      abort: () => this.#cancel(message.id),
      deciding: false,
    };
    this.#pending.set(message.id, pending);
    request.signal?.addEventListener('abort', pending.abort, { once: true });
    try {
      if ((await this.#channels.appendMessage(channelId, message)) === undefined) return undefined;
      return await answer;
    } finally {
      request.signal?.removeEventListener('abort', pending.abort);
      if (this.#pending.get(message.id) === pending) this.#pending.delete(message.id);
    }
  }

  activeMessageIds(): string[] {
    return [...this.#pending]
      .filter(([messageId, pending]) => this.status(pending.botSlug, messageId) === 'pending')
      .map(([messageId]) => messageId);
  }

  status(botSlug: string, messageId: string): 'pending' | 'expired' {
    const pending = this.#pending.get(messageId);
    if (pending === undefined || pending.botSlug !== botSlug) return 'expired';
    const owner = this.#ownership.resolve(pending.agent.session.id);
    if (
      pending.signal?.aborted ||
      !this.#isLive(pending.agent) ||
      owner?.rootRole !== 'orchestrator' ||
      owner.botSlug !== botSlug
    ) {
      this.#cancel(messageId);
      return 'expired';
    }
    return 'pending';
  }

  async answer(
    botSlug: string,
    messageId: string,
    answer: AskUserQuestionAnswer,
  ): Promise<boolean> {
    const pending = this.#pending.get(messageId);
    if (pending === undefined || pending.botSlug !== botSlug || pending.deciding) return false;
    if (pending.signal?.aborted || !this.#isLive(pending.agent)) {
      this.#cancel(messageId);
      return false;
    }
    const owner = this.#ownership.resolve(pending.agent.session.id);
    if (owner?.rootRole !== 'orchestrator' || owner.botSlug !== botSlug) {
      this.#cancel(messageId);
      return false;
    }
    if (!validAnswer(pending.questions, answer)) return false;
    pending.deciding = true;
    try {
      const decision: ChannelMessage = {
        id: randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: answer.answers.map((item) => item.custom ?? item.selected.join(', ')).join('\n'),
        replyTo: messageId,
        userQuestionResolution: {
          requestMessageId: messageId,
          state: 'answered',
          answers: answer.answers,
        },
      };
      if ((await this.#channels.appendMessage(pending.channelId, decision)) === undefined)
        return false;
      if (this.#pending.get(messageId) !== pending || pending.signal?.aborted) return false;
      this.#pending.delete(messageId);
      pending.signal?.removeEventListener('abort', pending.abort);
      pending.resolve(answer);
      return true;
    } finally {
      pending.deciding = false;
    }
  }

  close(): void {
    for (const id of this.#pending.keys()) this.#cancel(id);
  }

  #cancel(messageId: string): void {
    const pending = this.#pending.get(messageId);
    if (pending === undefined) return;
    this.#pending.delete(messageId);
    pending.signal?.removeEventListener('abort', pending.abort);
    const resolution: ChannelMessage = {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'bot', slug: pending.botSlug },
      body: '提问已取消',
      replyTo: messageId,
      userQuestionResolution: { requestMessageId: messageId, state: 'cancelled' },
    };
    // ChannelStore serializes appends per Channel, so an in-flight Human answer
    // commits before this cancellation and the final visible state is cancelled.
    void this.#channels.appendMessage(pending.channelId, resolution).then(
      (saved) => {
        if (saved === undefined)
          this.#warn(`botharness.channel_question.cancel_append_failed request=${messageId}`);
      },
      () => this.#warn(`botharness.channel_question.cancel_append_failed request=${messageId}`),
    );
    pending.reject(new Error('DSH user question was cancelled'));
  }
}
