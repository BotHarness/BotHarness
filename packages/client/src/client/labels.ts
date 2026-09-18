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
  thinking: '#3b82f6',
  working: '#16a34a',
  waiting: '#d97706',
  blocked: '#dc2626',
  idle: '#9ca3af',
};

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
