import { relativeTime, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives';

export type BotState = 'thinking' | 'working' | 'waiting' | 'blocked' | 'idle';

import { zhTranslate, type BotHarnessTranslate } from './locale.js';

/** Fixed bottom bucket for Channels with no section (ADR-0031); a product term, not a folder. */
export function ungroupedLabel(t: BotHarnessTranslate = zhTranslate): string {
  return t('roster.ungrouped');
}

const STATE_KEYS = {
  thinking: 'botState.thinking',
  working: 'botState.working',
  waiting: 'botState.waiting',
  blocked: 'botState.blocked',
  idle: 'botState.idle',
} as const;

/** Human-readable Bot activity state. */
export function botStateLabel(state: BotState, t: BotHarnessTranslate = zhTranslate): string {
  return t(STATE_KEYS[state]);
}

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

export function formatRelativeTime(
  at: number,
  now: number,
  t: BotHarnessTranslate = zhTranslate,
): string {
  const { unit, n } = relativeTime(at, now);
  switch (unit) {
    case 'now':
      return t('time.justNow');
    case 'minutes':
      return t('time.minutesAgo', { n });
    case 'hours':
      return t('time.hoursAgo', { n });
    case 'days':
      return t('time.daysAgo', { n });
    case 'months':
      return t('time.monthsAgo', { n });
    case 'years':
      return t('time.yearsAgo', { n });
  }
}
