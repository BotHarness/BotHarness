import type { StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';

export type BotState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'idle';

export const STATE_ORDER: readonly BotState[] = [
  'thinking',
  'working',
  'waiting',
  'blocked',
  'idle',
];

export const STATE_LABELS: Record<BotState, string> = {
  thinking: '思考中',
  working: '进行中',
  waiting: '需要确认',
  blocked: '阻塞',
  idle: '空闲',
};

export const STATE_COLORS: Record<BotState, string> = {
  thinking: 'var(--dsw-alias-state-business-primary)',
  working: 'var(--dsw-alias-state-success-primary)',
  waiting: 'var(--dsw-alias-state-warn-primary)',
  blocked: 'var(--dsw-alias-state-error-primary)',
  idle: 'var(--dsw-alias-label-tertiary)',
};

const STATE_DOTS: Record<BotState, StateDotState> = {
  thinking: 'ongoing',
  working: 'done',
  waiting: 'warning',
  blocked: 'error',
  idle: 'idle',
};

export function toStateDot(state: BotState): StateDotState {
  return STATE_DOTS[state];
}

export function toBotState(value: string | undefined): BotState {
  return value === 'thinking' ||
    value === 'working' ||
    value === 'waiting' ||
    value === 'blocked' ||
    value === 'idle'
    ? value
    : 'idle';
}

export function needsYou(state: BotState): boolean {
  return state === 'waiting' || state === 'blocked';
}

export function stateLabel(value: string | undefined): string {
  return STATE_LABELS[toBotState(value)];
}
