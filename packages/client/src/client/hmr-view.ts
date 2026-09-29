import type { ConversationSelection } from './store.js';

const KEY = '__botharnessHmrView';
const MAX_AGE_MS = 30_000;

export interface HmrView {
  selection: ConversationSelection | undefined;
}

interface StoredHmrView extends HmrView {
  at: number;
}

export function saveHmrView(
  target: Record<string, unknown>,
  selection: ConversationSelection | undefined,
  now = Date.now(),
): void {
  target[KEY] = { at: now, selection } satisfies StoredHmrView;
}

export function takeHmrView(
  target: Record<string, unknown>,
  now = Date.now(),
): HmrView | undefined {
  const value = target[KEY];
  delete target[KEY];
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record['at'] !== 'number' || now - record['at'] > MAX_AGE_MS || now < record['at']) {
    return undefined;
  }
  const selection = record['selection'];
  if (selection === undefined) return { selection: undefined };
  if (typeof selection !== 'object' || selection === null) return undefined;
  const candidate = selection as Record<string, unknown>;
  if (candidate['kind'] === 'bot' && typeof candidate['slug'] === 'string') {
    return { selection: { kind: 'bot', slug: candidate['slug'] } };
  }
  if (candidate['kind'] === 'channel' && typeof candidate['channelId'] === 'string') {
    return { selection: { kind: 'channel', channelId: candidate['channelId'] } };
  }
  return undefined;
}
