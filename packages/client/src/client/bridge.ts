import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type {
  AssignmentDetail,
  AssignmentReport,
  AssignmentReportState,
  AssignmentSummary,
  BotSummary,
  ChannelAuthor,
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelSummary,
  SessionSummary,
  UserQuestionAnswerItem,
} from './store.js';
import {
  parseRosterSection,
  parseRosterSnapshot,
  type RosterSection,
  type RosterSnapshot,
  type TopOrderEntry,
} from './roster.js';

/** Failure carrying the Host's stable bridge error code. */
export class BridgeCallError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'BridgeCallError';
  }
}

export interface BridgeRpc {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionRpcResult<unknown>>;
}

export type BridgeCall = (
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
) => Promise<ConnectionRpcResult<unknown>>;

export interface CreatePersonaBotInput {
  displayName: string;
  roles: string[];
  description?: string;
}

export function connectionRpc(ctx: ClientContext): BridgeRpc | undefined {
  const candidate = (ctx as unknown as { connection?: { rpc?: BridgeRpc } }).connection;
  return candidate?.rpc;
}

function remoteArgs(payload: Record<string, unknown>): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== undefined) args[key] = value;
  }
  return args;
}

/**
 * Call the Host bridge through the shared `/api` channel.
 *
 * The api-gateway owns `/api` and reads Typert payloads as `{ args: { …named
 * arguments } }`; `undefined` fields are dropped because the wire decoder
 * rejects them.
 */
export function createBridgeCall(ctx: ClientContext): BridgeCall {
  return async (endpoint, payload, signal) => {
    const rpc = connectionRpc(ctx);
    if (rpc === undefined) {
      return {
        ok: false,
        error: { code: 'unavailable', message: 'Connection RPC is not available', details: {} },
      };
    }
    return rpc.call('/api', `botharness/${endpoint}`, { args: remoteArgs(payload) }, signal);
  };
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

async function unwrap(
  call: BridgeCall,
  endpoint: string,
  payload: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<unknown> {
  const result = await call(endpoint, payload, signal);
  if (!result.ok) throw new BridgeCallError(result.error.code, result.error.message);
  return result.value;
}

export function parseBotSummary(value: unknown): BotSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const slug = record['slug'];
  const displayName = record['displayName'];
  if (typeof slug !== 'string' || slug.length === 0 || typeof displayName !== 'string') {
    return undefined;
  }
  const aggregateState = record['aggregateState'];
  const createdAt = record['createdAt'];
  const roles = stringArray(record['roles']);
  const legacyTag = record['tag'];
  const description = record['description'];
  const avatar = record['avatar'];
  return {
    slug,
    displayName,
    aggregateState: typeof aggregateState === 'string' ? aggregateState : 'idle',
    workspaces: stringArray(record['workspaces']),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    roles: roles.length > 0 ? roles : typeof legacyTag === 'string' ? [legacyTag] : [],
    ...(typeof description === 'string' ? { description } : {}),
    ...(typeof avatar === 'string' ? { avatar } : {}),
    ...(typeof record['paused'] === 'boolean' ? { paused: record['paused'] } : {}),
  };
}

export function parseBotSummaries(value: unknown): BotSummary[] {
  const bots = asRecord(value)?.['bots'];
  if (!Array.isArray(bots)) return [];
  return bots.flatMap((entry) => {
    const bot = parseBotSummary(entry);
    return bot === undefined ? [] : [bot];
  });
}

export function parseChannelRecord(value: unknown): ChannelSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const type = record['type'];
  const name = record['name'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (type !== 'dm' && type !== 'group') return undefined;
  if (typeof name !== 'string') return undefined;
  const botSlug = record['botSlug'];
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  const latestMessage = parseChannelMessage(record['latestMessage']);
  const invitations = Array.isArray(record['invitations'])
    ? record['invitations'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['targetBotSlug'] !== 'string' ||
          typeof item['inviterBotSlug'] !== 'string' ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            targetBotSlug: item['targetBotSlug'],
            inviterBotSlug: item['inviterBotSlug'],
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['respondedAt'] === 'string'
              ? { respondedAt: item['respondedAt'] }
              : {}),
          },
        ];
      })
    : undefined;
  return {
    id,
    type,
    name,
    members: stringArray(record['members']),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
    ...(typeof record['ownerBotSlug'] === 'string' ? { ownerBotSlug: record['ownerBotSlug'] } : {}),
    ...(invitations === undefined ? {} : { invitations }),
    ...(latestMessage === undefined ? {} : { latestMessage }),
  };
}

export function parseChannelRecords(value: unknown): ChannelSummary[] {
  const channels = asRecord(value)?.['channels'];
  if (!Array.isArray(channels)) return [];
  return channels.flatMap((entry) => {
    const channel = parseChannelRecord(entry);
    return channel === undefined ? [] : [channel];
  });
}

function parseAuthor(value: unknown): ChannelAuthor | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  switch (record['kind']) {
    case 'human':
      return { kind: 'human' };
    case 'bot':
      return typeof record['slug'] === 'string' && record['slug'].length > 0
        ? { kind: 'bot', slug: record['slug'] }
        : undefined;
    case 'bridged':
      return typeof record['source'] === 'string' && record['source'].length > 0
        ? { kind: 'bridged', source: record['source'] }
        : undefined;
    default:
      return undefined;
  }
}

export function parseChannelAttachment(value: unknown): ChannelAttachmentRef | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const { hash, name, mime, size } = record;
  if (
    typeof hash !== 'string' ||
    !/^sha256:[0-9a-f]{64}$/u.test(hash) ||
    typeof name !== 'string' ||
    name.length === 0 ||
    name.length > 180 ||
    /[/\\\u0000-\u001f\u007f]/u.test(name) ||
    typeof mime !== 'string' ||
    !/^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(mime) ||
    typeof size !== 'number' ||
    !Number.isSafeInteger(size) ||
    size < 0
  )
    return undefined;
  return { hash, name, mime, size };
}

export function channelAttachmentUrl(ref: ChannelAttachmentRef): string {
  return `/api/botharness/attachment?hash=${encodeURIComponent(ref.hash)}&name=${encodeURIComponent(ref.name)}`;
}

export async function uploadChannelAttachment(
  file: File,
  signal?: AbortSignal,
): Promise<ChannelAttachmentRef> {
  const response = await fetch(
    `/api/botharness/attachment/upload?name=${encodeURIComponent(file.name)}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/octet-stream' },
      body: file,
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    },
  );
  if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  const payload = asRecord(await response.json());
  const ref = parseChannelAttachment(payload?.['attachment']);
  if (ref === undefined) throw new Error('Invalid attachment upload response');
  return ref;
}

export function parseChannelMessage(value: unknown): ChannelMessage | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const id = record['id'];
  const at = record['at'];
  const body = record['body'];
  if (typeof id !== 'string' || id.length === 0) return undefined;
  if (typeof at !== 'string' || at.length === 0) return undefined;
  if (typeof body !== 'string') return undefined;
  const author = parseAuthor(record['author']);
  if (author === undefined) return undefined;
  const memorySwitchTarget = record['memorySwitchTarget'];
  if (
    memorySwitchTarget !== undefined &&
    (author.kind !== 'human' ||
      typeof memorySwitchTarget !== 'string' ||
      memorySwitchTarget.length === 0 ||
      memorySwitchTarget.length > 255)
  )
    return undefined;
  const grantRequest = record['grantRequest'];
  if (grantRequest !== undefined && (grantRequest !== true || author.kind !== 'bot'))
    return undefined;
  let toolApprovalRequest: ChannelMessage['toolApprovalRequest'];
  if (record['toolApprovalRequest'] !== undefined) {
    const request = asRecord(record['toolApprovalRequest']);
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      typeof request['callId'] !== 'string' ||
      typeof request['toolName'] !== 'string' ||
      typeof request['cwd'] !== 'string' ||
      typeof request['input'] !== 'string' ||
      (request['role'] !== 'orchestrator' && request['role'] !== 'assignment')
    )
      return undefined;
    toolApprovalRequest = {
      sessionId: request['sessionId'],
      callId: request['callId'],
      toolName: request['toolName'],
      role: request['role'],
      cwd: request['cwd'],
      input: request['input'],
    };
  }
  let userQuestionRequest: ChannelMessage['userQuestionRequest'];
  if (record['userQuestionRequest'] !== undefined) {
    const request = asRecord(record['userQuestionRequest']);
    const questions = request?.['questions'];
    if (
      request === undefined ||
      author.kind !== 'bot' ||
      typeof request['sessionId'] !== 'string' ||
      !Array.isArray(questions) ||
      questions.length === 0 ||
      questions.length > 3
    )
      return undefined;
    const parsed = questions.map((value) => {
      const item = asRecord(value);
      if (
        item === undefined ||
        typeof item['id'] !== 'string' ||
        typeof item['question'] !== 'string'
      )
        return undefined;
      const options = item['options'];
      if (
        options !== undefined &&
        (!Array.isArray(options) ||
          !options.every((option) => {
            const row = asRecord(option);
            return (
              row !== undefined &&
              typeof row['label'] === 'string' &&
              (row['description'] === undefined || typeof row['description'] === 'string')
            );
          }))
      )
        return undefined;
      return {
        id: item['id'],
        question: item['question'],
        ...(typeof item['detail'] === 'string' ? { detail: item['detail'] } : {}),
        ...(typeof item['header'] === 'string' ? { header: item['header'] } : {}),
        ...(item['multiSelect'] === true ? { multiSelect: true } : {}),
        ...(Array.isArray(options) ? { options } : {}),
      };
    });
    if (parsed.some((item) => item === undefined)) return undefined;
    userQuestionRequest = {
      sessionId: request['sessionId'],
      questions: parsed as NonNullable<ChannelMessage['userQuestionRequest']>['questions'],
    };
  }
  let sessionFailure: ChannelMessage['sessionFailure'];
  if (record['sessionFailure'] !== undefined) {
    const failure = asRecord(record['sessionFailure']);
    if (
      failure === undefined ||
      author.kind !== 'bot' ||
      (failure['role'] !== 'orchestrator' && failure['role'] !== 'assignment') ||
      typeof failure['sessionId'] !== 'string' ||
      typeof failure['detail'] !== 'string' ||
      (failure['code'] !== undefined && typeof failure['code'] !== 'string') ||
      (failure['status'] !== undefined && typeof failure['status'] !== 'number') ||
      (failure['context'] !== undefined && typeof failure['context'] !== 'string')
    )
      return undefined;
    sessionFailure = {
      role: failure['role'],
      sessionId: failure['sessionId'],
      detail: failure['detail'],
      ...(typeof failure['code'] === 'string' ? { code: failure['code'] } : {}),
      ...(typeof failure['status'] === 'number' ? { status: failure['status'] } : {}),
      ...(typeof failure['context'] === 'string' ? { context: failure['context'] } : {}),
    };
  }
  let botDmAction: ChannelMessage['botDmAction'];
  if (record['botDmAction'] !== undefined) {
    const action = asRecord(record['botDmAction']);
    if (
      action === undefined ||
      author.kind !== 'bot' ||
      typeof action['channelId'] !== 'string' ||
      typeof action['messageId'] !== 'string' ||
      typeof action['recipientBotSlug'] !== 'string'
    )
      return undefined;
    botDmAction = {
      channelId: action['channelId'],
      messageId: action['messageId'],
      recipientBotSlug: action['recipientBotSlug'],
    };
  }
  const rawAttachments = record['attachments'];
  const attachments = Array.isArray(rawAttachments)
    ? rawAttachments.map(parseChannelAttachment)
    : undefined;
  if (
    rawAttachments !== undefined &&
    (attachments === undefined ||
      attachments.length > 10 ||
      attachments.some((entry) => entry === undefined))
  )
    return undefined;
  const format = record['format'];
  if (format !== undefined && format !== 'markdown' && format !== 'text') return undefined;
  const replyTo = record['replyTo'];
  if (replyTo !== undefined && (typeof replyTo !== 'string' || replyTo.length === 0))
    return undefined;
  let toolApprovalDecision: ChannelMessage['toolApprovalDecision'];
  if (record['toolApprovalDecision'] !== undefined) {
    const decision = asRecord(record['toolApprovalDecision']);
    if (
      decision === undefined ||
      author.kind !== 'human' ||
      typeof decision['requestMessageId'] !== 'string' ||
      (decision['outcome'] !== 'allowed-once' &&
        decision['outcome'] !== 'allowed-always-exact' &&
        decision['outcome'] !== 'allowed-always-all' &&
        decision['outcome'] !== 'rejected') ||
      replyTo !== decision['requestMessageId']
    )
      return undefined;
    toolApprovalDecision = {
      requestMessageId: decision['requestMessageId'],
      outcome: decision['outcome'],
    };
  }
  let userQuestionResolution: ChannelMessage['userQuestionResolution'];
  if (record['userQuestionResolution'] !== undefined) {
    const resolution = asRecord(record['userQuestionResolution']);
    if (
      resolution === undefined ||
      typeof resolution['requestMessageId'] !== 'string' ||
      replyTo !== resolution['requestMessageId'] ||
      (resolution['state'] !== 'answered' && resolution['state'] !== 'cancelled')
    )
      return undefined;
    if (resolution['state'] === 'answered') {
      if (author.kind !== 'human' || !Array.isArray(resolution['answers'])) return undefined;
      const answers = resolution['answers'] as unknown[];
      if (
        !answers.every((value) => {
          const item = asRecord(value);
          return (
            item !== undefined &&
            typeof item['id'] === 'string' &&
            Array.isArray(item['selected']) &&
            item['selected'].every((label) => typeof label === 'string') &&
            (item['custom'] === undefined || typeof item['custom'] === 'string')
          );
        })
      )
        return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'answered',
        answers: answers as UserQuestionAnswerItem[],
      };
    } else {
      if (author.kind !== 'bot') return undefined;
      userQuestionResolution = {
        requestMessageId: resolution['requestMessageId'],
        state: 'cancelled',
      };
    }
  }
  const rawPreview = record['replyToPreview'];
  let replyToPreview: ChannelMessage['replyToPreview'];
  if (rawPreview === null) {
    replyToPreview = null;
  } else if (rawPreview !== undefined) {
    const preview = asRecord(rawPreview);
    if (preview === undefined || typeof preview['body'] !== 'string') return undefined;
    const previewAuthor = parseAuthor(preview['author']);
    if (previewAuthor === undefined) return undefined;
    replyToPreview = { author: previewAuthor, body: preview['body'] };
  }
  const mentions = record['mentions'];
  if (
    mentions !== undefined &&
    (!Array.isArray(mentions) ||
      mentions.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const deliveries = record['deliveries'];
  if (
    deliveries !== undefined &&
    (!Array.isArray(deliveries) ||
      deliveries.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['botSlug'] !== 'string' ||
          !['pending', 'running', 'retryable', 'needs-repair', 'handled'].includes(
            String(item['state']),
          )
        );
      }))
  )
    return undefined;
  return {
    id,
    at,
    author,
    body,
    ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
    ...(mentions === undefined
      ? {}
      : { mentions: mentions as NonNullable<ChannelMessage['mentions']> }),
    ...(deliveries === undefined
      ? {}
      : { deliveries: deliveries as NonNullable<ChannelMessage['deliveries']> }),
    ...(grantRequest === true ? { grantRequest: true as const } : {}),
    ...(botDmAction === undefined ? {} : { botDmAction }),
    ...(toolApprovalRequest === undefined ? {} : { toolApprovalRequest }),
    ...(sessionFailure === undefined ? {} : { sessionFailure }),
    ...(toolApprovalDecision === undefined ? {} : { toolApprovalDecision }),
    ...(userQuestionRequest === undefined ? {} : { userQuestionRequest }),
    ...(userQuestionResolution === undefined ? {} : { userQuestionResolution }),
    ...(attachments === undefined ? {} : { attachments: attachments as ChannelAttachmentRef[] }),
    ...(format === undefined ? {} : { format }),
    ...(replyTo === undefined ? {} : { replyTo }),
    ...(replyToPreview === undefined ? {} : { replyToPreview }),
  };
}

export function parseChannelMessages(value: unknown): ChannelMessage[] {
  const messages = asRecord(value)?.['messages'];
  if (!Array.isArray(messages)) return [];
  return messages.flatMap((entry) => {
    const message = parseChannelMessage(entry);
    return message === undefined ? [] : [message];
  });
}

function parseAssignmentReport(value: unknown): AssignmentReport | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const state = record['state'];
  const summary = record['summary'];
  const at = record['at'];
  if (
    state !== 'completed' &&
    state !== 'blocked' &&
    state !== 'waiting-human' &&
    state !== 'failed'
  ) {
    return undefined;
  }
  if (typeof summary !== 'string' || summary.length === 0 || typeof at !== 'string') {
    return undefined;
  }
  return { state: state as AssignmentReportState, summary, at };
}

function parseAssignmentSummary(value: unknown): AssignmentSummary | undefined {
  const record = asRecord(value);
  if (record === undefined) return undefined;
  const sessionId = record['sessionId'];
  const purpose = record['purpose'];
  const activity = record['activity'];
  const createdAt = record['createdAt'];
  const updatedAt = record['updatedAt'];
  if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined;
  if (typeof purpose !== 'string' || purpose.length === 0) return undefined;
  if (activity !== 'working' && activity !== 'idle' && activity !== 'error') return undefined;
  if (typeof createdAt !== 'string' || typeof updatedAt !== 'string') return undefined;
  const latestReport = parseAssignmentReport(record['latestReport']);
  const permissionRecord = asRecord(record['permission']);
  const permission =
    permissionRecord !== undefined &&
    typeof permissionRecord['grantId'] === 'string' &&
    typeof permissionRecord['workspaceId'] === 'string' &&
    typeof permissionRecord['primaryCwd'] === 'string' &&
    (permissionRecord['mode'] === 'workspace-write' ||
      permissionRecord['mode'] === 'danger-full-access') &&
    permissionRecord['approval'] ===
      (permissionRecord['mode'] === 'workspace-write' ? 'ask' : 'never') &&
    typeof permissionRecord['presetRevision'] === 'number'
      ? {
          grantId: permissionRecord['grantId'],
          workspaceId: permissionRecord['workspaceId'],
          primaryCwd: permissionRecord['primaryCwd'],
          mode: permissionRecord['mode'] as 'workspace-write' | 'danger-full-access',
          approval: permissionRecord['approval'] as 'ask' | 'never',
          presetRevision: permissionRecord['presetRevision'] as number,
        }
      : undefined;
  return {
    sessionId,
    purpose,
    activity,
    createdAt,
    updatedAt,
    ...(latestReport === undefined ? {} : { latestReport }),
    ...(permission === undefined ? {} : { permission }),
  };
}

export function parseAssignmentSummaries(value: unknown): AssignmentSummary[] {
  const assignments = asRecord(value)?.['assignments'];
  if (!Array.isArray(assignments)) return [];
  return assignments.flatMap((entry) => {
    const assignment = parseAssignmentSummary(entry);
    return assignment === undefined ? [] : [assignment];
  });
}

export function parseAssignmentDetail(value: unknown): AssignmentDetail | undefined {
  const record = asRecord(value);
  const summary = parseAssignmentSummary(record);
  if (record === undefined || summary === undefined) return undefined;
  const botSlug = record['botSlug'];
  const sourceEventId = record['sourceEventId'];
  if (typeof botSlug !== 'string' || botSlug.length === 0) return undefined;
  if (typeof sourceEventId !== 'string' || sourceEventId.length === 0) return undefined;
  return { ...summary, botSlug, sourceEventId };
}

export function parseSessionSummaries(value: unknown): SessionSummary[] {
  const sessions = asRecord(value)?.['sessions'];
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((entry) => {
    const record = asRecord(entry);
    if (record === undefined) return [];
    const id = record['id'];
    const title = record['title'];
    const cwd = record['cwd'];
    const updatedAt = record['updatedAt'];
    if (typeof id !== 'string' || id.length === 0) return [];
    if (typeof cwd !== 'string' || cwd.length === 0) return [];
    return [
      {
        id,
        title: typeof title === 'string' ? title : '',
        cwd,
        updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
      },
    ];
  });
}

export async function loadBots(call: BridgeCall, signal?: AbortSignal): Promise<BotSummary[]> {
  return parseBotSummaries(await unwrap(call, 'list', {}, signal));
}

export async function createPersonaBot(
  call: BridgeCall,
  input: CreatePersonaBotInput,
  signal?: AbortSignal,
): Promise<BotSummary> {
  const value = await unwrap(call, 'create', { ...input }, signal);
  const bot = parseBotSummary(asRecord(value)?.['bot']);
  if (bot === undefined) throw new Error('invalid create response');
  return bot;
}

export async function loadChannels(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ChannelSummary[]> {
  return parseChannelRecords(await unwrap(call, 'channels', {}, signal));
}

export async function openDmChannel(
  call: BridgeCall,
  slug: string,
  displayName: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  const value = await unwrap(call, 'channelDm', { slug, displayName }, signal);
  const channel = parseChannelRecord(asRecord(value)?.['channel']);
  if (channel === undefined) throw new Error('invalid channelDm response');
  return channel;
}

export async function createGroupChannel(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<ChannelSummary> {
  const value = await unwrap(call, 'channelCreate', { name, members: [] }, signal);
  const channel = parseChannelRecord(asRecord(value)?.['channel']);

  if (channel === undefined) throw new Error('invalid channelCreate response');
  return channel;
}

export interface RenameChannelResult {
  channel: ChannelSummary;
  bot?: BotSummary;
}

export async function renameChannel(
  call: BridgeCall,
  channelId: string,
  name: string,
  signal?: AbortSignal,
): Promise<RenameChannelResult> {
  const value = asRecord(await unwrap(call, 'channelRename', { channelId, name }, signal));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelRename response');
  const bot = parseBotSummary(value?.['bot']);
  return { channel, ...(bot === undefined ? {} : { bot }) };
}

export async function cancelGroupInvitation(
  call: BridgeCall,
  channelId: string,
  invitationId: string,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupInviteCancel', { channelId, invitationId }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInviteCancel response');
  return channel;
}

export async function removeGroupMember(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupMemberRemove', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupMemberRemove response');
  return channel;
}

export async function deleteGroupChannel(call: BridgeCall, channelId: string): Promise<void> {
  await unwrap(call, 'channelGroupDelete', { channelId });
}

export async function loadChannelMessages(
  call: BridgeCall,
  channelId: string,
  signal?: AbortSignal,
): Promise<{ messages: ChannelMessage[]; revision: number }> {
  const value = await unwrap(call, 'channelMessages', { channelId }, signal);
  const revision = asRecord(value)?.['revision'];
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    throw new Error('invalid channelMessages revision');
  }
  return { messages: parseChannelMessages(value).reverse(), revision };
}
export interface TimelinePage {
  entries: ChannelMessage[];
  olderCursor: string | null;
  newerCursor: string | null;
  hasOlder: boolean;
  hasNewer: boolean;
}

export interface TimelinePageRequest {
  direction?: 'older' | 'newer' | 'around';
  cursor?: string;
  around?: string;
  limit?: number;
  olderLimit?: number;
  newerLimit?: number;
}

export async function loadTimelinePage(
  call: BridgeCall,
  channelId: string,
  request: TimelinePageRequest = {},
  signal?: AbortSignal,
): Promise<{ page: TimelinePage; revision: number }> {
  const response = asRecord(
    await unwrap(call, 'channelTimeline', { channelId, ...request }, signal),
  );
  const revision = response?.['revision'];
  const raw = asRecord(response?.['page']);
  const entries = raw?.['entries'];
  if (
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Array.isArray(entries) ||
    !entries.every((entry) => parseChannelMessage(entry) !== undefined) ||
    !(raw?.['olderCursor'] === null || typeof raw?.['olderCursor'] === 'string') ||
    !(raw?.['newerCursor'] === null || typeof raw?.['newerCursor'] === 'string') ||
    typeof raw?.['hasOlder'] !== 'boolean' ||
    typeof raw?.['hasNewer'] !== 'boolean'
  )
    throw new Error('invalid channelTimeline response');
  return {
    revision,
    page: {
      entries: entries.map((entry) => parseChannelMessage(entry)!),
      olderCursor: raw['olderCursor'] as string | null,
      newerCursor: raw['newerCursor'] as string | null,
      hasOlder: raw['hasOlder'],
      hasNewer: raw['hasNewer'],
    },
  };
}

/** The Host owns the profile-wide read anchor; the browser only renders it. */
export async function loadReadPosition(
  call: BridgeCall,
  channelId: string,
): Promise<string | undefined> {
  const value = asRecord(await unwrap(call, 'channelReadPosition', { channelId }));
  const position = value?.['position'];
  if (position === undefined) return undefined;
  const messageId = asRecord(position)?.['messageId'];
  if (typeof messageId !== 'string' || messageId.length === 0)
    throw new Error('invalid channelReadPosition response');
  return messageId;
}

export async function markReadPosition(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<void> {
  await unwrap(call, 'channelMarkRead', { channelId, messageId });
}

export async function sendChannelMessage(
  call: BridgeCall,
  channelId: string,
  body: string,
  replyTo?: string,
  attachments?: ChannelAttachmentRef[],
  messageId?: string,
  signal?: AbortSignal,
  memorySwitchTarget?: string,
  mentions?: ChannelMessage['mentions'],
): Promise<ChannelMessage> {
  const value = await unwrap(
    call,
    'channelSend',
    {
      channelId,
      body,
      ...(replyTo === undefined ? {} : { replyTo }),
      ...(attachments === undefined ? {} : { attachments }),
      ...(messageId === undefined ? {} : { messageId }),
      ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      ...(mentions === undefined ? {} : { mentions }),
    },
    signal,
  );
  const message = parseChannelMessage(asRecord(value)?.['message']);
  if (message === undefined) throw new Error('invalid channelSend response');
  return message;
}

export interface AssignmentAccessPresetView {
  botSlug: string;
  mode: 'workspace-write' | 'danger-full-access';
  revision: number;
  changedAt?: string;
}
export async function loadAssignmentAccess(
  call: BridgeCall,
  slug: string,
): Promise<AssignmentAccessPresetView> {
  const response = asRecord(await unwrap(call, 'assignmentAccessGet', { slug }));
  const preset = asRecord(response?.['preset']);
  if (
    preset?.['botSlug'] !== slug ||
    (preset['mode'] !== 'workspace-write' && preset['mode'] !== 'danger-full-access') ||
    typeof preset['revision'] !== 'number'
  )
    throw new Error('invalid assignmentAccessGet response');
  return preset as unknown as AssignmentAccessPresetView;
}
export async function setAssignmentAccess(
  call: BridgeCall,
  slug: string,
  mode: AssignmentAccessPresetView['mode'],
  acknowledgeRisk: boolean,
): Promise<AssignmentAccessPresetView> {
  const response = asRecord(
    await unwrap(call, 'assignmentAccessSet', { slug, mode, acknowledgeRisk }),
  );
  const preset = asRecord(response?.['preset']);
  if (preset?.['botSlug'] !== slug || preset['mode'] !== mode)
    throw new Error('invalid assignmentAccessSet response');
  return preset as unknown as AssignmentAccessPresetView;
}

export interface ToolApprovalRuleView {
  id: string;
  botSlug: string;
  role: 'orchestrator' | 'assignment';
  scopeKey: string;
  kind: 'exact' | 'all-opaque';
  toolName: string;
  input: string;
  createdAt: string;
  revokedAt?: string;
}
export async function loadToolApprovalRules(
  call: BridgeCall,
  slug: string,
): Promise<ToolApprovalRuleView[]> {
  const response = asRecord(await unwrap(call, 'toolApprovalRules', { slug }));
  const rules = response?.['rules'];
  if (!Array.isArray(rules)) throw new Error('invalid toolApprovalRules response');
  return rules as ToolApprovalRuleView[];
}
export async function revokeToolApprovalRule(
  call: BridgeCall,
  slug: string,
  id: string,
): Promise<void> {
  const response = asRecord(await unwrap(call, 'toolApprovalRuleRevoke', { slug, id }));
  if (asRecord(response?.['rule'])?.['id'] !== id)
    throw new Error('invalid toolApprovalRuleRevoke response');
}

export async function loadToolApprovalStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<'pending' | 'expired'> {
  const response = asRecord(await unwrap(call, 'toolApprovalStatus', { channelId, messageId }));
  const status = response?.['status'];
  if (status !== 'pending' && status !== 'expired') {
    throw new Error('invalid toolApprovalStatus response');
  }
  return status;
}

export async function decideToolApproval(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  outcome: 'allowed-once' | 'allowed-always-exact' | 'allowed-always-all' | 'rejected',
): Promise<void> {
  const response = asRecord(
    await unwrap(call, 'toolApprovalDecide', {
      channelId,
      messageId,
      outcome,
    }),
  );
  if (response?.['accepted'] !== true) throw new Error('Tool approval was not accepted');
}

export async function loadUserQuestionStatus(
  call: BridgeCall,
  channelId: string,
  messageId: string,
): Promise<'pending' | 'expired'> {
  const response = asRecord(await unwrap(call, 'userQuestionStatus', { channelId, messageId }));
  const status = response?.['status'];
  if (status !== 'pending' && status !== 'expired')
    throw new Error('invalid userQuestionStatus response');
  return status;
}

export async function answerUserQuestion(
  call: BridgeCall,
  channelId: string,
  messageId: string,
  answers: UserQuestionAnswerItem[],
): Promise<void> {
  const response = asRecord(
    await unwrap(call, 'userQuestionAnswer', { channelId, messageId, answer: { answers } }),
  );
  if (response?.['accepted'] !== true) throw new Error('Question answer was not accepted');
}

export interface WorkspaceOption {
  id: string;
  path: string;
  title: string;
}

export interface WorkspaceGrantView extends WorkspaceOption {
  botSlug: string;
  workspaceId: string;
  workspacePath: string;
  workspaceTitle: string;
  createdAt: string;
  revokedAt?: string;
}

function parseWorkspaceOption(value: unknown): WorkspaceOption | undefined {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['id'] !== 'string' ||
    typeof row['path'] !== 'string' ||
    typeof row['title'] !== 'string'
  )
    return undefined;
  return { id: row['id'], path: row['path'], title: row['title'] };
}

function parseWorkspaceGrant(value: unknown): WorkspaceGrantView | undefined {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['id'] !== 'string' ||
    typeof row['botSlug'] !== 'string' ||
    typeof row['workspaceId'] !== 'string' ||
    typeof row['workspacePath'] !== 'string' ||
    typeof row['workspaceTitle'] !== 'string' ||
    typeof row['createdAt'] !== 'string'
  )
    return undefined;
  return {
    id: row['id'],
    path: row['workspacePath'],
    title: row['workspaceTitle'],
    botSlug: row['botSlug'],
    workspaceId: row['workspaceId'],
    workspacePath: row['workspacePath'],
    workspaceTitle: row['workspaceTitle'],
    createdAt: row['createdAt'],
    ...(typeof row['revokedAt'] === 'string' ? { revokedAt: row['revokedAt'] } : {}),
  };
}

export async function loadWorkspaceOptions(call: BridgeCall): Promise<WorkspaceOption[]> {
  const rows = asRecord(await unwrap(call, 'workspaceOptions', {}))?.['workspaces'];
  if (!Array.isArray(rows)) throw new Error('invalid workspaceOptions response');
  return rows.flatMap((row) => {
    const parsed = parseWorkspaceOption(row);
    return parsed === undefined ? [] : [parsed];
  });
}

export async function loadWorkspaceGrants(
  call: BridgeCall,
  slug: string,
): Promise<WorkspaceGrantView[]> {
  const rows = asRecord(await unwrap(call, 'grants', { slug }))?.['grants'];
  if (!Array.isArray(rows)) throw new Error('invalid grants response');
  return rows.flatMap((row) => {
    const parsed = parseWorkspaceGrant(row);
    return parsed === undefined ? [] : [parsed];
  });
}

export async function createWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  workspaceId: string,
): Promise<WorkspaceGrantView> {
  const value = asRecord(await unwrap(call, 'grantCreate', { slug, workspaceId }))?.['grant'];
  const grant = parseWorkspaceGrant(value);
  if (grant === undefined) throw new Error('invalid grantCreate response');
  return grant;
}

export async function revokeWorkspaceGrant(
  call: BridgeCall,
  slug: string,
  grantId: string,
): Promise<WorkspaceGrantView> {
  const value = asRecord(await unwrap(call, 'grantRevoke', { slug, grantId }))?.['grant'];
  const grant = parseWorkspaceGrant(value);
  if (grant === undefined) throw new Error('invalid grantRevoke response');
  return grant;
}

export async function loadAssignments(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<AssignmentSummary[]> {
  return parseAssignmentSummaries(await unwrap(call, 'assignments', { slug }, signal));
}

export async function loadAssignment(
  call: BridgeCall,
  slug: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<AssignmentDetail> {
  const value = await unwrap(call, 'assignment', { slug, sessionId }, signal);
  const assignment = parseAssignmentDetail(asRecord(value)?.['assignment']);
  if (assignment === undefined) throw new Error('invalid assignment response');
  return assignment;
}

export async function loadSessions(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<SessionSummary[]> {
  return parseSessionSummaries(await unwrap(call, 'sessions', { slug }, signal));
}

export async function loadRoster(call: BridgeCall, signal?: AbortSignal): Promise<RosterSnapshot> {
  return parseRosterSnapshot(await unwrap(call, 'rosterGet', {}, signal));
}

/** One bounded, final-state roster mutation; the Host publishes one result. */
export interface RosterBatchInput {
  action: 'pin' | 'unpin' | 'hide' | 'move';
  channelIds: readonly string[];
  sectionId?: string;
}

export async function applyRosterBatch(
  call: BridgeCall,
  input: RosterBatchInput,
  signal?: AbortSignal,
): Promise<RosterSnapshot> {
  const payload = {
    action: input.action,
    channelIds: [...input.channelIds],
    ...(input.sectionId === undefined ? {} : { sectionId: input.sectionId }),
  };
  return parseRosterSnapshot(await unwrap(call, 'rosterBatch', payload, signal));
}

export async function createRosterSection(
  call: BridgeCall,
  name: string,
  signal?: AbortSignal,
): Promise<RosterSection> {
  const value = await unwrap(call, 'sectionCreate', { name }, signal);
  const section = parseRosterSection(asRecord(value)?.['section']);
  if (section === undefined) throw new Error('invalid sectionCreate response');
  return section;
}

export async function renameRosterSection(
  call: BridgeCall,
  sectionId: string,
  name: string,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionRename', { sectionId, name }, signal);
}

export async function removeRosterSection(
  call: BridgeCall,
  sectionId: string,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionRemove', { sectionId }, signal);
}

export async function assignRosterChannel(
  call: BridgeCall,
  channelId: string,
  sectionId: string | undefined,
  index?: number,
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'channelAssign', { channelId, sectionId, index }, signal);
}

export async function reorderRosterSections(
  call: BridgeCall,
  order: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'sectionReorder', { order }, signal);
}

export async function reorderTopOrder(
  call: BridgeCall,
  order: readonly TopOrderEntry[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'topReorder', { order }, signal);
}

export async function setRosterPins(
  call: BridgeCall,
  pins: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'pinsSet', { pins }, signal);
}

export async function setRosterHidden(
  call: BridgeCall,
  hidden: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  await unwrap(call, 'hiddenSet', { hidden }, signal);
}

export interface MemoryAcceptedCommit {
  botSlug: string;
  sha: string;
  parentSha: string | null;
  actorKind: 'agent' | 'human' | 'system';
  actorId: string;
  causeKind: 'source-event' | 'human-edit' | 'repository-init';
  causeId: string;
  validationResult: string;
  acceptedAt: string;
}

export interface MemoryGitCommit {
  sha: string;
  parents: string[];
  subject: string;
  authoredAt: string;
  branches: string[];
  status: 'accepted' | 'pending' | 'needs-repair';
}

export interface MemoryGitGraph {
  head: string;
  currentBranch: string | null;
  branches: string[];
  dirty: boolean;
  commits: MemoryGitCommit[];
  hasMore: boolean;
}

export interface MemoryGitCommitDiff {
  sha: string;
  files: { path: string; status: string }[];
  diff: string;
}

export interface MemoryRepairEvent {
  id: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  status: 'started' | 'completed';
  completedAt: string | null;
}

export interface MemorySnapshot {
  head: string | null;
  files: string[];
  provisional: boolean;
}

function parseMemoryCommit(value: unknown): MemoryAcceptedCommit {
  const row = asRecord(value);
  if (
    row === undefined ||
    typeof row['botSlug'] !== 'string' ||
    typeof row['sha'] !== 'string' ||
    !(row['parentSha'] === null || typeof row['parentSha'] === 'string') ||
    !['agent', 'human', 'system'].includes(String(row['actorKind'])) ||
    typeof row['actorId'] !== 'string' ||
    !['source-event', 'human-edit', 'repository-init'].includes(String(row['causeKind'])) ||
    typeof row['causeId'] !== 'string' ||
    typeof row['validationResult'] !== 'string' ||
    typeof row['acceptedAt'] !== 'string'
  )
    throw new Error('invalid accepted Memory Commit');
  return row as unknown as MemoryAcceptedCommit;
}

export async function loadMemorySnapshot(
  call: BridgeCall,
  channelId: string,
): Promise<MemorySnapshot> {
  const response = asRecord(await unwrap(call, 'memorySnapshot', { channelId }));
  const snapshot = asRecord(response?.['snapshot']);
  if (
    snapshot === undefined ||
    !(snapshot['head'] === null || typeof snapshot['head'] === 'string') ||
    !Array.isArray(snapshot['files']) ||
    !snapshot['files'].every((path) => typeof path === 'string') ||
    typeof snapshot['provisional'] !== 'boolean'
  )
    throw new Error('invalid Memory snapshot');
  return snapshot as unknown as MemorySnapshot;
}

export async function loadMemoryFile(
  call: BridgeCall,
  channelId: string,
  path: string,
): Promise<{ path: string; body: string; head: string } | undefined> {
  const response = asRecord(await unwrap(call, 'memoryFile', { channelId, path }));
  if (response?.['file'] === undefined) return undefined;
  const file = asRecord(response?.['file']);
  if (
    typeof file?.['path'] !== 'string' ||
    typeof file['body'] !== 'string' ||
    typeof file['head'] !== 'string'
  )
    throw new Error('invalid Memory file');
  return file as { path: string; body: string; head: string };
}

export async function loadMemoryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryAcceptedCommit[]> {
  const response = asRecord(await unwrap(call, 'memoryHistory', { channelId }));
  const commits = response?.['commits'];
  if (!Array.isArray(commits)) throw new Error('invalid Memory history');
  return commits.map(parseMemoryCommit);
}

export async function loadMemoryDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<string> {
  const response = asRecord(await unwrap(call, 'memoryDiff', { channelId, sha }));
  if (response?.['sha'] !== sha || typeof response['diff'] !== 'string') {
    throw new Error('invalid Memory diff');
  }
  return response['diff'];
}

export async function loadMemoryGitGraph(
  call: BridgeCall,
  channelId: string,
  offset: number,
): Promise<MemoryGitGraph> {
  const response = asRecord(await unwrap(call, 'memoryGitGraph', { channelId, offset }));
  if (
    typeof response?.['head'] !== 'string' ||
    !(response['currentBranch'] === null || typeof response['currentBranch'] === 'string') ||
    !Array.isArray(response['branches']) ||
    !response['branches'].every((value) => typeof value === 'string') ||
    typeof response['dirty'] !== 'boolean' ||
    typeof response['hasMore'] !== 'boolean' ||
    !Array.isArray(response['commits']) ||
    !response['commits'].every((value) => {
      const commit = asRecord(value);
      return (
        commit !== undefined &&
        typeof commit['sha'] === 'string' &&
        Array.isArray(commit['parents']) &&
        commit['parents'].every((item) => typeof item === 'string') &&
        typeof commit['subject'] === 'string' &&
        typeof commit['authoredAt'] === 'string' &&
        Array.isArray(commit['branches']) &&
        commit['branches'].every((item) => typeof item === 'string') &&
        ['accepted', 'pending', 'needs-repair'].includes(String(commit['status']))
      );
    })
  )
    throw new Error('invalid Memory Git graph');
  return response as unknown as MemoryGitGraph;
}

export async function loadMemoryGitCommitDiff(
  call: BridgeCall,
  channelId: string,
  sha: string,
): Promise<MemoryGitCommitDiff> {
  const response = asRecord(await unwrap(call, 'memoryGitCommitDiff', { channelId, sha }));
  if (
    response?.['sha'] !== sha ||
    typeof response['diff'] !== 'string' ||
    !Array.isArray(response['files']) ||
    !response['files'].every((value) => {
      const file = asRecord(value);
      return typeof file?.['path'] === 'string' && typeof file['status'] === 'string';
    })
  )
    throw new Error('invalid Memory Git commit diff');
  return response as unknown as MemoryGitCommitDiff;
}

export async function saveMemoryFile(
  call: BridgeCall,
  input: { channelId: string; path: string; body: string; expectedHead: string; editId: string },
): Promise<MemoryAcceptedCommit> {
  const response = asRecord(await unwrap(call, 'memorySave', input));
  return parseMemoryCommit(response?.['commit']);
}

export async function repairMemory(
  call: BridgeCall,
  input: { channelId: string; expectedHead: string; repairId: string },
): Promise<MemoryRepairEvent> {
  const response = asRecord(await unwrap(call, 'memoryRepair', input));
  const repair = asRecord(response?.['repair']);
  if (
    repair === undefined ||
    typeof repair['id'] !== 'string' ||
    typeof repair['acceptedHeadSha'] !== 'string' ||
    typeof repair['provisionalHeadSha'] !== 'string' ||
    typeof repair['backupPath'] !== 'string' ||
    repair['status'] !== 'completed' ||
    typeof repair['completedAt'] !== 'string'
  )
    throw new Error('invalid Memory repair result');
  return repair as unknown as MemoryRepairEvent;
}
