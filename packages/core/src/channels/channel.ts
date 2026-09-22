import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';

export type ChannelType = 'dm' | 'group';

export interface ChannelRecord {
  id: string;
  type: ChannelType;
  name: string;
  members: string[];
  botSlug?: string;
  createdAt: string;
  updatedAt: string;
}

export type ChannelMessageAuthor =
  | { kind: 'human' }
  | { kind: 'bot'; slug: string }
  | { kind: 'bridged'; source: string };

export interface ChannelMessageExternal {
  id: string;
  thread?: string;
}

export interface ChannelReplyPreview {
  author: ChannelMessageAuthor;
  body: string;
}

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;
  attachments?: ChannelAttachmentRef[];
  external?: ChannelMessageExternal;
  format?: 'markdown' | 'text';
  /** A message id in this same Channel; independent of provider threading. */
  replyTo?: string;
  /** Read-only projection. Null means the original message is unavailable. */
  replyToPreview?: ChannelReplyPreview | null;
}

export const CHANNEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CHANNEL_SLUG_LENGTH = 64;

export function isValidChannelId(id: string): boolean {
  return id.length > 0 && CHANNEL_ID_PATTERN.test(id);
}

export function dmChannelId(botSlug: string): string {
  return `dm-${botSlug}`;
}

export function slugifyChannelName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '');
  return slug.slice(0, MAX_CHANNEL_SLUG_LENGTH).replace(/-+$/gu, '');
}

export function groupChannelIdBase(name: string): string {
  const slug = slugifyChannelName(name);
  return `group-${slug.length > 0 ? slug : 'room'}`;
}

function isChannelMessageAuthor(value: unknown): value is ChannelMessageAuthor {
  if (typeof value !== 'object' || value === null) return false;
  const author = value as Record<string, unknown>;
  switch (author['kind']) {
    case 'human':
      return true;
    case 'bot':
      return typeof author['slug'] === 'string' && author['slug'].length > 0;
    case 'bridged':
      return typeof author['source'] === 'string' && author['source'].length > 0;
    default:
      return false;
  }
}

export function isChannelRecord(value: unknown, id: string): value is ChannelRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['id'] !== id) return false;
  if (record['type'] !== 'dm' && record['type'] !== 'group') return false;
  if (typeof record['name'] !== 'string') return false;
  if (typeof record['createdAt'] !== 'string') return false;
  if (typeof record['updatedAt'] !== 'string') return false;
  const members = record['members'];
  if (!Array.isArray(members) || !members.every((entry) => typeof entry === 'string')) return false;
  const botSlug = record['botSlug'];
  if (botSlug !== undefined && typeof botSlug !== 'string') return false;
  return true;
}

export function isChannelMessage(value: unknown): value is ChannelMessage {
  if (typeof value !== 'object' || value === null) return false;
  const message = value as Record<string, unknown>;
  if (typeof message['id'] !== 'string' || message['id'].length === 0) return false;
  if (typeof message['at'] !== 'string' || message['at'].length === 0) return false;
  if (typeof message['body'] !== 'string') return false;
  const attachments = message['attachments'];
  if (
    attachments !== undefined &&
    (!Array.isArray(attachments) ||
      attachments.length > 10 ||
      !attachments.every(isChannelAttachmentRef))
  )
    return false;
  if (!isChannelMessageAuthor(message['author'])) return false;
  if (
    message['format'] !== undefined &&
    message['format'] !== 'markdown' &&
    message['format'] !== 'text'
  )
    return false;
  if (
    message['replyTo'] !== undefined &&
    (typeof message['replyTo'] !== 'string' || message['replyTo'].length === 0)
  )
    return false;
  const preview = message['replyToPreview'];
  if (preview !== undefined && preview !== null) {
    if (typeof preview !== 'object') return false;
    const record = preview as Record<string, unknown>;
    if (!isChannelMessageAuthor(record['author']) || typeof record['body'] !== 'string')
      return false;
  }
  const external = message['external'];
  if (external !== undefined) {
    if (typeof external !== 'object' || external === null) return false;
    const record = external as Record<string, unknown>;
    if (typeof record['id'] !== 'string' || record['id'].length === 0) return false;
    if (record['thread'] !== undefined && typeof record['thread'] !== 'string') return false;
  }
  return true;
}
