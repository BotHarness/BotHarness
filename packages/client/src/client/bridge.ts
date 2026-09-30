import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { ConnectionRpcResult } from '@deepseek-ai/dsh-client-connection/client';

import type {
  BotAttentionItem,
  BotAttentionPage,
  BotAttentionStatus,
  HumanAttentionItem,
  HumanAttentionPage,
  HumanInboxCategory,
  HumanInboxFilters,
  BotSummary,
  ChannelAuthor,
  ChannelAttachmentRef,
  ChannelMessage,
  ChannelSummary,
  OwnedSessionSummary,
  UserQuestionAnswerItem,
} from './store.js';
import {
  parseRosterSection,
  parseRosterSnapshot,
  type RosterSection,
  type RosterSnapshot,
  type TopOrderEntry,
} from './roster.js';

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

export interface ModelRouteView {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AssignmentModelOptionView {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
}

export interface ModelCatalogEntryView {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
}

export interface ModelPresetView {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRouteView;
  assignmentDefault: ModelRouteView;
  assignmentModels?: AssignmentModelOptionView[];
  createdAt: string;
}

export interface ModelPlanView {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRouteView;
  assignmentDefault: ModelRouteView;
  assignmentModels?: AssignmentModelOptionView[];
  appliedAt: string;
}

export async function loadModelCatalog(call: BridgeCall): Promise<ModelCatalogEntryView[]> {
  const value = asRecord(await unwrap(call, 'modelCatalog', {}));
  if (!Array.isArray(value?.['models'])) throw new Error('Invalid model catalog');
  return value['models'] as ModelCatalogEntryView[];
}

export async function loadModelPresets(call: BridgeCall): Promise<ModelPresetView[]> {
  const value = asRecord(await unwrap(call, 'modelPresets', {}));
  if (!Array.isArray(value?.['presets'])) throw new Error('Invalid Model Presets');
  return value['presets'] as ModelPresetView[];
}

export async function loadModelPlan(
  call: BridgeCall,
  slug: string,
): Promise<ModelPlanView | undefined> {
  const value = asRecord(await unwrap(call, 'modelPlan', { slug }));
  return value?.['plan'] as ModelPlanView | undefined;
}

export async function createModelPreset(
  call: BridgeCall,
  name: string,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
): Promise<ModelPresetView> {
  const value = asRecord(
    await unwrap(call, 'modelPresetCreate', { name, orchestrator, assignmentDefault }),
  );
  if (asRecord(value?.['preset']) === undefined) throw new Error('Invalid Model Preset result');
  return value!['preset'] as ModelPresetView;
}

export async function updateModelPreset(
  call: BridgeCall,
  id: string,
  expectedRevision: number,
  name: string,
  orchestrator: ModelRouteView,
  assignmentDefault: ModelRouteView,
): Promise<ModelPresetView> {
  const value = asRecord(
    await unwrap(call, 'modelPresetUpdate', {
      id,
      expectedRevision,
      name,
      orchestrator,
      assignmentDefault,
    }),
  );
  if (asRecord(value?.['preset']) === undefined) throw new Error('Invalid Model Preset result');
  return value!['preset'] as ModelPresetView;
}

export async function applyModelPreset(
  call: BridgeCall,
  slug: string,
  presetId: string,
): Promise<ModelPlanView> {
  const value = asRecord(await unwrap(call, 'modelPresetApply', { slug, presetId }));
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export async function customizeModelPlan(
  call: BridgeCall,
  slug: string,
  orchestrator: ModelRouteView,
): Promise<ModelPlanView> {
  const value = asRecord(await unwrap(call, 'modelPlanCustomize', { slug, orchestrator }));
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export async function setModelPlanAssignments(
  call: BridgeCall,
  slug: string,
  expectedRevision: number,
  assignmentDefault: ModelRouteView,
  assignmentModels: AssignmentModelOptionView[],
): Promise<ModelPlanView> {
  const value = asRecord(
    await unwrap(call, 'modelPlanAssignmentsSet', {
      slug,
      expectedRevision,
      assignmentDefault,
      assignmentModels,
    }),
  );
  if (asRecord(value?.['plan']) === undefined) throw new Error('Invalid Model Plan result');
  return value!['plan'] as ModelPlanView;
}

export interface CreatePersonaBotInput {
  displayName: string;
  roles: string[];
  description?: string;
  gitUrl?: string;
}

export interface BotSourcePolicyView {
  sourceClass:
    | 'human-dm'
    | 'bot-dm'
    | 'group-mention'
    | 'group-ordinary'
    | 'group-invite'
    | 'group-join-request'
    | 'group-join-decision'
    | 'assignment-report'
    | 'assignment-lifecycle';
  admission: 'admit';
  wake: 'immediate' | 'digest' | 'conditional' | 'mentions' | 'silent';
  delivery: 'steer' | 'turn';
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: { kind: 'built-in' | 'human' | 'template' } | { kind: 'bot'; botSlug: string };
  changedAt: string;
  overrideActive: boolean;
  recentWakeCount: number;
}

export type BotSourcePolicyEdit =
  | { sourceClass: 'assignment-report'; wake: 'conditional' | 'immediate' }
  | {
      sourceClass: 'group-ordinary';
      wake: 'immediate' | 'digest' | 'mentions' | 'silent';
      digestCount: number;
      digestIntervalSeconds: number;
    }
  | {
      sourceClass: 'human-dm' | 'bot-dm' | 'group-mention';
      wake: 'immediate';
      delivery: 'steer' | 'turn';
    };

export async function loadBotSourcePolicies(
  call: BridgeCall,
  slug: string,
): Promise<BotSourcePolicyView[]> {
  const result = asRecord(await unwrap(call, 'botSourcePolicies', { slug }));
  const raw = result?.['policies'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot source policies');
  return raw.map((entry): BotSourcePolicyView => {
    const policy = asRecord(entry);
    const actor = asRecord(policy?.['lastActor']);
    if (
      policy === undefined ||
      ![
        'human-dm',
        'bot-dm',
        'group-mention',
        'group-ordinary',
        'group-invite',
        'group-join-request',
        'group-join-decision',
        'assignment-report',
        'assignment-lifecycle',
      ].includes(String(policy?.['sourceClass'])) ||
      policy['admission'] !== 'admit' ||
      !['immediate', 'digest', 'conditional', 'mentions', 'silent'].includes(
        String(policy['wake']),
      ) ||
      typeof policy['revision'] !== 'number' ||
      !Number.isSafeInteger(policy['revision']) ||
      !['built-in', 'human', 'bot', 'template'].includes(String(actor?.['kind'])) ||
      (actor?.['kind'] === 'bot' && typeof actor['botSlug'] !== 'string') ||
      typeof policy['changedAt'] !== 'string' ||
      typeof policy['overrideActive'] !== 'boolean' ||
      !Number.isSafeInteger(policy['recentWakeCount']) ||
      (policy['recentWakeCount'] as number) < 0 ||
      (policy['wake'] === 'digest' &&
        (!Number.isSafeInteger(policy['digestCount']) ||
          !Number.isSafeInteger(policy['digestIntervalSeconds'])))
    )
      throw new Error('invalid Bot source policy');
    return policy as unknown as BotSourcePolicyView;
  });
}

export async function setBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  edit: BotSourcePolicyEdit,
): Promise<void> {
  await unwrap(call, 'botSourcePolicySet', { slug, ...edit });
}

export async function resetBotSourcePolicy(
  call: BridgeCall,
  slug: string,
  sourceClass: BotSourcePolicyEdit['sourceClass'],
): Promise<void> {
  await unwrap(call, 'botSourcePolicyReset', { slug, sourceClass });
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
          !(
            (typeof item['inviterBotSlug'] === 'string' && item['inviterHuman'] === undefined) ||
            (item['inviterBotSlug'] === undefined && item['inviterHuman'] === true)
          ) ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            targetBotSlug: item['targetBotSlug'],
            ...(typeof item['inviterBotSlug'] === 'string'
              ? { inviterBotSlug: item['inviterBotSlug'] }
              : { inviterHuman: true as const }),
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['respondedAt'] === 'string'
              ? { respondedAt: item['respondedAt'] }
              : {}),
          },
        ];
      })
    : undefined;
  const joinRequests = Array.isArray(record['joinRequests'])
    ? record['joinRequests'].flatMap((value: unknown) => {
        const item = asRecord(value);
        if (
          item === undefined ||
          typeof item['id'] !== 'string' ||
          typeof item['requesterBotSlug'] !== 'string' ||
          !['pending', 'accepted', 'declined', 'cancelled'].includes(String(item['status'])) ||
          typeof item['createdAt'] !== 'string'
        )
          return [];
        return [
          {
            id: item['id'],
            requesterBotSlug: item['requesterBotSlug'],
            status: item['status'] as 'pending' | 'accepted' | 'declined' | 'cancelled',
            createdAt: item['createdAt'],
            ...(typeof item['decidedAt'] === 'string' ? { decidedAt: item['decidedAt'] } : {}),
            ...(typeof item['decidedBy'] === 'string' ? { decidedBy: item['decidedBy'] } : {}),
          },
        ];
      })
    : undefined;
  const rawWakePolicies = asRecord(record['wakePolicies']);
  const wakePolicies =
    rawWakePolicies === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(rawWakePolicies).flatMap(([slug, raw]) => {
            const value = asRecord(raw);
            if (
              value === undefined ||
              (value['mode'] !== 'all' &&
                value['mode'] !== 'mentions' &&
                value['mode'] !== 'digest' &&
                value['mode'] !== 'silent') ||
              typeof value['count'] !== 'number' ||
              typeof value['intervalSeconds'] !== 'number' ||
              typeof value['revision'] !== 'number'
            )
              return [];
            return [
              [
                slug,
                {
                  mode: value['mode'] as 'all' | 'mentions' | 'digest' | 'silent',
                  count: value['count'],
                  intervalSeconds: value['intervalSeconds'],
                  revision: value['revision'],
                },
              ],
            ];
          }),
        );
  return {
    id,
    type,
    name,
    ...(type === 'group' && typeof record['avatar'] === 'string'
      ? { avatar: record['avatar'] }
      : {}),
    members: stringArray(record['members']),
    createdAt: typeof createdAt === 'string' ? createdAt : '',
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
    ...(typeof botSlug === 'string' ? { botSlug } : {}),
    ...(typeof record['ownerBotSlug'] === 'string' ? { ownerBotSlug: record['ownerBotSlug'] } : {}),
    ...(invitations === undefined ? {} : { invitations }),
    ...(joinRequests === undefined ? {} : { joinRequests }),
    ...(wakePolicies === undefined ? {} : { wakePolicies }),
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
    case 'system':
      return { kind: 'system' };
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
  let grantRequestResolution: ChannelMessage['grantRequestResolution'];
  if (record['grantRequestResolution'] !== undefined) {
    const resolution = asRecord(record['grantRequestResolution']);
    if (
      resolution === undefined ||
      author.kind !== 'human' ||
      typeof resolution['requestMessageId'] !== 'string' ||
      typeof resolution['grantId'] !== 'string' ||
      resolution['requestMessageId'].length === 0 ||
      resolution['grantId'].length === 0 ||
      record['replyTo'] !== resolution['requestMessageId']
    )
      return undefined;
    grantRequestResolution = {
      requestMessageId: resolution['requestMessageId'],
      grantId: resolution['grantId'],
    };
  }
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
  let memberDeparture: ChannelMessage['memberDeparture'];
  if (record['memberDeparture'] !== undefined) {
    const departure = asRecord(record['memberDeparture']);
    if (
      departure === undefined ||
      author.kind !== 'system' ||
      (departure['memberKind'] !== 'bot' && departure['memberKind'] !== 'human') ||
      typeof departure['memberId'] !== 'string' ||
      departure['memberId'].length === 0 ||
      typeof departure['displayName'] !== 'string' ||
      departure['displayName'].length === 0 ||
      (departure['departureType'] !== undefined &&
        departure['departureType'] !== 'left' &&
        departure['departureType'] !== 'removed')
    )
      return undefined;
    memberDeparture = {
      memberKind: departure['memberKind'],
      memberId: departure['memberId'],
      displayName: departure['displayName'],
      departureType: departure['departureType'] === 'removed' ? 'removed' : 'left',
    };
  } else if (author.kind === 'system') {
    return undefined;
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
  const channelRefs = record['channelRefs'];
  if (
    channelRefs !== undefined &&
    (!Array.isArray(channelRefs) ||
      channelRefs.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['channelId'] !== 'string' ||
          typeof item['label'] !== 'string' ||
          typeof item['start'] !== 'number' ||
          typeof item['end'] !== 'number'
        );
      }))
  )
    return undefined;
  const channelRevision = record['channelRevision'];
  if (
    channelRevision !== undefined &&
    (typeof channelRevision !== 'number' ||
      !Number.isSafeInteger(channelRevision) ||
      channelRevision < 1)
  )
    return undefined;
  const humanReceipts = record['humanReceipts'];
  if (
    humanReceipts !== undefined &&
    (!Array.isArray(humanReceipts) ||
      humanReceipts.some((entry) => {
        const item = asRecord(entry);
        return (
          item === undefined ||
          typeof item['humanId'] !== 'string' ||
          typeof item['displayName'] !== 'string' ||
          (item['state'] !== 'unread' && item['state'] !== 'read')
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
          ![
            'pending',
            'observed',
            'running',
            'retryable',
            'needs-repair',
            'handled',
            'ignored',
          ].includes(String(item['state']))
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
    ...(channelRefs === undefined
      ? {}
      : { channelRefs: channelRefs as NonNullable<ChannelMessage['channelRefs']> }),
    ...(deliveries === undefined
      ? {}
      : { deliveries: deliveries as NonNullable<ChannelMessage['deliveries']> }),
    ...(humanReceipts === undefined
      ? {}
      : { humanReceipts: humanReceipts as NonNullable<ChannelMessage['humanReceipts']> }),
    ...(channelRevision === undefined ? {} : { channelRevision }),
    ...(grantRequest === true ? { grantRequest: true as const } : {}),
    ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
    ...(botDmAction === undefined ? {} : { botDmAction }),
    ...(memberDeparture === undefined ? {} : { memberDeparture }),
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

export interface SessionBotOwner {
  botSlug: string;
  displayName: string;
  avatar?: string;
  role: 'orchestrator' | 'assignment';
}

export function parseSessionBotOwner(value: unknown): SessionBotOwner | undefined {
  const owner = asRecord(asRecord(value)?.['owner']);
  if (owner === undefined) return undefined;
  const botSlug = owner['botSlug'];
  const displayName = owner['displayName'];
  const role = owner['role'];
  if (typeof botSlug !== 'string' || botSlug.length === 0) return undefined;
  if (typeof displayName !== 'string' || displayName.length === 0) return undefined;
  if (role !== 'orchestrator' && role !== 'assignment') return undefined;
  const avatar = owner['avatar'];
  return {
    botSlug,
    displayName,
    ...(typeof avatar === 'string' && avatar.length > 0 ? { avatar } : {}),
    role,
  };
}

export function parseOwnedSessionSummaries(value: unknown): OwnedSessionSummary[] {
  const sessions = asRecord(value)?.['sessions'];
  if (!Array.isArray(sessions)) return [];
  return sessions.flatMap((entry) => {
    const record = asRecord(entry);
    if (record === undefined) return [];
    const sessionId = record['sessionId'];
    const role = record['role'];
    const createdAt = record['createdAt'];
    const activity = record['assignmentActivity'];
    const accessMode = record['assignmentAccessMode'];
    if (typeof sessionId !== 'string' || sessionId.length === 0) return [];
    if (role !== 'orchestrator' && role !== 'assignment') return [];
    if (typeof createdAt !== 'string' || !Number.isFinite(Date.parse(createdAt))) return [];
    if (
      activity !== undefined &&
      activity !== 'working' &&
      activity !== 'idle' &&
      activity !== 'error' &&
      activity !== 'stopping' &&
      activity !== 'stopped'
    )
      return [];
    const cwdReference = record['cwdReference'];
    return [
      {
        sessionId,
        role,
        createdAt,
        ...(typeof cwdReference === 'string' ? { cwdReference } : {}),
        ...(activity === undefined ? {} : { assignmentActivity: activity }),
        ...(role === 'assignment' &&
        (accessMode === 'workspace-write' || accessMode === 'danger-full-access')
          ? { assignmentAccessMode: accessMode }
          : {}),
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
  const value = await unwrap(
    call,
    input.gitUrl === undefined ? 'create' : 'createFromGit',
    { ...input },
    signal,
  );
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

export async function setGroupAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupAvatarSet', { channelId, avatar }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupAvatarSet response');
  return channel;
}

export async function setBotAvatar(
  call: BridgeCall,
  channelId: string,
  avatar: string | null,
): Promise<BotSummary> {
  const value = asRecord(await unwrap(call, 'botAvatarSet', { channelId, avatar }));
  const bot = parseBotSummary(value?.['bot']);
  if (bot === undefined) throw new Error('invalid botAvatarSet response');
  return bot;
}

export async function inviteGroupBot(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
): Promise<ChannelSummary> {
  const value = asRecord(await unwrap(call, 'channelGroupInvite', { channelId, botSlug }));
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupInvite response');
  return channel;
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

export async function decideGroupJoin(
  call: BridgeCall,
  channelId: string,
  requestId: string,
  accept: boolean,
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupJoinDecide', { channelId, requestId, accept }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupJoinDecide response');
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

export async function setGroupWakePolicy(
  call: BridgeCall,
  channelId: string,
  botSlug: string,
  policy: {
    mode: 'all' | 'mentions' | 'digest' | 'silent';
    count: number;
    intervalSeconds: number;
  },
): Promise<ChannelSummary> {
  const value = asRecord(
    await unwrap(call, 'channelGroupWakeSet', {
      channelId,
      botSlug,
      ...policy,
    }),
  );
  const channel = parseChannelRecord(value?.['channel']);
  if (channel === undefined) throw new Error('invalid channelGroupWakeSet response');
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
  channelRefs?: ChannelMessage['channelRefs'],
  grantRequestResolution?: ChannelMessage['grantRequestResolution'],
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
      ...(channelRefs === undefined ? {} : { channelRefs }),
      ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
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

function parseBotAttentionItem(value: unknown): BotAttentionItem | undefined {
  const row = asRecord(value);
  if (row === undefined) return undefined;
  const required = ['id', 'botSlug', 'reason', 'createdAt', 'sourceKind', 'summary'] as const;
  if (required.some((key) => typeof row[key] !== 'string')) return undefined;
  if (
    ![
      'pending',
      'processing',
      'observed',
      'deferred',
      'needs-repair',
      'handled',
      'ignored',
    ].includes(String(row['state']))
  )
    return undefined;
  if (!['human', 'bot', 'bridged', 'system'].includes(String(row['authorKind']))) return undefined;
  if (typeof row['sourceAvailable'] !== 'boolean') return undefined;
  for (const key of [
    'observedAt',
    'handledAt',
    'ignoredAt',
    'sourceChannelId',
    'sourceChannelName',
    'sourceMessageId',
    'assignmentSessionId',
    'assignmentPurpose',
    'authorBotSlug',
  ])
    if (row[key] !== undefined && typeof row[key] !== 'string') return undefined;
  if (
    row['assignmentReportState'] !== undefined &&
    !['progress', 'completed', 'blocked', 'waiting-human', 'failed'].includes(
      String(row['assignmentReportState']),
    )
  )
    return undefined;
  return row as unknown as BotAttentionItem;
}

export function parseBotAttentionPage(value: unknown): BotAttentionPage {
  const row = asRecord(value);
  const raw = row?.['items'];
  if (!Array.isArray(raw)) throw new Error('invalid Bot attention page');
  const items = raw.map(parseBotAttentionItem);
  if (items.some((item) => item === undefined)) throw new Error('invalid Bot attention item');
  const cursor = row?.['nextCursor'];
  if (cursor !== undefined && typeof cursor !== 'string')
    throw new Error('invalid Bot attention cursor');
  return {
    items: items as BotAttentionItem[],
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

export async function loadBotAttention(
  call: BridgeCall,
  slug: string,
  limit = 50,
  cursor?: string,
  state?: BotAttentionStatus,
): Promise<BotAttentionPage> {
  return parseBotAttentionPage(await unwrap(call, 'botAttention', { slug, limit, cursor, state }));
}

function parseHumanAttentionPage(value: unknown): HumanAttentionPage {
  const row = asRecord(value);
  const raw = row?.['items'];
  if (!Array.isArray(raw)) throw new Error('invalid Human attention page');
  const items = raw.map((entry): HumanAttentionItem | undefined => {
    const item = asRecord(entry);
    if (item === undefined) return undefined;
    for (const key of ['id', 'createdAt', 'botSlug', 'summary'])
      if (typeof item[key] !== 'string') return undefined;
    if (item['category'] !== 'action' && item['category'] !== 'info') return undefined;
    if (
      item['kind'] !== 'group-join-request' &&
      item['kind'] !== 'user-question' &&
      item['kind'] !== 'tool-approval' &&
      item['kind'] !== 'workspace-grant-request' &&
      item['kind'] !== 'bot-dm-message' &&
      item['kind'] !== 'assignment-waiting-human' &&
      item['kind'] !== 'assignment-blocked' &&
      item['kind'] !== 'assignment-report' &&
      item['kind'] !== 'bot-message-needs-repair'
    )
      return undefined;
    if (item['channelId'] !== undefined && typeof item['channelId'] !== 'string') return undefined;
    if (item['channelName'] !== undefined && typeof item['channelName'] !== 'string')
      return undefined;
    if (
      item['kind'] === 'assignment-waiting-human' ||
      item['kind'] === 'assignment-blocked' ||
      item['kind'] === 'assignment-report'
        ? typeof item['assignmentSessionId'] !== 'string'
        : typeof item['channelId'] !== 'string' || typeof item['channelName'] !== 'string'
    )
      return undefined;
    if (
      item['assignmentSessionId'] !== undefined &&
      typeof item['assignmentSessionId'] !== 'string'
    )
      return undefined;
    if (item['sourceEventId'] !== undefined && typeof item['sourceEventId'] !== 'string')
      return undefined;
    if (
      (item['kind'] === 'assignment-report' || item['kind'] === 'bot-message-needs-repair') &&
      typeof item['sourceEventId'] !== 'string'
    )
      return undefined;
    if (item['requestId'] !== undefined && typeof item['requestId'] !== 'string') return undefined;
    if (item['messageId'] !== undefined && typeof item['messageId'] !== 'string') return undefined;
    return item as unknown as HumanAttentionItem;
  });
  if (items.some((item) => item === undefined)) throw new Error('invalid Human attention item');
  const cursor = row?.['nextCursor'];
  if (cursor !== undefined && typeof cursor !== 'string')
    throw new Error('invalid Human attention cursor');
  return {
    items: items as HumanAttentionItem[],
    ...(cursor === undefined ? {} : { nextCursor: cursor }),
  };
}

export async function loadHumanAttention(
  call: BridgeCall,
  category: HumanInboxCategory,
  limit = 50,
  cursor?: string,
  filters: HumanInboxFilters = { botSlug: undefined, channelId: undefined, sort: 'newest' },
): Promise<HumanAttentionPage> {
  return parseHumanAttentionPage(
    await unwrap(call, 'humanAttention', {
      category,
      limit,
      cursor,
      botSlug: filters.botSlug,
      channelId: filters.channelId,
      sort: filters.sort,
    }),
  );
}
export async function ignoreHumanAssignmentReport(
  call: BridgeCall,
  sourceEventId: string,
): Promise<void> {
  const response = asRecord(await unwrap(call, 'humanAttentionIgnore', { sourceEventId }));
  if (response?.['accepted'] !== true) throw new Error('Human attention decision was not accepted');
}

export async function loadSessionBotOwner(
  call: BridgeCall,
  sessionId: string,
  signal?: AbortSignal,
): Promise<SessionBotOwner | undefined> {
  return parseSessionBotOwner(await unwrap(call, 'sessionOwner', { sessionId }, signal));
}

export async function loadSessions(
  call: BridgeCall,
  slug: string,
  signal?: AbortSignal,
): Promise<OwnedSessionSummary[]> {
  return parseOwnedSessionSummaries(await unwrap(call, 'sessions', { slug }, signal));
}

export async function loadRoster(call: BridgeCall, signal?: AbortSignal): Promise<RosterSnapshot> {
  return parseRosterSnapshot(await unwrap(call, 'rosterGet', {}, signal));
}

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

export type MemoryWorkingKind = 'staged' | 'unstaged' | 'untracked' | 'current';
export interface MemoryWorkingChange {
  path: string;
  kind: MemoryWorkingKind;
  status: string;
}
export interface MemoryWorkingDiff extends MemoryWorkingChange {
  diff: string;
  binary: boolean;
}

export interface MemoryRecoveryCheckpoint {
  id: string;
  branch: string;
  head: string;
  indexTree: string;
  workingTree: string;
  origin: 'host-observation' | 'agent-session' | 'human-command';
  originId: string;
  causeKind: 'memory-scan' | 'source-event' | 'human-edit' | 'turn-abort' | 'human-restore';
  causeId: string;
  capturedAt: string;
}

export interface MemoryRepairEvent {
  id: string;
  acceptedHeadSha: string;
  provisionalHeadSha: string;
  backupPath: string;
  status: 'started' | 'completed';
  completedAt: string | null;
}

export interface ProfileActivityDay {
  day: string;
  count: number;
}

export interface ProfileActivityReasonDay extends ProfileActivityDay {
  reason: string;
}

export interface ProfileTokenBuckets {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface ProfileActivityTokensDay extends ProfileTokenBuckets {
  day: string;
}

export interface ProfileActivity {
  slug: string;
  weeks: number;
  since: string;
  today: string;
  events: ProfileActivityReasonDay[];
  memoryCommits: ProfileActivityDay[];
  tokens: ProfileActivityTokensDay[];
  tokenTotals: ProfileTokenBuckets;
}

export interface GroupProfileAuthorActivity {
  author: ChannelAuthor;
  total: number;
  days: ProfileActivityDay[];
}

export interface GroupProfileActivity {
  channelId: string;
  weeks: number;
  since: string;
  today: string;
  days: ProfileActivityDay[];
  authors: GroupProfileAuthorActivity[];
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
): Promise<{ path: string; body: string; head: string; binary?: boolean } | undefined> {
  const response = asRecord(await unwrap(call, 'memoryFile', { channelId, path }));
  if (response?.['file'] === undefined) return undefined;
  const file = asRecord(response?.['file']);
  if (
    typeof file?.['path'] !== 'string' ||
    typeof file['body'] !== 'string' ||
    typeof file['head'] !== 'string'
  )
    throw new Error('invalid Memory file');
  if (file['binary'] !== undefined && typeof file['binary'] !== 'boolean')
    throw new Error('invalid Memory file');
  return file as { path: string; body: string; head: string; binary?: boolean };
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

function isActivityDays(value: unknown): value is ProfileActivityDay[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => {
      const record = asRecord(entry);
      return typeof record?.['day'] === 'string' && typeof record['count'] === 'number';
    })
  );
}

function isTokenBuckets(value: unknown): value is ProfileTokenBuckets {
  const record = asRecord(value);
  return (
    record !== undefined &&
    typeof record['inputTokens'] === 'number' &&
    typeof record['outputTokens'] === 'number' &&
    typeof record['cacheReadTokens'] === 'number' &&
    typeof record['cacheWriteTokens'] === 'number'
  );
}

export async function loadProfileActivity(
  call: BridgeCall,
  channelId: string,
): Promise<ProfileActivity> {
  const response = asRecord(await unwrap(call, 'profileActivity', { channelId }));
  if (
    response === undefined ||
    typeof response['slug'] !== 'string' ||
    typeof response['weeks'] !== 'number' ||
    typeof response['since'] !== 'string' ||
    typeof response['today'] !== 'string' ||
    !isActivityDays(response['memoryCommits']) ||
    !Array.isArray(response['events']) ||
    !response['events'].every((value) => {
      const entry = asRecord(value);
      return (
        typeof entry?.['day'] === 'string' &&
        typeof entry['count'] === 'number' &&
        typeof entry['reason'] === 'string'
      );
    }) ||
    !Array.isArray(response['tokens']) ||
    !response['tokens'].every((value) => {
      const entry = asRecord(value);
      return typeof entry?.['day'] === 'string' && isTokenBuckets(entry);
    }) ||
    !isTokenBuckets(response['tokenTotals'])
  )
    throw new Error('invalid Profile activity');
  return response as unknown as ProfileActivity;
}

export async function loadGroupProfileActivity(
  call: BridgeCall,
  channelId: string,
): Promise<GroupProfileActivity> {
  const response = asRecord(await unwrap(call, 'groupProfileActivity', { channelId }));
  if (
    response === undefined ||
    response['channelId'] !== channelId ||
    typeof response['weeks'] !== 'number' ||
    typeof response['since'] !== 'string' ||
    typeof response['today'] !== 'string' ||
    !isActivityDays(response['days']) ||
    !Array.isArray(response['authors']) ||
    !response['authors'].every((value) => {
      const entry = asRecord(value);
      return (
        entry !== undefined &&
        parseAuthor(entry['author']) !== undefined &&
        typeof entry['total'] === 'number' &&
        isActivityDays(entry['days'])
      );
    })
  )
    throw new Error('invalid Group Profile activity');
  return response as unknown as GroupProfileActivity;
}

function parseWorkingChange(value: unknown, allowCurrent = false): MemoryWorkingChange {
  const change = asRecord(value);
  if (
    typeof change?.['path'] !== 'string' ||
    !['staged', 'unstaged', 'untracked', ...(allowCurrent ? ['current'] : [])].includes(
      String(change['kind']),
    ) ||
    typeof change['status'] !== 'string'
  )
    throw new Error('invalid Memory working change');
  return change as unknown as MemoryWorkingChange;
}

export async function loadMemoryWorkingChanges(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryWorkingChange[]> {
  const response = asRecord(await unwrap(call, 'memoryWorkingChanges', { channelId }));
  if (!Array.isArray(response?.['changes'])) throw new Error('invalid Memory working changes');
  return response['changes'].map((change: unknown) => parseWorkingChange(change));
}

export async function loadMemoryWorkingDiff(
  call: BridgeCall,
  channelId: string,
  path: string,
  kind: MemoryWorkingKind,
): Promise<MemoryWorkingDiff> {
  const response = asRecord(await unwrap(call, 'memoryWorkingDiff', { channelId, path, kind }));
  parseWorkingChange(response, true);
  if (
    response?.['path'] !== path ||
    response['kind'] !== kind ||
    typeof response['diff'] !== 'string' ||
    typeof response['binary'] !== 'boolean'
  )
    throw new Error('invalid Memory working diff');
  return response as unknown as MemoryWorkingDiff;
}

export async function loadMemoryRecoveryHistory(
  call: BridgeCall,
  channelId: string,
): Promise<MemoryRecoveryCheckpoint[]> {
  const response = asRecord(await unwrap(call, 'memoryRecoveryHistory', { channelId }));
  if (!Array.isArray(response?.['checkpoints'])) throw new Error('invalid Memory checkpoints');
  return response['checkpoints'].map((value: unknown) => {
    const point = asRecord(value);
    if (
      point === undefined ||
      typeof point['id'] !== 'string' ||
      typeof point['branch'] !== 'string' ||
      typeof point['head'] !== 'string' ||
      typeof point['indexTree'] !== 'string' ||
      typeof point['workingTree'] !== 'string' ||
      typeof point['origin'] !== 'string' ||
      typeof point['originId'] !== 'string' ||
      typeof point['causeKind'] !== 'string' ||
      typeof point['causeId'] !== 'string' ||
      typeof point['capturedAt'] !== 'string'
    )
      throw new Error('invalid Memory checkpoint');
    return point as unknown as MemoryRecoveryCheckpoint;
  });
}

export async function restoreMemoryCheckpoint(
  call: BridgeCall,
  input: { channelId: string; checkpointId: string; expectedCurrentId: string },
): Promise<{ checkpoint: MemoryRecoveryCheckpoint; archivePath: string }> {
  const response = asRecord(await unwrap(call, 'memoryRestore', input));
  const checkpoint = asRecord(response?.['checkpoint']);
  if (
    checkpoint === undefined ||
    typeof checkpoint['id'] !== 'string' ||
    typeof response?.['archivePath'] !== 'string'
  )
    throw new Error('invalid Memory restore result');
  return {
    checkpoint: checkpoint as unknown as MemoryRecoveryCheckpoint,
    archivePath: response['archivePath'] as string,
  };
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
