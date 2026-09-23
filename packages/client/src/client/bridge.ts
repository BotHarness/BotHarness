import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type {
  ActivitySnapshot,
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
  return {
    id,
    type,
    name,
    members: stringArray(record['members']),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
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
  return {
    id,
    at,
    author,
    body,
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
  return {
    sessionId,
    purpose,
    activity,
    createdAt,
    updatedAt,
    ...(latestReport === undefined ? {} : { latestReport }),
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

const ACTIVITY_STATES = new Set(['idle', 'thinking', 'working', 'waiting', 'blocked']);

export function parseActivitySnapshot(value: unknown): ActivitySnapshot | undefined {
  const record = asRecord(value);
  const generation = record?.['generation'];
  const revision = record?.['revision'];
  const rawBots = record?.['bots'];
  if (
    typeof generation !== 'string' ||
    generation.length === 0 ||
    typeof revision !== 'number' ||
    !Number.isSafeInteger(revision) ||
    revision < 0 ||
    !Array.isArray(rawBots)
  )
    return undefined;
  const bots: ActivitySnapshot['bots'][number][] = [];
  const seen = new Set<string>();
  for (const value of rawBots) {
    const bot = asRecord(value);
    const slug = bot?.['slug'];
    const state = bot?.['state'];
    if (
      typeof slug !== 'string' ||
      slug.length === 0 ||
      seen.has(slug) ||
      typeof state !== 'string' ||
      !ACTIVITY_STATES.has(state)
    )
      return undefined;
    seen.add(slug);
    bots.push({ slug, state: state as ActivitySnapshot['bots'][number]['state'] });
  }
  return { generation, revision, bots };
}

export async function loadActivitySnapshot(
  call: BridgeCall,
  signal?: AbortSignal,
): Promise<ActivitySnapshot> {
  const snapshot = parseActivitySnapshot(await unwrap(call, 'activitySnapshot', {}, signal));
  if (snapshot === undefined) throw new Error('invalid activitySnapshot response');
  return snapshot;
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
    },
    signal,
  );
  const message = parseChannelMessage(asRecord(value)?.['message']);
  if (message === undefined) throw new Error('invalid channelSend response');
  return message;
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
