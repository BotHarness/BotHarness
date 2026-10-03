import type { PersonaBotAttention } from '../../../core/src/state/bot-state.js';

export function parsePublicAttention(value: unknown): PersonaBotAttention | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const approvalCount: unknown = Reflect.get(value, 'approvalCount');
  const questionCount: unknown = Reflect.get(value, 'questionCount');
  if (
    typeof approvalCount !== 'number' ||
    !Number.isSafeInteger(approvalCount) ||
    approvalCount < 0
  )
    return undefined;
  if (
    questionCount !== undefined &&
    (typeof questionCount !== 'number' ||
      !Number.isSafeInteger(questionCount) ||
      questionCount <= 0)
  )
    return undefined;
  const total = approvalCount + (questionCount ?? 0);
  if (!Number.isSafeInteger(total) || total <= 0) return undefined;
  return { approvalCount, ...(questionCount === undefined ? {} : { questionCount }) };
}

export function attentionCount(attention: PersonaBotAttention | undefined): number {
  return (attention?.approvalCount ?? 0) + (attention?.questionCount ?? 0);
}
