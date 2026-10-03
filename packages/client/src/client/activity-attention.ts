import type { PersonaBotAttention } from '../../../core/src/state/bot-state.js';

export function parsePublicAttention(value: unknown): PersonaBotAttention | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const count: unknown = Reflect.get(value, 'approvalCount');
  return typeof count === 'number' && Number.isSafeInteger(count) && count > 0
    ? { approvalCount: count }
    : undefined;
}
