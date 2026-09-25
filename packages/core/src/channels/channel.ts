import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ToolApprovalDecision, ToolApprovalRequestCard } from '../workspaces/tool-approval.js';
import type { ChannelQuestionRequest, ChannelQuestionResolution } from './user-questions.js';

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

export interface SessionFailureCard {
  role: 'orchestrator' | 'assignment';
  sessionId: string;
  code?: string;
  status?: number;
  detail: string;
  context?: string;
}

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;
  /** Exact Human-selected branch from the Memory UI; opens a coordination turn. */
  memorySwitchTarget?: string;
  /** Durable Host-authored request to authorize a folder for this PersonaBot. */
  grantRequest?: true;
  /** One exact live DSH tool call waiting for Human approval. */
  toolApprovalRequest?: ToolApprovalRequestCard;
  /** Human-facing projection of a failed DSH Session turn. */
  sessionFailure?: SessionFailureCard;
  /** Human's durable decision; the DSH approval itself remains one-shot and live. */
  toolApprovalDecision?: ToolApprovalDecision;
  /** Native DSH user question awaiting a Human answer in this DM. */
  userQuestionRequest?: ChannelQuestionRequest;
  /** Durable answer or cancellation for one native question request. */
  userQuestionResolution?: ChannelQuestionResolution;
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
  const switchTarget = message['memorySwitchTarget'];
  if (
    switchTarget !== undefined &&
    (typeof switchTarget !== 'string' ||
      switchTarget.length === 0 ||
      switchTarget.length > 255 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human')
  )
    return false;
  if (
    message['grantRequest'] !== undefined &&
    (message['grantRequest'] !== true ||
      !isChannelMessageAuthor(message['author']) ||
      (message['author'] as ChannelMessageAuthor).kind !== 'bot')
  )
    return false;
  const toolRequest = message['toolApprovalRequest'];
  if (toolRequest !== undefined) {
    if (
      typeof toolRequest !== 'object' ||
      toolRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = toolRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return false;
  }
  const failure = message['sessionFailure'];
  if (failure !== undefined) {
    if (
      typeof failure !== 'object' ||
      failure === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const notice = failure as Record<string, unknown>;
    if (
      (notice['role'] !== 'orchestrator' && notice['role'] !== 'assignment') ||
      typeof notice['sessionId'] !== 'string' ||
      notice['sessionId'].length === 0 ||
      typeof notice['detail'] !== 'string' ||
      notice['detail'].length === 0 ||
      (notice['code'] !== undefined && typeof notice['code'] !== 'string') ||
      (notice['status'] !== undefined && typeof notice['status'] !== 'number') ||
      (notice['context'] !== undefined && typeof notice['context'] !== 'string')
    )
      return false;
  }
  const toolDecision = message['toolApprovalDecision'];
  if (toolDecision !== undefined) {
    if (
      typeof toolDecision !== 'object' ||
      toolDecision === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const decision = toolDecision as Record<string, unknown>;
    if (
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      message['replyTo'] !== decision['requestMessageId']
    )
      return false;
  }
  const questionRequest = message['userQuestionRequest'];
  if (questionRequest !== undefined) {
    if (
      typeof questionRequest !== 'object' ||
      questionRequest === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
    const request = questionRequest as Record<string, unknown>;
    if (
      typeof request['sessionId'] !== 'string' ||
      request['sessionId'].length === 0 ||
      !Array.isArray(request['questions']) ||
      request['questions'].length === 0 ||
      request['questions'].length > 3 ||
      !request['questions'].every((value) => {
        if (typeof value !== 'object' || value === null) return false;
        const item = value as Record<string, unknown>;
        return (
          typeof item['id'] === 'string' &&
          typeof item['question'] === 'string' &&
          (item['detail'] === undefined || typeof item['detail'] === 'string') &&
          (item['header'] === undefined || typeof item['header'] === 'string') &&
          (item['multiSelect'] === undefined || typeof item['multiSelect'] === 'boolean') &&
          (item['options'] === undefined ||
            (Array.isArray(item['options']) &&
              item['options'].every((option) => {
                if (typeof option !== 'object' || option === null) return false;
                const row = option as Record<string, unknown>;
                return (
                  typeof row['label'] === 'string' &&
                  (row['description'] === undefined || typeof row['description'] === 'string')
                );
              })))
        );
      })
    )
      return false;
  }
  const questionResolution = message['userQuestionResolution'];
  if (questionResolution !== undefined) {
    if (typeof questionResolution !== 'object' || questionResolution === null) return false;
    const resolution = questionResolution as Record<string, unknown>;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      message['replyTo'] !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled') ||
      (resolution['state'] === 'answered' &&
        ((message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
          !Array.isArray(resolution['answers']))) ||
      (resolution['state'] === 'cancelled' &&
        (message['author'] as ChannelMessageAuthor)?.kind !== 'bot')
    )
      return false;
  }
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
