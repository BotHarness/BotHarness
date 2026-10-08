import type { Context } from '@deepseek-ai/cordis';
import type { TimedQuestionPort } from './user-questions.js';
import type { BotRuntime } from '../runtime/bot-runtime.js';

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

export function nativeTimedQuestions(ctx: Context, runtime: BotRuntime): TimedQuestionPort {
  return {
    bind: (agent, channelId) => runtime.bindNativeQuestionInput?.(agent.session.id, channelId),
    read(agent, callId) {
      const service = record(ctx.get('sessionProjections'));
      if (typeof service?.['stateOf'] !== 'function') return undefined;
      const fold: unknown = service['stateOf'].call(service, agent.session, 'userQuestions');
      const questions = record(record(fold)?.['questions']);
      const active = questions?.['active'];
      if (!Array.isArray(active)) return undefined;
      const pending = record(active.find((item: unknown) => record(item)?.['callId'] === callId));
      const state = pending?.['state'];
      if (state === 'open' || state === 'continued') return { state };
      const settled = questions?.['settled'];
      if (!Array.isArray(settled)) return undefined;
      const answers = record(
        settled.find((item: unknown) => record(item)?.['callId'] === callId),
      )?.['answers'];
      if (!Array.isArray(answers)) return undefined;
      return { state: 'answered', answer: { answers } };
    },
    answer(agent, callId, answer) {
      const service = record(ctx.get('userQuestions'));
      if (typeof service?.['answer'] !== 'function') return false;
      return service['answer'].call(service, agent, callId, answer) === true;
    },
  };
}
