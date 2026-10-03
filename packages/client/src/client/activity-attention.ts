import type { PersonaBotAttention } from '../../../core/src/state/bot-state.js';

export function parsePublicAttention(value: unknown): PersonaBotAttention | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const approvalCount: unknown = Reflect.get(value, 'approvalCount');
  if (
    typeof approvalCount !== 'number' ||
    !Number.isSafeInteger(approvalCount) ||
    approvalCount < 0
  )
    return undefined;
  const attention: PersonaBotAttention = { approvalCount };
  for (const key of ['questionCount', 'waitingHumanCount', 'blockedCount'] as const) {
    const count: unknown = Reflect.get(value, key);
    if (count === undefined) continue;
    if (typeof count !== 'number' || !Number.isSafeInteger(count) || count <= 0) return undefined;
    attention[key] = count;
  }
  const total = attentionCount(attention);
  return Number.isSafeInteger(total) && total > 0 ? attention : undefined;
}

export function attentionCount(attention: PersonaBotAttention | undefined): number {
  return (
    (attention?.approvalCount ?? 0) +
    (attention?.questionCount ?? 0) +
    (attention?.waitingHumanCount ?? 0) +
    (attention?.blockedCount ?? 0)
  );
}
