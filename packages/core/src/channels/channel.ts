import { createHash } from 'node:crypto';

import { isChannelAttachmentRef, type ChannelAttachmentRef } from '../attachments/ref.js';
import type { ToolApprovalDecision, ToolApprovalRequestCard } from '../workspaces/tool-approval.js';
import type { ChannelQuestionRequest, ChannelQuestionResolution } from './user-questions.js';

export type ChannelType = 'dm' | 'group';

/** Human-owned per-member notification choice for ordinary Group messages. */
export interface GroupWakePolicy {
  mode: 'mentions' | 'digest' | 'silent';
  count: number;
  intervalSeconds: number;
  revision: number;
}

export interface ChannelRecord {
  id: string;
  type: ChannelType;
  name: string;
  members: string[];
  botSlug?: string;
  /** A Bot creator may manage this Group; Human authority remains separate. */
  ownerBotSlug?: string;
  invitations?: GroupInvitation[];
  joinRequests?: GroupJoinRequest[];
  wakePolicies?: Record<string, GroupWakePolicy>;
  /** Human-only logical deletion keeps operational evidence durable. */
  deletedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupInvitation {
  id: string;
  targetBotSlug: string;
  /** The invited Bot incarnation; a recreated Bot cannot inherit a stale invite. */
  targetBotCreatedAt: string;
  inviterBotSlug: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  respondedAt?: string;
}

/** A nonmember Bot asks to join after a Human-selected #Group reference. */
export interface GroupJoinRequest {
  id: string;
  requesterBotSlug: string;
  requesterBotCreatedAt: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  createdAt: string;
  decidedAt?: string;
  decidedBy?: 'human' | string;
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

export interface ChannelMention {
  botSlug: string;
  label: string;
  start: number;
  end: number;
}

/** Human-selected #Group identity span; typed #text carries no authority. */
export interface ChannelReference {
  channelId: string;
  label: string;
  start: number;
  end: number;
}

export interface ChannelDelivery {
  botSlug: string;
  state: 'pending' | 'observed' | 'running' | 'retryable' | 'needs-repair' | 'handled' | 'ignored';
}

/** One committed send shown in the sender's Human DM without copying its body. */
export interface BotDmAction {
  channelId: string;
  messageId: string;
  recipientBotSlug: string;
}

/** Host-derived chain metadata. Never accept this from a browser or model argument. */
export interface BotMessageCausation {
  rootSourceEventId: string;
  parentSourceEventId: string;
  hop: number;
}

export interface ChannelMessage {
  id: string;
  at: string;
  author: ChannelMessageAuthor;
  body: string;
  /** Exact Human-selected branch from the Memory UI; opens a coordination turn. */
  memorySwitchTarget?: string;
  /** Selected identity spans; plain typed @names are never actionable. */
  mentions?: ChannelMention[];
  channelRefs?: ChannelReference[];
  /** Read-only projection from per-Bot Inbox Admissions. */
  deliveries?: ChannelDelivery[];
  botDmAction?: BotDmAction;
  botCausation?: BotMessageCausation;
  /** Durable Host-authored request to authorize a folder for this PersonaBot. */
  grantRequest?: true;
  /** Human response to this Bot's Grant request, backed by an active Workspace Grant. */
  grantRequestResolution?: { requestMessageId: string; grantId: string };
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

export const MAX_BOT_HOPS = 8;

export const CHANNEL_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_CHANNEL_SLUG_LENGTH = 64;

export function isValidChannelId(id: string): boolean {
  return id.length > 0 && CHANNEL_ID_PATTERN.test(id);
}

export function dmChannelId(botSlug: string): string {
  return `dm-${botSlug}`;
}

/** Ordered IDs avoid a second DM when the recipient replies. */
export function botDmChannelId(firstBotSlug: string, secondBotSlug: string): string {
  const pair = [firstBotSlug, secondBotSlug].sort();
  return `dm-bots-${createHash('sha256').update(JSON.stringify(pair)).digest('hex').slice(0, 32)}`;
}

export function isBotDmChannel(channel: ChannelRecord): boolean {
  return channel.type === 'dm' && channel.botSlug === undefined && channel.members.length === 2;
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
  const ownerBotSlug = record['ownerBotSlug'];
  if (ownerBotSlug !== undefined) {
    if (
      record['type'] !== 'group' ||
      typeof ownerBotSlug !== 'string' ||
      !members.includes(ownerBotSlug)
    )
      return false;
  }
  if (record['deletedAt'] !== undefined && typeof record['deletedAt'] !== 'string') return false;
  const wakePolicies = record['wakePolicies'];
  if (wakePolicies !== undefined) {
    if (record['type'] !== 'group' || typeof wakePolicies !== 'object' || wakePolicies === null)
      return false;
    for (const [slug, value] of Object.entries(wakePolicies)) {
      if (!members.includes(slug) || typeof value !== 'object' || value === null) return false;
      const policy = value as Record<string, unknown>;
      if (
        (policy['mode'] !== 'mentions' &&
          policy['mode'] !== 'digest' &&
          policy['mode'] !== 'silent') ||
        !Number.isSafeInteger(policy['count']) ||
        (policy['count'] as number) < 1 ||
        (policy['count'] as number) > 100 ||
        !Number.isSafeInteger(policy['intervalSeconds']) ||
        (policy['intervalSeconds'] as number) < 1 ||
        (policy['intervalSeconds'] as number) > 3600 ||
        !Number.isSafeInteger(policy['revision']) ||
        (policy['revision'] as number) < 1
      )
        return false;
    }
  }
  const invitations = record['invitations'];
  if (invitations !== undefined) {
    if (
      record['type'] !== 'group' ||
      !Array.isArray(invitations) ||
      !invitations.every((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const invite = item as Record<string, unknown>;
        return (
          typeof invite['id'] === 'string' &&
          typeof invite['targetBotSlug'] === 'string' &&
          typeof invite['targetBotCreatedAt'] === 'string' &&
          typeof invite['inviterBotSlug'] === 'string' &&
          ['pending', 'accepted', 'declined', 'cancelled'].includes(String(invite['status'])) &&
          typeof invite['createdAt'] === 'string' &&
          (invite['respondedAt'] === undefined || typeof invite['respondedAt'] === 'string')
        );
      })
    )
      return false;
  }
  const joinRequests = record['joinRequests'];
  if (joinRequests !== undefined) {
    if (
      record['type'] !== 'group' ||
      !Array.isArray(joinRequests) ||
      !joinRequests.every((item: unknown) => {
        if (typeof item !== 'object' || item === null) return false;
        const request = item as Record<string, unknown>;
        return (
          typeof request['id'] === 'string' &&
          typeof request['requesterBotSlug'] === 'string' &&
          typeof request['requesterBotCreatedAt'] === 'string' &&
          ['pending', 'accepted', 'declined', 'cancelled'].includes(String(request['status'])) &&
          typeof request['createdAt'] === 'string' &&
          (request['decidedAt'] === undefined || typeof request['decidedAt'] === 'string') &&
          (request['decidedBy'] === undefined || typeof request['decidedBy'] === 'string')
        );
      })
    )
      return false;
  }
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
  const grantResolution = message['grantRequestResolution'];
  if (grantResolution !== undefined) {
    if (
      typeof grantResolution !== 'object' ||
      grantResolution === null ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human'
    )
      return false;
    const resolution = grantResolution as Record<string, unknown>;
    if (
      typeof resolution['requestMessageId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['grantId'].length === 0 ||
      message['replyTo'] !== resolution['requestMessageId']
    )
      return false;
  }
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
  const mentions = message['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          typeof item.botSlug !== 'string' ||
          typeof item.label !== 'string' ||
          typeof item.start !== 'number' ||
          typeof item.end !== 'number' ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start,
      ))
  )
    return false;
  const channelRefs = message['channelRefs'];
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'human' ||
      channelRefs.some(
        (item) =>
          typeof item !== 'object' ||
          item === null ||
          !isValidChannelId(item.channelId) ||
          typeof item.label !== 'string' ||
          item.label.length === 0 ||
          !Number.isSafeInteger(item.start) ||
          !Number.isSafeInteger(item.end) ||
          item.start < 0 ||
          item.end <= item.start ||
          (message['body'] as string).slice(item.start, item.end) !== '#' + item.label,
      ))
  )
    return false;
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
  const botDmAction = message['botDmAction'];
  if (botDmAction !== undefined) {
    if (typeof botDmAction !== 'object' || botDmAction === null) return false;
    const action = botDmAction as Record<string, unknown>;
    if (
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string' ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
    )
      return false;
  }
  const botCausation = message['botCausation'];
  if (botCausation !== undefined) {
    if (typeof botCausation !== 'object' || botCausation === null) return false;
    const causal = botCausation as Record<string, unknown>;
    if (
      typeof causal['rootSourceEventId'] !== 'string' ||
      typeof causal['parentSourceEventId'] !== 'string' ||
      !Number.isSafeInteger(causal['hop']) ||
      (causal['hop'] as number) < 1 ||
      (message['author'] as ChannelMessageAuthor)?.kind !== 'bot'
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
