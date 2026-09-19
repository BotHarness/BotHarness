import { relativeTime, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';

export type BotState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'idle';

export const STATE_LABELS: Record<BotState, string> = {
  thinking: '思考中',
  working: '进行中',
  waiting: '需要确认',
  blocked: '阻塞',
  idle: '空闲',
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

export function formatRelativeTime(at: number, now: number): string {
  const { unit, n } = relativeTime(at, now);
  switch (unit) {
    case 'now':
      return '刚刚';
    case 'minutes':
      return `${n} 分钟前`;
    case 'hours':
      return `${n} 小时前`;
    case 'days':
      return `${n} 天前`;
    case 'months':
      return `${n} 个月前`;
    case 'years':
      return `${n} 年前`;
  }
}
