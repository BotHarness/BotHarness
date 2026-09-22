import type { ChannelMessage } from './channel.js';

export const DEFAULT_MESSAGE_PAGE = 50;
export const MAX_MESSAGE_PAGE = 200;

export type TimelineDirection = 'older' | 'newer' | 'around';

export interface ChannelTimelineRequest {
  direction?: TimelineDirection | undefined;
  cursor?: string | undefined;
  around?: string | undefined;
  limit?: number | undefined;
  olderLimit?: number | undefined;
  newerLimit?: number | undefined;
}

/** Chronological window over the durable Channel log. Cursors are opaque to callers. */
export interface ChannelTimelinePage {
  entries: ChannelMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

interface CursorValue {
  v: 1;
  channelId: string;
  at: string;
  id: string;
}

function encodeCursor(channelId: string, message: ChannelMessage): string {
  return Buffer.from(
    JSON.stringify({ v: 1, channelId, at: message.at, id: message.id } satisfies CursorValue),
  ).toString('base64url');
}

function cursorIndex(
  channelId: string,
  messages: readonly ChannelMessage[],
  cursor: string,
): number {
  if (cursor.length > 2048) return -1;
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof value !== 'object' || value === null) return -1;
    const decoded = value as Partial<CursorValue>;
    if (
      decoded.v !== 1 ||
      decoded.channelId !== channelId ||
      typeof decoded.id !== 'string' ||
      typeof decoded.at !== 'string'
    )
      return -1;
    return messages.findIndex((message) => message.id === decoded.id && message.at === decoded.at);
  } catch {
    return -1;
  }
}

/** The append order, not wall-clock timestamps, is the Channel's durable timeline order. */
export function pageChannelTimeline(
  channelId: string,
  messages: readonly ChannelMessage[],
  request: ChannelTimelineRequest = {},
): ChannelTimelinePage | undefined {
  const limit = Math.max(1, Math.min(request.limit ?? DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE));
  let start: number;
  let end: number;
  if (request.direction === 'around') {
    const target = messages.findIndex((message) => message.id === request.around);
    if (target < 0) return undefined;
    const older = Math.max(0, Math.min(request.olderLimit ?? 20, MAX_MESSAGE_PAGE));
    const newer = Math.max(0, Math.min(request.newerLimit ?? 20, MAX_MESSAGE_PAGE));
    start = Math.max(0, target - older);
    end = Math.min(messages.length, target + newer + 1);
  } else if (request.direction === 'older' || request.direction === 'newer') {
    if (request.cursor === undefined) return undefined;
    const anchor = cursorIndex(channelId, messages, request.cursor);
    if (anchor < 0) return undefined;
    start = request.direction === 'older' ? Math.max(0, anchor - limit) : anchor + 1;
    end = request.direction === 'older' ? anchor : Math.min(messages.length, start + limit);
  } else {
    end = messages.length;
    start = Math.max(0, end - limit);
  }
  const entries = messages.slice(start, end);
  return {
    entries,
    olderCursor: entries[0] === undefined ? null : encodeCursor(channelId, entries[0]),
    newerCursor: entries.at(-1) === undefined ? null : encodeCursor(channelId, entries.at(-1)!),
    hasOlder: start > 0,
    hasNewer: end < messages.length,
  };
}
