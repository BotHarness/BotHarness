import { personaBotActivitySnapshot, type PersonaBotActivitySnapshot } from '../state/bot-state.js';
import type { ExternalSource } from '../messaging/inbound.js';
import type {
  OutboundMessaging,
  MessagingSnapshot,
  MessagingGrant,
  OutboxIntent,
} from '../messaging/outbound.js';
import { MessagingError, type MessagingTarget } from '../messaging/provider.js';
import { OperationalDatabaseError } from '../database/owner.js';
import {
  AssignmentReplyTargetError,
  type HumanAssignmentContext,
} from '../runtime/assignment-human-context.js';
import { createMessageAttachmentFiles } from '../attachments/message-files.js';
import { attachmentIntent } from '../attachments/ref.js';
import type { AttachmentStore } from '../attachments/store.js';
import { randomUUID, createHash } from 'node:crypto';

import { z } from 'zod';

import {
  isValidChannelId,
  isGroupAvatar,
  type LocalHumanIdentity,
  type ChannelMention,
  type ChannelMessage,
  type ChannelRecord,
  type ChannelReference,
} from '../channels/channel.js';
import { BOT_AVATAR_PATH } from '../bots/avatar-http.js';
import { ChannelMentionTargetError, ChannelReplyTargetError } from '../channels/store.js';
import { ChannelAttachmentError } from '../attachments/store.js';
import { isChannelAttachmentRef } from '../attachments/ref.js';
import type { ChannelReadPosition, ChannelStore } from '../channels/store.js';
import { groupProfileActivity, type GroupProfileActivity } from '../channels/profile-activity.js';
import type { ChannelTimelinePage } from '../channels/timeline.js';
import type {
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
} from '../bots/persona-bot.js';
import { isPersonaBotAvatar } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { isValidSlug } from '../bots/slug.js';
import {
  MAX_ROSTER_BATCH_SIZE,
  RosterStore,
  RosterUnavailableError,
  RosterUnknownSectionError,
  type RosterSection,
  type RosterSnapshot,
} from '../roster/store.js';
import type { TopOrderEntry } from '../roster/spec.js';
import type { SessionOwnership, SessionRootRole } from '../sessions/ownership.js';
import {
  MemoryAcceptError,
  type MemoryAcceptedCommit,
  type MemoryAcceptedSnapshot,
  type MemoryGitGraph,
  type MemoryGitCommitDiff,
  type MemoryWorkingChange,
  type MemoryWorkingDiff,
  type MemoryWorkingKind,
  type MemoryRepairEvent,
} from '../memory/accepted.js';
import type { MemoryRecoveryCheckpoint } from '../memory/recovery.js';
import type { MemoryService } from '../memory/service.js';
import type { UsageProjection } from '../usage/usage.js';
import { usageFilterSchema, type UsageQueryResult } from '../usage/query.js';
import {
  isAssignmentModelOption,
  isModelRoute,
  validateAssignmentModels,
  type AssignmentModelOption,
  type ModelRoute,
  type ModelPreset,
  type ModelPresetStore,
  type PersonaBotModelPlan,
} from '../models/presets.js';
import type { ModelCatalog, ModelCatalogEntry } from '../models/catalog.js';
import type { ModelPlanState, ModelRouteReadiness } from '../models/readiness.js';
import { MemoryFileError, type MemoryFileTarget } from '../memory/file-actions.js';
import { MemoryPathError } from '../memory/jail.js';
import {
  WorkspaceGrantError,
  type WorkspaceGrant,
  type WorkspaceGrantStore,
} from '../workspaces/grants.js';
import type { ChannelToolApproval } from '../workspaces/tool-approval.js';
import type { ChannelUserQuestions } from '../channels/user-questions.js';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type { ToolApprovalRuleStore, ToolApprovalRule } from '../workspaces/tool-approval-rules.js';
import type {
  AssignmentAccessMode,
  AssignmentAccessStore,
  AssignmentAccessPreset,
} from '../workspaces/assignment-access.js';
import type {
  BotAttentionQuery,
  BotAttentionPage,
  BotAttentionState,
} from '../runtime/attention.js';
import type { BotSourcePolicy, BotSourcePolicyStore } from '../runtime/source-policy.js';
import type {
  HumanAttentionQuery,
  HumanAttentionDecisions,
  HumanAttentionPage,
  HumanAttentionCategory,
} from '../runtime/human-attention.js';
import type {
  AssignmentActivity,
  AssignmentDetail,
  AssignmentSummary,
  BotRuntime,
  DmAdmissionFailure,
} from '../runtime/bot-runtime.js';
import type {
  AggregatedState,
  BotStateSnapshot,
  BotStateTracker,
  SessionState,
} from '../state/bot-state.js';

export interface PersonaBotSummary {
  slug: string;
  displayName: string;
  roles: string[];
  description?: string;
  avatar?: string;
  paused?: boolean;
  aggregateState: AggregatedState;
  workspaces: string[];
  createdAt: string;
}

export interface PersonaBotDetail extends PersonaBotSummary {
  model?: string;
  modelPlan?: PersonaBotModelPlan;
  preset?: string;
  memoryDir?: string;
  sessions: Record<string, SessionState>;
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

export interface ProfileModelUsageRow {
  day: string;
  purpose: string;
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
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
  modelUsageRows: ProfileModelUsageRow[];
  modelUsageStatus: 'ready' | 'unavailable';
}

export interface ChannelListItem extends ChannelRecord {
  humanMembers?: Array<{ humanId: string; displayName: string }>;
  humanNickname?: string | null;
  latestMessage?: ChannelMessage;
}

export interface OwnedSessionSummary {
  sessionId: string;
  role: SessionRootRole;
  createdAt: string;
  cwdReference?: string;
  assignmentActivity?: AssignmentActivity;
  assignmentAccessMode?: AssignmentAccessMode;
}

export interface OwnedSessionBot {
  botSlug: string;
  displayName: string;
  avatar?: string;
  role: SessionRootRole;
}

export interface BridgeError {
  code: string;
  message: string;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export interface BridgeMethods {
  messagingReceive(payload: unknown): Promise<BridgeResult<{ updated: true }>>;
  messagingSource(payload: unknown): Promise<BridgeResult<{ source: ExternalSource }>>;
  messagingSnapshot(payload: unknown): Promise<BridgeResult<MessagingSnapshot>>;
  messagingTargets(payload: unknown): Promise<BridgeResult<{ targets: MessagingTarget[] }>>;
  messagingAuthorize(payload: unknown): Promise<BridgeResult<{ grant: MessagingGrant }>>;
  messagingRevoke(payload: unknown): Promise<BridgeResult<{ revoked: true }>>;
  messagingSend(payload: unknown): Promise<BridgeResult<{ intent: OutboxIntent }>>;

  modelCatalog(payload: unknown): Promise<BridgeResult<{ models: ModelCatalogEntry[] }>>;
  modelPresets(payload: unknown): BridgeResult<{ presets: ModelPreset[] }>;
  modelPresetCreate(payload: unknown): Promise<BridgeResult<{ preset: ModelPreset }>>;
  modelPresetUpdate(payload: unknown): Promise<BridgeResult<{ preset: ModelPreset }>>;
  modelPresetApply(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  modelPlan(payload: unknown): Promise<BridgeResult<ModelPlanState>>;
  modelPlanCustomize(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  modelPlanAssignmentsSet(payload: unknown): Promise<BridgeResult<{ plan: PersonaBotModelPlan }>>;
  list(payload: unknown): BridgeResult<{ bots: PersonaBotSummary[] }>;
  activitySnapshot(payload: unknown): BridgeResult<PersonaBotActivitySnapshot>;
  get(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  create(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  createFromGit(payload: unknown): Promise<BridgeResult<{ bot: PersonaBotDetail }>>;
  update(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  pause(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  resume(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  humanIdentity(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanNameSet(payload: unknown): BridgeResult<LocalHumanIdentity>;
  channelHumanNameSet(payload: unknown): BridgeResult<{ channel: ChannelListItem }>;
  channels(payload: unknown): BridgeResult<{ channels: ChannelListItem[] }>;
  channelDm(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelCreate(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelRename(payload: unknown): BridgeResult<{ channel: ChannelRecord; bot?: PersonaBotDetail }>;
  channelGroupAvatarSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupInvite(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupInviteCancel(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupJoinDecide(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupMemberRemove(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupWakeSet(payload: unknown): BridgeResult<{ channel: ChannelRecord }>;
  channelGroupDelete(payload: unknown): BridgeResult<{ deleted: boolean }>;
  channelTimeline(payload: unknown): BridgeResult<{ page: ChannelTimelinePage; revision: number }>;
  channelReadPosition(payload: unknown): BridgeResult<{ position?: ChannelReadPosition }>;
  channelMarkRead(payload: unknown): Promise<BridgeResult<{ position: ChannelReadPosition }>>;
  channelMessages(payload: unknown): BridgeResult<{ messages: ChannelMessage[]; revision: number }>;
  channelSend(payload: unknown): Promise<BridgeResult<{ message: ChannelMessage }>>;
  botAttention(payload: unknown): BridgeResult<BotAttentionPage>;
  botSourcePolicies(payload: unknown): BridgeResult<{ policies: BotSourcePolicy[] }>;
  botSourcePolicySet(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  botSourcePolicyReset(payload: unknown): BridgeResult<{ policy: BotSourcePolicy }>;
  humanAttention(payload: unknown): BridgeResult<HumanAttentionPage>;
  humanAssignmentContext(payload: unknown): BridgeResult<{ context: HumanAssignmentContext }>;
  humanAttentionStatus(payload: unknown): BridgeResult<{ unreadCount: number; hasAction: boolean }>;
  humanAttentionIgnore(payload: unknown): BridgeResult<{ accepted: boolean }>;
  assignments(payload: unknown): BridgeResult<{ assignments: AssignmentSummary[] }>;
  assignment(payload: unknown): BridgeResult<{ assignment: AssignmentDetail }>;
  workspaceOptions(
    payload: unknown,
  ): BridgeResult<{ workspaces: { id: string; path: string; title: string }[] }>;
  workspaceFileTarget(
    payload: unknown,
  ): BridgeResult<{ target: { path: string; relativePath: ''; kind: 'directory' } }>;
  grants(payload: unknown): BridgeResult<{ grants: WorkspaceGrant[] }>;
  grantCreate(payload: unknown): Promise<BridgeResult<{ grant: WorkspaceGrant }>>;
  grantRevoke(payload: unknown): BridgeResult<{ grant: WorkspaceGrant }>;
  grantWriteSet(payload: unknown): BridgeResult<{ grant: WorkspaceGrant }>;
  assignmentAccessGet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
  assignmentAccessSet(payload: unknown): BridgeResult<{ preset: AssignmentAccessPreset }>;
  toolApprovalRules(payload: unknown): BridgeResult<{ rules: ToolApprovalRule[] }>;
  toolApprovalRuleRevoke(payload: unknown): BridgeResult<{ rule: ToolApprovalRule }>;
  toolApprovalStatus(payload: unknown): BridgeResult<{ status: 'pending' | 'expired' }>;
  toolApprovalDecide(payload: unknown): Promise<BridgeResult<{ accepted: boolean }>>;
  userQuestionStatus(payload: unknown): BridgeResult<{ status: 'pending' | 'expired' }>;
  userQuestionAnswer(payload: unknown): Promise<BridgeResult<{ accepted: boolean }>>;
  sessions(payload: unknown): BridgeResult<{ sessions: OwnedSessionSummary[] }>;
  sessionOwner(payload: unknown): BridgeResult<{ owner: OwnedSessionBot | null }>;
  messageAttachmentTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
  memoryFileTarget(payload: unknown): BridgeResult<{ target: MemoryFileTarget }>;
  memorySnapshot(payload: unknown): BridgeResult<{ snapshot: MemoryAcceptedSnapshot }>;
  memoryFile(
    payload: unknown,
  ): BridgeResult<{ file?: { path: string; body: string; head: string } }>;
  memoryHistory(payload: unknown): BridgeResult<{ commits: MemoryAcceptedCommit[] }>;
  memoryDiff(payload: unknown): BridgeResult<{ sha: string; diff: string }>;
  memoryGitGraph(payload: unknown): BridgeResult<MemoryGitGraph>;
  memoryGitCommitDiff(payload: unknown): BridgeResult<MemoryGitCommitDiff>;
  memoryWorkingChanges(payload: unknown): BridgeResult<{ changes: MemoryWorkingChange[] }>;
  memoryWorkingDiff(payload: unknown): BridgeResult<MemoryWorkingDiff>;
  memoryRecoveryHistory(
    payload: unknown,
  ): BridgeResult<{ checkpoints: MemoryRecoveryCheckpoint[] }>;
  memoryRestore(
    payload: unknown,
  ): BridgeResult<{ checkpoint: MemoryRecoveryCheckpoint; archivePath: string }>;
  memorySave(payload: unknown): BridgeResult<{ commit: MemoryAcceptedCommit }>;
  memoryRepair(payload: unknown): BridgeResult<{ repair: MemoryRepairEvent }>;
  profileActivity(payload: unknown): BridgeResult<ProfileActivity>;
  profileUsage(payload: unknown): BridgeResult<UsageQueryResult>;
  groupProfileActivity(payload: unknown): BridgeResult<GroupProfileActivity>;
  rosterGet(payload: unknown): BridgeResult<RosterSnapshot>;
  sectionCreate(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRename(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRemove(payload: unknown): Promise<BridgeResult<{ removed: boolean }>>;
  channelAssign(payload: unknown): Promise<BridgeResult<Record<string, never>>>;
  sectionReorder(payload: unknown): Promise<BridgeResult<{ sectionOrder: string[] }>>;
  topReorder(payload: unknown): Promise<BridgeResult<{ topOrder: TopOrderEntry[] }>>;
  pinsSet(payload: unknown): Promise<BridgeResult<{ pins: string[] }>>;
  hiddenSet(payload: unknown): Promise<BridgeResult<{ hidden: string[] }>>;
  rosterBatch(payload: unknown): Promise<BridgeResult<RosterSnapshot>>;
  developerModeSet(payload: unknown): BridgeResult<{ accepted: boolean }>;
  computerAccessSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  browserAccessSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  browserProfileSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
  botAvatarSet(payload: unknown): BridgeResult<{ bot: PersonaBotDetail }>;
}

export interface BridgeMethodsDeps {
  warn?: (message: string) => void;
  registry: PersonaBotRegistry;
  attachments?: AttachmentStore;
  modelPresets?: ModelPresetStore;
  modelCatalog?: ModelCatalog;
  modelReadiness?: ModelRouteReadiness;
  states: BotStateTracker;
  channels: ChannelStore;
  ownership: SessionOwnership;
  memory?: MemoryService;
  usage?: UsageProjection;
  roster: RosterStore;
  runtime?: BotRuntime;
  attention?: BotAttentionQuery;
  sourcePolicy?: BotSourcePolicyStore;
  humanAttention?: HumanAttentionQuery;
  humanAttentionDecisions?: HumanAttentionDecisions;
  grants?: WorkspaceGrantStore;
  externalMessaging?: OutboundMessaging;
  toolApproval?: ChannelToolApproval;
  userQuestions?: ChannelUserQuestions;
  toolRules?: ToolApprovalRuleStore;
  assignmentAccess?: AssignmentAccessStore;
  developerMode?: { set(enabled: boolean): void };
  computerAccess?: { changed(slug: string): void };
  browserAccess?: { changed(slug: string): void };
  browserProfile?: { changed(slug: string): void };
  createBotId?: () => string;
}

type ParsedField<T> = { ok: true; value: T | undefined } | { ok: false };

function asObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

function asQuery(payload: unknown): string | undefined {
  const value = asObject(payload)['query'];
  return typeof value === 'string' ? value : undefined;
}

function asSlug(payload: unknown): string | undefined {
  const value = asObject(payload)['slug'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function parseOptional(source: Record<string, unknown>, key: string): ParsedField<string> {
  const value = source[key];
  if (value === undefined) return { ok: true, value: undefined };
  return typeof value === 'string' ? { ok: true, value } : { ok: false };
}

function parseStringArray(source: Record<string, unknown>, key: string): ParsedField<string[]> {
  const value = source[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    return { ok: false };
  }
  return { ok: true, value: [...value] };
}

const parseRoles = (source: Record<string, unknown>): ParsedField<string[]> =>
  parseStringArray(source, 'roles');
const parseWorkspaces = (source: Record<string, unknown>): ParsedField<string[]> =>
  parseStringArray(source, 'workspaces');

function invalidInput(message: string): BridgeResult<never> {
  return { ok: false, error: { code: 'invalid-input', message } };
}

function unknownBot(slug: string): BridgeResult<never> {
  return { ok: false, error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` } };
}

function unknownChannel(id: string): BridgeResult<never> {
  return { ok: false, error: { code: 'not-found', message: `unknown Channel: ${id}` } };
}

function dmAdmissionFailure(
  channelId: string,
  botSlug: string | undefined,
  reason: DmAdmissionFailure,
): BridgeResult<never> {
  switch (reason) {
    case 'unknown-channel':
      return unknownChannel(channelId);
    case 'not-dm':
      return invalidInput('Bot runtime accepts only PersonaBot DM messages');
    case 'unknown-bot':
      return unknownBot(botSlug ?? channelId);
    case 'archived-bot':
      return {
        ok: false,
        error: {
          code: 'bot-archived',
          message: `PersonaBot is archived: ${botSlug ?? channelId}`,
        },
      };
    case 'blank-body':
      return invalidInput('body is required');
    case 'runtime-closed':
      return { ok: false, error: { code: 'unavailable', message: 'Bot runtime is closed' } };
  }
}

function unknownAssignment(sessionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown Assignment: ${sessionId}` },
  };
}

function unavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'storage-unavailable', message: 'roster storage is unavailable' },
  };
}

function unknownSection(sectionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown Channel section: ${sectionId}` },
  };
}

const sectionCreatePayload = z.object({ name: z.string() });
const sectionRenamePayload = z.object({ sectionId: z.string().min(1), name: z.string() });
const sectionRemovePayload = z.object({ sectionId: z.string().min(1) });
const channelAssignPayload = z.object({
  channelId: z.string().min(1),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
  index: z.number().int().min(0).optional(),
});
const sectionReorderPayload = z.object({ order: z.array(z.string()) });
const topReorderPayload = z.object({
  order: z.array(z.object({ kind: z.enum(['section', 'channel']), id: z.string().min(1) })),
});
const pinsSetPayload = z.object({ pins: z.array(z.string()) });
const hiddenSetPayload = z.object({ hidden: z.array(z.string()) });
const rosterBatchPayload = z.object({
  action: z.enum(['pin', 'unpin', 'hide', 'move']),
  channelIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ROSTER_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
});

function asNonBlank(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function createFailure(
  slug: string,
  failure: Extract<CreatePersonaBotResult, { ok: false }>,
): BridgeResult<never> {
  switch (failure.reason) {
    case 'duplicate':
      return {
        ok: false,
        error: { code: 'duplicate', message: `PersonaBot already exists: ${slug}` },
      };
    case 'invalid-slug':
      return { ok: false, error: { code: 'invalid-slug', message: `invalid slug: ${slug}` } };
    case 'invalid-input':
      return invalidInput('invalid PersonaBot input');
    case 'invalid-memory-dir':
      return invalidInput('memoryDir must be an absolute path');
    case 'git-not-found':
      return {
        ok: false,
        error: {
          code: 'git-not-found',
          message: 'Install Git, make it available on PATH, restart DeepSeek Harness, then retry.',
        },
      };
    case 'invalid-git-url':
      return {
        ok: false,
        error: {
          code: 'invalid-git-url',
          message: 'Enter an HTTPS or SSH Git URL without credentials.',
        },
      };
    case 'git-clone-failed':
      return {
        ok: false,
        error: {
          code: 'git-clone-failed',
          message: 'Git clone failed. Check the URL and Host Git credentials.',
        },
      };
    case 'git-clone-timeout':
      return {
        ok: false,
        error: {
          code: 'git-clone-timeout',
          message: 'Git clone timed out. Retry or check Host network access.',
        },
      };
    case 'memory-unavailable':
      return {
        ok: false,
        error: {
          code: 'memory-unavailable',
          message: `Memory Repository is unavailable: ${failure.detail ?? 'unknown reason'}`,
        },
      };
  }
}

const avatarUrlCache = new Map<string, string>();

function botAvatarUrl(slug: string, avatar: string): string {
  const key = `${slug}\u0000${avatar}`;
  const cached = avatarUrlCache.get(key);
  if (cached !== undefined) return cached;
  const version = createHash('sha256').update(avatar).digest('hex').slice(0, 16);
  const url = `${BOT_AVATAR_PATH}?slug=${encodeURIComponent(slug)}&v=${version}`;
  if (avatarUrlCache.size > 256) avatarUrlCache.clear();
  avatarUrlCache.set(key, url);
  return url;
}

function summarize(record: PersonaBotRecord, snapshot: BotStateSnapshot): PersonaBotSummary {
  return {
    slug: record.slug,
    displayName: record.displayName,
    aggregateState: snapshot.state,
    workspaces: [...record.workspaces],
    createdAt: record.createdAt,
    roles: record.roles ?? (record.tag === undefined ? [] : [record.tag]),
    ...(record.description === undefined ? {} : { description: record.description }),
    ...(record.avatar === undefined
      ? {}
      : {
          avatar: record.avatar.startsWith('data:image/')
            ? botAvatarUrl(record.slug, record.avatar)
            : record.avatar,
        }),
    ...(record.paused === undefined ? {} : { paused: record.paused }),
    ...(record.computerAccess === undefined ? {} : { computerAccess: record.computerAccess }),
    ...(record.browserAccess === undefined ? {} : { browserAccess: record.browserAccess }),
    ...(record.browserProfile === undefined ? {} : { browserProfile: record.browserProfile }),
  };
}

function detail(record: PersonaBotRecord, snapshot: BotStateSnapshot): PersonaBotDetail {
  return {
    ...summarize(record, snapshot),
    sessions: { ...snapshot.sessions },
    ...(record.model === undefined ? {} : { model: record.model }),
    ...(record.modelPlan === undefined ? {} : { modelPlan: record.modelPlan }),
    ...(record.preset === undefined ? {} : { preset: record.preset }),
    ...(record.memoryDir === undefined ? {} : { memoryDir: record.memoryDir }),
  };
}

export function createBridgeMethods(deps: BridgeMethodsDeps): BridgeMethods {
  const channelView = (channel: ChannelRecord): ChannelListItem => {
    const humanNickname = deps.channels.humanNickname(channel.id);
    return {
      ...channel,
      humanMembers: deps.channels.listHumanMembers(channel.id),
      ...(humanNickname === undefined ? {} : { humanNickname }),
    };
  };
  const messagingCall = async <T>(
    operation: (service: OutboundMessaging) => Promise<T>,
  ): Promise<BridgeResult<T>> => {
    if (deps.externalMessaging === undefined)
      return {
        ok: false,
        error: { code: 'messaging-unavailable', message: 'External messaging is unavailable' },
      };
    try {
      return { ok: true, value: await operation(deps.externalMessaging) };
    } catch (error) {
      if (error instanceof MessagingError)
        return { ok: false, error: { code: error.code, message: error.code } };
      const storage = error instanceof OperationalDatabaseError;
      deps.warn?.(
        JSON.stringify({
          module: 'messaging',
          initiator: 'client',
          phase: 'rpc-failed',
          reason: storage ? 'operational-storage-unavailable' : 'unexpected-error',
        }),
      );
      return {
        ok: false,
        error: {
          code: storage ? 'messaging-storage-unavailable' : 'messaging-unavailable',
          message: storage
            ? 'External messaging storage is unavailable'
            : 'External messaging is unavailable',
        },
      };
    }
  };
  const createBotId = deps.createBotId ?? (() => 'bot-' + randomUUID().replaceAll('-', ''));
  const detailOf = (record: PersonaBotRecord): { bot: PersonaBotDetail } => ({
    bot: detail(record, deps.states.snapshot(record.slug)),
  });

  const rosterWrite = async <T>(operation: () => Promise<T>): Promise<BridgeResult<T>> => {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (error instanceof RosterUnavailableError) return unavailable();
      if (error instanceof RosterUnknownSectionError) return unknownSection(error.sectionId);
      throw error;
    }
  };

  const dmMemory = (payload: unknown): { botSlug: string } | BridgeResult<never> => {
    const channelId = asNonBlank(asObject(payload), 'channelId');
    if (channelId === undefined) return invalidInput('channelId is required');
    const channel = deps.channels.get(channelId);
    if (channel === undefined) return unknownChannel(channelId);
    if (channel.type !== 'dm' || channel.botSlug === undefined) {
      return invalidInput('Memory is available only in a PersonaBot DM');
    }
    if (deps.registry.get(channel.botSlug) === undefined) return unknownBot(channel.botSlug);
    return { botSlug: channel.botSlug };
  };
  const memoryCall = <T>(operation: () => T): BridgeResult<T> => {
    if (deps.memory === undefined) {
      return {
        ok: false,
        error: { code: 'memory-unavailable', message: 'Memory Service unavailable' },
      };
    }
    try {
      return { ok: true, value: operation() };
    } catch (error) {
      if (error instanceof MemoryAcceptError) {
        return { ok: false, error: { code: error.code, message: error.message } };
      }
      if (error instanceof MemoryFileError)
        return { ok: false, error: { code: error.code, message: error.message } };
      if (error instanceof MemoryPathError) return invalidInput(error.message);
      throw error;
    }
  };

  const setPaused = (
    payload: unknown,
    paused: boolean,
  ): BridgeResult<{ bot: PersonaBotDetail }> => {
    const slug = asSlug(payload);
    if (slug === undefined) return invalidInput('slug is required');
    const result = deps.registry.setPaused(slug, paused);
    if (!result.ok) return unknownBot(slug);
    if (paused) deps.channels.cancelInvitationsForBot(slug);
    else deps.runtime?.resumePendingDigests?.(slug);
    return { ok: true, value: detailOf(result.record) };
  };

  const validateAssignmentCatalog = async (
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
  ): Promise<void> => {
    validateAssignmentModels(assignmentDefault, assignmentModels);
    if (deps.modelCatalog === undefined) throw new Error('Model catalog is unavailable');
    await Promise.all(
      assignmentModels.flatMap((option) =>
        option.allowedEfforts.map((effort) =>
          deps.modelCatalog!.validate({
            provider: option.provider,
            model: option.model,
            ...(effort === '' ? {} : { reasoningEffort: effort }),
          }),
        ),
      ),
    );
  };

  return {
    messagingReceive(payload) {
      const input = z
        .object({ slug: z.string().min(1), grantId: z.string().uuid(), enabled: z.boolean() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid receive setting'));
      return messagingCall(async (service) => {
        await service.inbound.setEnabled(input.data.slug, input.data.grantId, input.data.enabled);
        return { updated: true as const };
      });
    },
    messagingSource(payload) {
      const input = z
        .object({ slug: z.string().min(1), sourceEventId: z.string().min(1).max(128) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid external source'));
      return messagingCall(async (service) => ({
        source: service.inbound.read(input.data.slug, input.data.sourceEventId),
      }));
    },
    messagingSnapshot(payload) {
      const slug = asSlug(payload);
      if (slug === undefined || deps.registry.get(slug) === undefined)
        return Promise.resolve(invalidInput('Known bot required'));
      return messagingCall((service) => service.snapshot(slug));
    },
    messagingTargets(payload) {
      const input = z
        .object({ providerId: z.string().min(1), accountRef: z.string().min(1) })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid target query'));
      return messagingCall(async (service) => ({
        targets: await service.targets(input.data.providerId, input.data.accountRef),
      }));
    },
    messagingAuthorize(payload) {
      const input = z
        .object({
          botSlug: z.string().min(1),
          providerId: z.string().min(1),
          accountRef: z.string().min(1),
          targetRef: z.string().min(1),
          fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
          targetDigest: z.string().regex(/^[a-f0-9]{64}$/),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid authorization'));
      return messagingCall(async (service) => ({ grant: await service.authorize(input.data) }));
    },
    messagingRevoke(payload) {
      const input = z
        .object({ slug: z.string().min(1), grantId: z.string().uuid() })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid grant'));
      return messagingCall(async (service) => {
        service.revoke(input.data.slug, input.data.grantId);
        return { revoked: true as const };
      });
    },
    messagingSend(payload) {
      const input = z
        .object({
          slug: z.string().min(1),
          grantId: z.string().uuid(),
          requestId: z.string().min(8).max(128),
          text: z.string().min(1).max(4000),
        })
        .strict()
        .safeParse(payload);
      if (!input.success) return Promise.resolve(invalidInput('Invalid send'));
      return messagingCall(async (service) => ({
        intent: await service.send(
          input.data.slug,
          input.data.grantId,
          input.data.requestId,
          input.data.text,
        ),
      }));
    },
    async modelCatalog() {
      if (deps.modelCatalog === undefined) return unavailable();
      try {
        return { ok: true, value: { models: await deps.modelCatalog.list() } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    modelPresets() {
      if (deps.modelPresets === undefined) return unavailable();
      return { ok: true, value: { presets: deps.modelPresets.list() } };
    },
    async modelPresetCreate(payload) {
      if (deps.modelPresets === undefined || deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const name = source['name'];
      const orchestrator = source['orchestrator'];
      const assignmentDefault = source['assignmentDefault'];
      const assignmentModels = source['assignmentModels'];
      if (
        typeof name !== 'string' ||
        !isModelRoute(orchestrator) ||
        !isModelRoute(assignmentDefault) ||
        (assignmentModels !== undefined &&
          (!Array.isArray(assignmentModels) || !assignmentModels.every(isAssignmentModelOption)))
      )
        return invalidInput('A name and valid Orchestrator and Assignment routes are required');
      try {
        await deps.modelCatalog.validate(orchestrator);
        await validateAssignmentCatalog(
          assignmentDefault,
          assignmentModels ?? [
            {
              provider: assignmentDefault.provider,
              model: assignmentDefault.model,
              allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
              defaultEffort: assignmentDefault.reasoningEffort ?? '',
            },
          ],
        );
        const preset = deps.modelPresets.create({
          name,
          orchestrator,
          assignmentDefault,
          ...(assignmentModels === undefined ? {} : { assignmentModels }),
        });
        return { ok: true, value: { preset } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    async modelPresetUpdate(payload) {
      if (deps.modelPresets === undefined || deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const id = source['id'];
      const expectedRevision = source['expectedRevision'];
      const name = source['name'];
      const orchestrator = source['orchestrator'];
      const assignmentDefault = source['assignmentDefault'];
      const assignmentModels = source['assignmentModels'];
      if (
        typeof id !== 'string' ||
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision) ||
        expectedRevision < 1 ||
        typeof name !== 'string' ||
        !isModelRoute(orchestrator) ||
        !isModelRoute(assignmentDefault) ||
        (assignmentModels !== undefined &&
          (!Array.isArray(assignmentModels) || !assignmentModels.every(isAssignmentModelOption)))
      )
        return invalidInput(
          'An id, expected revision, name, and valid Orchestrator and Assignment routes are required',
        );
      const current = deps.modelPresets.get(id);
      if (current === undefined) return invalidInput('Model Preset was not found');
      try {
        await deps.modelCatalog.validate(orchestrator);
        await validateAssignmentCatalog(
          assignmentDefault,
          assignmentModels ??
            current.assignmentModels ?? [
              {
                provider: assignmentDefault.provider,
                model: assignmentDefault.model,
                allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
                defaultEffort: assignmentDefault.reasoningEffort ?? '',
              },
            ],
        );
        const preset = deps.modelPresets.update(id, {
          expectedRevision,
          name,
          orchestrator,
          assignmentDefault,
          ...(assignmentModels === undefined ? {} : { assignmentModels }),
        });
        if (preset === undefined) return invalidInput('Model Preset was not found');
        return { ok: true, value: { preset } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    async modelPresetApply(payload) {
      if (deps.modelPresets === undefined || deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const slug = source['slug'];
      const presetId = source['presetId'];
      if (typeof slug !== 'string' || typeof presetId !== 'string') {
        return invalidInput('slug and presetId are required');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const preset = deps.modelPresets.get(presetId);
      if (preset === undefined) return invalidInput('Model Preset was not found');
      try {
        await deps.modelCatalog.validate(preset.orchestrator);
        await deps.modelCatalog.validate(preset.assignmentDefault);
        if (preset.assignmentModels !== undefined)
          await validateAssignmentCatalog(preset.assignmentDefault, preset.assignmentModels);
        const result = deps.registry.applyModelPreset(slug, preset);
        if (!result.ok || result.record.modelPlan === undefined) return unknownBot(slug);
        return { ok: true, value: { plan: result.record.modelPlan } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    async modelPlan(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      if (deps.modelReadiness !== undefined) {
        try {
          return { ok: true, value: await deps.modelReadiness.inspect(slug) };
        } catch (failure) {
          return invalidInput(failure instanceof Error ? failure.message : String(failure));
        }
      }
      return { ok: true, value: bot.modelPlan === undefined ? {} : { plan: bot.modelPlan } };
    },
    async modelPlanCustomize(payload) {
      if (deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const slug = source['slug'];
      const orchestrator = source['orchestrator'];
      if (typeof slug !== 'string' || !isModelRoute(orchestrator)) {
        return invalidInput('slug and a valid Orchestrator route are required');
      }
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      if (bot.modelPlan === undefined) return invalidInput('Apply a Model Preset first');
      const expectedRevision = bot.modelPlan.revision;
      try {
        await deps.modelCatalog.validate(orchestrator);
        const result = deps.registry.customizeModelPlan(slug, orchestrator, expectedRevision);
        if (!result.ok)
          return result.reason === 'not-found'
            ? unknownBot(slug)
            : invalidInput('Bot Model Plan changed; reopen Profile before saving');
        if (result.record.modelPlan === undefined)
          return invalidInput('Apply a Model Preset first');
        return { ok: true, value: { plan: result.record.modelPlan } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    async modelPlanAssignmentsSet(payload) {
      if (deps.modelCatalog === undefined) return unavailable();
      const source = asObject(payload);
      const slug = source['slug'];
      const assignmentDefault = source['assignmentDefault'];
      const assignmentModels = source['assignmentModels'];
      const expectedRevision = source['expectedRevision'];
      if (
        typeof slug !== 'string' ||
        !isModelRoute(assignmentDefault) ||
        !Array.isArray(assignmentModels) ||
        !assignmentModels.every(isAssignmentModelOption) ||
        typeof expectedRevision !== 'number' ||
        !Number.isSafeInteger(expectedRevision)
      )
        return invalidInput('A Bot, expected revision, and valid Assignment choices are required');
      const bot = deps.registry.get(slug);
      if (bot === undefined) return unknownBot(slug);
      if (bot.modelPlan === undefined) return invalidInput('Apply a Model Preset first');
      try {
        await validateAssignmentCatalog(assignmentDefault, assignmentModels);
        const result = deps.registry.setAssignmentModels(
          slug,
          assignmentDefault,
          assignmentModels,
          expectedRevision,
        );
        if (!result.ok)
          return result.reason === 'not-found'
            ? unknownBot(slug)
            : invalidInput('Bot Model Plan changed; reopen Profile before saving');
        if (result.record.modelPlan === undefined)
          return invalidInput('Apply a Model Preset first');
        return { ok: true, value: { plan: result.record.modelPlan } };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    list(payload) {
      const query = asQuery(payload)?.trim().toLowerCase();
      const bots = deps.registry
        .list()
        .filter((record) => {
          if (query === undefined || query.length === 0) return true;
          const roles = record.roles ?? (record.tag === undefined ? [] : [record.tag]);
          return (
            record.displayName.toLowerCase().includes(query) ||
            roles.some((role) => role.toLowerCase().includes(query))
          );
        })
        .map((record) => summarize(record, deps.states.snapshot(record.slug)));
      return { ok: true, value: { bots } };
    },
    activitySnapshot() {
      return {
        ok: true,
        value: personaBotActivitySnapshot(
          deps.registry.list().map((bot) => bot.slug),
          deps.states,
        ),
      };
    },
    get(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) {
        return invalidInput('slug is required');
      }
      const record = deps.registry.get(slug);
      if (record === undefined) return unknownBot(slug);
      const bot = detailOf(record).bot;
      const memoryDir = deps.registry.memoryDirFor(slug);
      return {
        ok: true,
        value: { bot: { ...bot, ...(memoryDir === undefined ? {} : { memoryDir }) } },
      };
    },
    create(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return invalidInput('displayName is required');
      }
      const persona = parseOptional(source, 'persona');
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatar = parseOptional(source, 'avatar');
      if (
        !persona.ok ||
        !roles.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatar.ok
      ) {
        return invalidInput('invalid create payload');
      }
      const slug = createBotId();
      const result = deps.registry.create({
        slug,
        displayName,
        ...(persona.value === undefined ? {} : { persona: persona.value }),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
      });
      if (!result.ok) return createFailure(slug, result);
      return { ok: true, value: detailOf(result.record) };
    },
    async createFromGit(payload) {
      const source = asObject(payload);
      const displayName = source['displayName'];
      const gitUrl = source['gitUrl'];
      if (typeof displayName !== 'string' || displayName.trim().length === 0) {
        return invalidInput('displayName is required');
      }
      if (typeof gitUrl !== 'string' || gitUrl.trim().length === 0) {
        return invalidInput('gitUrl is required');
      }
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      if (!roles.ok || !description.ok) return invalidInput('invalid create payload');
      const slug = createBotId();
      const result = await deps.registry.createFromGit({
        slug,
        displayName,
        gitUrl,
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
      });
      if (!result.ok) return createFailure(slug, result);
      return { ok: true, value: detailOf(result.record) };
    },
    update(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      const patchOrUndefined = asObject(payload)['patch'];
      if (typeof patchOrUndefined !== 'object' || patchOrUndefined === null) {
        return invalidInput('patch is required');
      }
      const source = patchOrUndefined as Record<string, unknown>;
      const displayName = parseOptional(source, 'displayName');
      const roles = parseRoles(source);
      const description = parseOptional(source, 'description');
      const model = parseOptional(source, 'model');
      const preset = parseOptional(source, 'preset');
      const workspaces = parseWorkspaces(source);
      const avatar = parseOptional(source, 'avatar');
      if (
        !displayName.ok ||
        !roles.ok ||
        !description.ok ||
        !model.ok ||
        !preset.ok ||
        !workspaces.ok ||
        !avatar.ok
      ) {
        return invalidInput('invalid update payload');
      }
      const patch: PersonaBotPatch = {
        ...(displayName.value === undefined ? {} : { displayName: displayName.value }),
        ...(roles.value === undefined ? {} : { roles: roles.value }),
        ...(description.value === undefined ? {} : { description: description.value }),
        ...(model.value === undefined ? {} : { model: model.value }),
        ...(preset.value === undefined ? {} : { preset: preset.value }),
        ...(workspaces.value === undefined ? {} : { workspaces: workspaces.value }),
        ...(avatar.value === undefined ? {} : { avatar: avatar.value }),
      };
      const result = deps.registry.update(slug, patch);
      if (!result.ok) {
        return result.reason === 'not-found'
          ? unknownBot(slug)
          : invalidInput('invalid update payload');
      }
      return { ok: true, value: detailOf(result.record) };
    },
    pause(payload) {
      return setPaused(payload, true);
    },
    resume(payload) {
      return setPaused(payload, false);
    },
    computerAccessSet(payload) {
      const slug = asSlug(payload);
      const enabled = asObject(payload)['enabled'];
      if (slug === undefined || typeof enabled !== 'boolean') {
        return invalidInput('slug and enabled are required');
      }
      const result = deps.registry.setComputerAccess(slug, enabled);
      if (!result.ok) return unknownBot(slug);
      deps.computerAccess?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    browserAccessSet(payload) {
      const slug = asSlug(payload);
      const enabled = asObject(payload)['enabled'];
      if (slug === undefined || typeof enabled !== 'boolean') {
        return invalidInput('slug and enabled are required');
      }
      const result = deps.registry.setBrowserAccess(slug, enabled);
      if (!result.ok) return unknownBot(slug);
      deps.browserAccess?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    browserProfileSet(payload) {
      const slug = asSlug(payload);
      const profile = asObject(payload)['profile'];
      if (slug === undefined || typeof profile !== 'string') {
        return invalidInput('slug and profile are required');
      }
      const trimmed = profile.trim();
      const normalized = trimmed === 'default' ? '' : trimmed;
      if (normalized === '.' || normalized === '..') {
        return invalidInput(
          'Profile names "." and ".." are reserved; choose a named profile or default',
        );
      }
      if (normalized !== '' && !/^[a-zA-Z0-9._-]{1,40}$/u.test(normalized)) {
        return invalidInput('profile must use letters, digits, dot, dash, or underscore (max 40)');
      }
      const result = deps.registry.setBrowserProfile(slug, normalized);
      if (!result.ok) return unknownBot(slug);
      deps.browserProfile?.changed(slug);
      return { ok: true, value: detailOf(result.record) };
    },
    botAvatarSet(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const avatar = asObject(payload)['avatar'];
      if (avatar !== null && !isPersonaBotAvatar(avatar)) {
        return invalidInput('avatar must be a bounded PNG, JPEG, or WebP data URL');
      }
      const result = deps.registry.update(scope.botSlug, { avatar: avatar ?? '' });
      if (!result.ok) {
        return result.reason === 'not-found'
          ? unknownBot(scope.botSlug)
          : invalidInput('invalid avatar');
      }
      return { ok: true, value: detailOf(result.record) };
    },
    humanIdentity() {
      return { ok: true, value: deps.channels.humanIdentity() };
    },
    humanNameSet(payload) {
      const input = z
        .object({ displayName: z.string().max(128).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('A displayName string or null is required');
      try {
        return { ok: true, value: deps.channels.setHumanDefaultName(input.data.displayName) };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    channelHumanNameSet(payload) {
      const input = z
        .object({ channelId: z.string(), nickname: z.string().max(128).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return invalidInput('A channelId and nickname string or null are required');
      try {
        deps.channels.setHumanNickname(input.data.channelId, input.data.nickname);
        return {
          ok: true,
          value: { channel: channelView(deps.channels.get(input.data.channelId)!) },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    channels() {
      for (const bot of deps.registry.list()) {
        deps.channels.getOrCreateDm(bot.slug, bot.displayName);
      }
      const channels = deps.channels.list().map((channel) => {
        const latestMessage = deps.channels.latestMessage(channel.id);
        return {
          ...channelView(channel),
          ...(latestMessage === undefined ? {} : { latestMessage }),
        };
      });
      return { ok: true, value: { channels } };
    },
    channelDm(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      if (slug === undefined) return invalidInput('slug is required');
      if (!isValidSlug(slug)) return invalidInput(`invalid slug: ${slug}`);
      const displayName = parseOptional(source, 'displayName');
      if (!displayName.ok) return invalidInput('invalid channelDm payload');
      const channel = deps.channels.getOrCreateDm(slug, displayName.value ?? slug);
      if (channel === undefined) return invalidInput(`invalid slug: ${slug}`);
      return {
        ok: true,
        value: {
          channel: channelView(channel),
        },
      };
    },
    channelCreate(payload) {
      const source = asObject(payload);
      const name = asNonBlank(source, 'name');
      if (name === undefined) return invalidInput('name is required');
      const members = source['members'];
      if (
        !Array.isArray(members) ||
        !members.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
      ) {
        return invalidInput('members must be an array of PersonaBot IDs');
      }
      const channel = deps.channels.createGroup({ name, members: [...members] });
      return { ok: true, value: { channel: channelView(channel) } };
    },
    channelRename(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const name = asNonBlank(source, 'name')?.trim();
      if (channelId === undefined) return invalidInput('channelId is required');
      if (name === undefined) return invalidInput('name is required');
      const existing = deps.channels.get(channelId);
      if (existing === undefined) return unknownChannel(channelId);
      if (existing.type === 'dm' && existing.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');

      let bot: PersonaBotDetail | undefined;
      if (existing.type === 'dm' && existing.botSlug !== undefined) {
        if (deps.registry.get(existing.botSlug) === undefined) return unknownBot(existing.botSlug);
        const result = deps.registry.update(existing.botSlug, { displayName: name });
        if (!result.ok) return unknownBot(existing.botSlug);
        bot = detailOf(result.record).bot;
      }
      const channel = deps.channels.rename(channelId, name);
      if (channel === undefined) return unknownChannel(channelId);
      return {
        ok: true,
        value: { channel: channelView(channel), ...(bot === undefined ? {} : { bot }) },
      };
    },
    channelGroupAvatarSet(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const avatar = source['avatar'];
      if (channelId === undefined || (avatar !== null && !isGroupAvatar(avatar)))
        return invalidInput('valid channelId and Group avatar are required');
      try {
        return {
          ok: true,
          value: { channel: channelView(deps.channels.setGroupAvatar(channelId, avatar)) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInvite(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      const bot = deps.registry.get(botSlug);
      const channel = deps.channels.get(channelId);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      if (channel?.type !== 'group') return unknownChannel(channelId);
      const dm = deps.channels.getOrCreateDm(bot.slug, bot.displayName);
      if (dm === undefined) return invalidInput('Invitee DM is unavailable');
      try {
        const invitation = deps.channels.inviteGroupBot({
          channelId,
          inviterHuman: true,
          targetBotSlug: bot.slug,
          targetBotCreatedAt: bot.createdAt,
          targetDmChannelId: dm.id,
        });
        deps.runtime?.admitGroupInvitation(dm.id, invitation.id);
        return { ok: true, value: { channel: channelView(deps.channels.get(channelId)!) } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupInviteCancel(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const invitationId = asNonBlank(source, 'invitationId');
      if (channelId === undefined || invitationId === undefined)
        return invalidInput('channelId and invitationId are required');
      try {
        return {
          ok: true,
          value: { channel: channelView(deps.channels.cancelGroupInvite(channelId, invitationId)) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupJoinDecide(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const requestId = asNonBlank(source, 'requestId');
      const accept = source['accept'];
      if (channelId === undefined || requestId === undefined || typeof accept !== 'boolean')
        return invalidInput('channelId, requestId and accept are required');
      const channel = deps.channels.get(channelId);
      const request = channel?.joinRequests?.find((item) => item.id === requestId);
      if (channel?.type !== 'group' || request === undefined)
        return invalidInput('Pending Group join request not found');
      if (request.status !== 'pending')
        return request.status === (accept ? 'accepted' : 'declined')
          ? { ok: true, value: { channel: channelView(channel) } }
          : invalidInput('Group join request is no longer pending');
      const requester = deps.registry.get(request.requesterBotSlug);
      if (
        requester === undefined ||
        requester.paused === true ||
        requester.createdAt !== request.requesterBotCreatedAt
      )
        return invalidInput('Requesting PersonaBot is no longer active');
      const dm = deps.channels.getOrCreateDm(requester.slug, requester.displayName);
      if (dm === undefined) return invalidInput('Requester DM is unavailable');
      try {
        const decided = deps.channels.decideGroupJoin({
          channelId,
          requestId,
          accept,
          decidedBy: 'human',
          requesterBotCreatedAt: requester.createdAt,
          requesterDmChannelId: dm.id,
        });
        if (decided.notified) deps.runtime?.admitGroupJoinDecision?.(dm.id, request.id);
        return { ok: true, value: { channel: channelView(decided.channel) } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupMemberRemove(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const botSlug = asNonBlank(source, 'botSlug');
      if (channelId === undefined || botSlug === undefined || !isValidSlug(botSlug))
        return invalidInput('valid channelId and botSlug are required');
      try {
        return {
          ok: true,
          value: { channel: channelView(deps.channels.removeGroupMember(channelId, botSlug)) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupWakeSet(payload) {
      const parsed = z
        .object({
          channelId: z.string().min(1),
          botSlug: z.string().min(1),
          mode: z.enum(['all', 'mentions', 'digest', 'silent']),
          count: z.number().int().min(1).max(100),
          intervalSeconds: z.number().int().min(1).max(3600),
        })
        .safeParse(asObject(payload));
      if (!parsed.success) return invalidInput('invalid Group wake policy');
      const { channelId, botSlug, mode, count, intervalSeconds } = parsed.data;
      const bot = deps.registry.get(botSlug);
      if (bot === undefined || bot.paused === true) return unknownBot(botSlug);
      try {
        return {
          ok: true,
          value: {
            channel: channelView(
              deps.channels.setGroupWakePolicy(
                channelId,
                botSlug,
                {
                  mode,
                  count,
                  intervalSeconds,
                },
                { kind: 'human' },
              ),
            ),
          },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelGroupDelete(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      try {
        deps.channels.deleteGroup(channelId);
        return { ok: true, value: { deleted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    channelMessages(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const before = parseOptional(source, 'before');
      if (!before.ok) return invalidInput('invalid channelMessages payload');
      const limitValue = source['limit'];
      let limit: number | undefined;
      if (limitValue !== undefined) {
        if (typeof limitValue !== 'number' || !Number.isInteger(limitValue) || limitValue < 1) {
          return invalidInput('limit must be a positive integer');
        }
        limit = limitValue;
      }
      const cursor = before.value?.trim();
      const messages = deps.channels.readMessages(channelId, {
        ...(cursor === undefined || cursor.length === 0 ? {} : { before: cursor }),
        ...(limit === undefined ? {} : { limit }),
      });
      return { ok: true, value: { messages, revision: deps.channels.revision(channelId) } };
    },
    channelTimeline(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const parsed = z
        .object({
          direction: z.enum(['older', 'newer', 'around']).optional(),
          cursor: z.string().min(1).max(2048).optional(),
          around: z.string().min(1).optional(),
          limit: z.number().int().min(1).max(200).optional(),
          olderLimit: z.number().int().min(0).max(200).optional(),
          newerLimit: z.number().int().min(0).max(200).optional(),
        })
        .safeParse(source);
      if (!parsed.success) return invalidInput('invalid channelTimeline payload');
      const page = deps.channels.readHumanTimeline(channelId, parsed.data);
      if (page === undefined) return invalidInput('invalid or expired timeline anchor');
      return { ok: true, value: { page, revision: deps.channels.revision(channelId) } };
    },
    channelReadPosition(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = deps.channels.readPosition(channelId);
      return { ok: true, value: position === undefined ? {} : { position } };
    },
    async channelMarkRead(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      if (deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      const position = await deps.channels.markRead(channelId, messageId);
      if (position === undefined) return invalidInput('message does not belong to channel');
      return { ok: true, value: { position } };
    },
    async channelSend(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      if (channelId === undefined) return invalidInput('channelId is required');
      const body = source['body'];
      const attachments = source['attachments'];
      if (
        attachments !== undefined &&
        (!Array.isArray(attachments) ||
          attachments.length > 10 ||
          !attachments.every(isChannelAttachmentRef))
      )
        return invalidInput('invalid attachments');
      if (
        typeof body !== 'string' ||
        (body.trim().length === 0 && (!attachments || attachments.length === 0))
      )
        return invalidInput('body is required');
      const rawMentions = source['mentions'];
      if (rawMentions !== undefined && !Array.isArray(rawMentions))
        return invalidInput('mentions must be selected PersonaBot tokens');
      const mentions: ChannelMention[] = [];
      if (Array.isArray(rawMentions)) {
        if (rawMentions.length > 20) return invalidInput('too many mentions');
        for (const item of rawMentions) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid mention token');
          const token = item as Record<string, unknown>;
          const { botSlug, label, start, end } = token;
          if (
            typeof botSlug !== 'string' ||
            !isValidSlug(botSlug) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            typeof start !== 'number' ||
            !Number.isSafeInteger(start) ||
            typeof end !== 'number' ||
            !Number.isSafeInteger(end) ||
            start < 0 ||
            end <= start ||
            typeof body !== 'string' ||
            body.slice(start, end) !== '@' + label
          )
            return invalidInput('invalid mention token');
          mentions.push({ botSlug, label, start, end });
        }
        mentions.sort((a, b) => a.start - b.start);
        if (mentions.some((item, index) => index > 0 && item.start < mentions[index - 1]!.end))
          return invalidInput('overlapping mention tokens');
      }
      const rawRefs = source['channelRefs'];
      if (rawRefs !== undefined && !Array.isArray(rawRefs))
        return invalidInput('channelRefs must be selected #Channel tokens');
      const channelRefs: ChannelReference[] = [];
      if (Array.isArray(rawRefs)) {
        if (rawRefs.length > 20) return invalidInput('too many Channel references');
        for (const item of rawRefs) {
          if (typeof item !== 'object' || item === null)
            return invalidInput('invalid Channel reference token');
          const { channelId: targetId, label, start, end } = item as Record<string, unknown>;
          if (
            typeof targetId !== 'string' ||
            !isValidChannelId(targetId) ||
            typeof label !== 'string' ||
            label.length === 0 ||
            !Number.isSafeInteger(start) ||
            !Number.isSafeInteger(end) ||
            (start as number) < 0 ||
            (end as number) <= (start as number) ||
            body.slice(start as number, end as number) !== '#' + label
          )
            return invalidInput('invalid Channel reference token');
          channelRefs.push({
            channelId: targetId,
            label,
            start: start as number,
            end: end as number,
          });
        }
        channelRefs.sort((a, b) => a.start - b.start);
        if (
          channelRefs.some((item, index) => index > 0 && item.start < channelRefs[index - 1]!.end)
        )
          return invalidInput('overlapping Channel references');
        if (
          channelRefs.some((ref) =>
            mentions.some((mention) => ref.start < mention.end && mention.start < ref.end),
          )
        )
          return invalidInput('overlapping selected tokens');
      }
      const replyTo = source['replyTo'];
      if (replyTo !== undefined && (typeof replyTo !== 'string' || replyTo.length === 0)) {
        return invalidInput('replyTo must be a message id');
      }
      const rawGrantResolution = source['grantRequestResolution'];
      let grantRequestResolution: ChannelMessage['grantRequestResolution'];
      if (rawGrantResolution !== undefined) {
        if (typeof rawGrantResolution !== 'object' || rawGrantResolution === null)
          return invalidInput('invalid Grant request resolution');
        const resolution = rawGrantResolution as Record<string, unknown>;
        if (
          typeof resolution['requestMessageId'] !== 'string' ||
          resolution['requestMessageId'].length === 0 ||
          typeof resolution['grantId'] !== 'string' ||
          resolution['grantId'].length === 0 ||
          replyTo !== resolution['requestMessageId']
        )
          return invalidInput('invalid Grant request resolution');
        grantRequestResolution = {
          requestMessageId: resolution['requestMessageId'],
          grantId: resolution['grantId'],
        };
      }
      const requestedMessageId = source['messageId'];
      const rawAssignmentReply = source['assignmentReply'];
      let assignmentReply: ChannelMessage['assignmentReply'];
      if (rawAssignmentReply !== undefined) {
        if (typeof rawAssignmentReply !== 'object' || rawAssignmentReply === null)
          return invalidInput('invalid Assignment response');
        const target = rawAssignmentReply as Record<string, unknown>;
        if (
          typeof target['sessionId'] !== 'string' ||
          target['sessionId'].length === 0 ||
          target['sessionId'].length > 150 ||
          typeof target['sourceEventId'] !== 'string' ||
          target['sourceEventId'].length === 0 ||
          target['sourceEventId'].length > 150 ||
          replyTo !== undefined ||
          grantRequestResolution !== undefined
        )
          return invalidInput('invalid Assignment response');
        assignmentReply = {
          sessionId: target['sessionId'],
          sourceEventId: target['sourceEventId'],
        };
      }
      if (
        requestedMessageId !== undefined &&
        (typeof requestedMessageId !== 'string' ||
          !/^human-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(
            requestedMessageId,
          ))
      ) {
        return invalidInput('messageId must be a Human client message id');
      }
      const channel = deps.channels.get(channelId);
      if (channel === undefined) return unknownChannel(channelId);
      if (channel.type === 'dm' && channel.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      if (
        replyTo !== undefined &&
        deps.channels.readHumanTimeline(channelId, {
          direction: 'around',
          around: replyTo,
          olderLimit: 0,
          newerLimit: 0,
        }) === undefined
      )
        return invalidInput('Reply target must exist in this Channel');
      const memorySwitchTarget = source['memorySwitchTarget'];
      if (
        memorySwitchTarget !== undefined &&
        (typeof memorySwitchTarget !== 'string' ||
          memorySwitchTarget.length === 0 ||
          memorySwitchTarget.length > 255 ||
          channel.type !== 'dm')
      )
        return invalidInput('memorySwitchTarget requires a DM and a branch name');
      const existing =
        requestedMessageId === undefined
          ? undefined
          : deps.channels.message(channelId, requestedMessageId);
      if (existing !== undefined) {
        const same =
          existing.author.kind === 'human' &&
          existing.body === body &&
          existing.replyTo === replyTo &&
          existing.memorySwitchTarget === memorySwitchTarget &&
          JSON.stringify(existing.assignmentReply) === JSON.stringify(assignmentReply) &&
          JSON.stringify(attachmentIntent(existing.attachments ?? [])) ===
            JSON.stringify(attachmentIntent(attachments ?? [])) &&
          JSON.stringify(existing.mentions ?? []) === JSON.stringify(mentions) &&
          JSON.stringify(existing.channelRefs ?? []) === JSON.stringify(channelRefs) &&
          JSON.stringify(existing.grantRequestResolution) ===
            JSON.stringify(grantRequestResolution);
        return same
          ? { ok: true, value: { message: existing } }
          : invalidInput('messageId already belongs to different Channel content');
      }
      const grantRequestTarget =
        replyTo === undefined ? undefined : deps.channels.message(channelId, replyTo);
      if (
        assignmentReply !== undefined &&
        (channel.type !== 'dm' ||
          channel.botSlug === undefined ||
          deps.humanAttention?.assignmentContext(
            channel.botSlug,
            assignmentReply.sessionId,
            assignmentReply.sourceEventId,
          )?.canReply !== true)
      )
        return invalidInput('Assignment request is no longer awaiting this Human response');
      if (
        grantRequestResolution === undefined &&
        grantRequestTarget?.grantRequest === true &&
        (body.startsWith('已授权工作区「') || body.startsWith('I authorized workspace “'))
      )
        return invalidInput('Grant approval replies must reference an active Workspace Grant');
      if (grantRequestResolution !== undefined) {
        if (channel.type !== 'dm' || channel.botSlug === undefined)
          return invalidInput('Grant request resolution requires a PersonaBot DM');
        if (
          grantRequestTarget?.grantRequest !== true ||
          grantRequestTarget.author.kind !== 'bot' ||
          grantRequestTarget.author.slug !== channel.botSlug
        )
          return invalidInput('Grant request is unavailable in this DM');
        if (
          !deps.grants
            ?.list(channel.botSlug)
            .some(
              (grant) =>
                grant.id === grantRequestResolution.grantId && grant.revokedAt === undefined,
            )
        )
          return invalidInput('Workspace Grant is no longer active for this PersonaBot');
      }
      if (mentions.length > 0 && channel.type === 'dm' && channel.botSlug === undefined)
        return invalidInput('Bot-to-Bot DMs are read-only for Human');
      for (const mention of mentions) {
        const target = deps.registry.get(mention.botSlug);
        if (
          (channel.type === 'group'
            ? !channel.members.includes(mention.botSlug)
            : mention.botSlug === channel.botSlug) ||
          target === undefined ||
          target.paused === true
        )
          return invalidInput('Mentioned PersonaBot is no longer an eligible active Bot');
      }
      if (channelRefs.length > 0) {
        if (channel.type !== 'dm' || channel.botSlug === undefined)
          return invalidInput('#Channel references require a Human–Bot DM');
        for (const ref of channelRefs) {
          const target = deps.channels.get(ref.channelId);
          if (target?.type !== 'group')
            return invalidInput('Referenced Group Channel is no longer available');
        }
      }
      const message: ChannelMessage = {
        id: requestedMessageId ?? randomUUID(),
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body,
        ...(attachments === undefined ? {} : { attachments }),
        ...(mentions.length === 0 ? {} : { mentions }),
        ...(channelRefs.length === 0 ? {} : { channelRefs }),
        ...(replyTo === undefined ? {} : { replyTo }),
        ...(grantRequestResolution === undefined ? {} : { grantRequestResolution }),
        ...(assignmentReply === undefined ? {} : { assignmentReply }),
        ...(memorySwitchTarget === undefined ? {} : { memorySwitchTarget }),
      };
      if (
        channel.type === 'dm' &&
        channel.botSlug !== undefined &&
        deps.registry.get(channel.botSlug)?.paused === true
      ) {
        return dmAdmissionFailure(channelId, channel.botSlug, 'archived-bot');
      }
      let appendResult;
      try {
        appendResult = await deps.channels.appendMessageOnce(channelId, message);
      } catch (error) {
        if (
          error instanceof ChannelReplyTargetError ||
          error instanceof AssignmentReplyTargetError ||
          error instanceof ChannelMentionTargetError ||
          error instanceof ChannelAttachmentError
        )
          return invalidInput(error.message);
        throw error;
      }
      if (appendResult.status === 'missing') return unknownChannel(channelId);
      if (appendResult.status === 'conflict') {
        return invalidInput('messageId already belongs to different Channel content');
      }
      const appended = appendResult.message;
      if (appendResult.status === 'existing') {
        return { ok: true, value: { message: appended } };
      }
      if (channel.type === 'group') {
        try {
          deps.runtime?.admitGroupMessage(channelId, appended.id);
        } catch {}
      }
      if (channel.type === 'dm' && deps.runtime !== undefined) {
        const admission = deps.runtime.admitDmMessage({
          channelId,
          messageId: appended.id,
          body:
            appended.body.trim() ||
            `[Attachments: ${appended.attachments?.map((ref) => ref.name).join(', ') ?? ''}]`,
        });
        if (!admission.admitted) {
          return { ok: true, value: { message: appended } };
        }
      }
      return { ok: true, value: { message: appended } };
    },
    botAttention(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const limit = source['limit'];
      const cursor = source['cursor'];
      const state = source['state'];
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 150)
      )
        return invalidInput('cursor must be a Source Event ID');
      if (
        state !== undefined &&
        !['pending', 'processing', 'observed', 'deferred', 'needs-repair', 'handled'].includes(
          String(state),
        )
      )
        return invalidInput('unknown Bot attention state');
      try {
        return {
          ok: true,
          value: deps.attention?.list({
            botSlug: slug,
            ...(limit === undefined ? {} : { limit: limit as number }),
            ...(cursor === undefined ? {} : { cursor: cursor as string }),
            ...(state === undefined ? {} : { state: state as BotAttentionState }),
          }) ?? { items: [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicies(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      try {
        return { ok: true, value: { policies: deps.sourcePolicy?.list(slug) ?? [] } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicySet(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const wake = source['wake'];
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        ) {
          const delivery = source['delivery'];
          if (delivery !== 'steer' && delivery !== 'turn')
            return invalidInput('delivery must be steer or turn');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setImmediateDelivery(slug, sourceClass, delivery, {
                kind: 'human',
              }),
            },
          };
        }
        if (sourceClass === 'group-ordinary') {
          const digestCount = source['digestCount'];
          const digestIntervalSeconds = source['digestIntervalSeconds'];
          if (
            (wake !== 'immediate' &&
              wake !== 'digest' &&
              wake !== 'mentions' &&
              wake !== 'silent') ||
            !Number.isSafeInteger(digestCount) ||
            !Number.isSafeInteger(digestIntervalSeconds)
          )
            return invalidInput('Group ordinary wake and digest parameters are required');
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.setGroupOrdinary(
                slug,
                wake,
                digestCount as number,
                digestIntervalSeconds as number,
                { kind: 'human' },
              ),
            },
          };
        }
        if (
          sourceClass !== 'assignment-report' ||
          (wake !== 'conditional' && wake !== 'immediate') ||
          source['digestCount'] !== undefined ||
          source['digestIntervalSeconds'] !== undefined
        )
          return invalidInput('Assignment report wake must be conditional or immediate');
        return {
          ok: true,
          value: { policy: deps.sourcePolicy.setAssignmentReport(slug, wake, { kind: 'human' }) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    botSourcePolicyReset(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sourceClass = source['sourceClass'] ?? 'assignment-report';
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.sourcePolicy === undefined) return invalidInput('Source policy is unavailable');
      try {
        if (sourceClass === 'group-ordinary')
          return {
            ok: true,
            value: { policy: deps.sourcePolicy.resetGroupOrdinary(slug, { kind: 'human' }) },
          };
        if (
          sourceClass === 'human-dm' ||
          sourceClass === 'bot-dm' ||
          sourceClass === 'group-mention'
        )
          return {
            ok: true,
            value: {
              policy: deps.sourcePolicy.resetImmediateDelivery(slug, sourceClass, {
                kind: 'human',
              }),
            },
          };
        if (sourceClass !== 'assignment-report')
          return invalidInput('Source class is not editable');
        return {
          ok: true,
          value: { policy: deps.sourcePolicy.resetAssignmentReport(slug, { kind: 'human' }) },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttention(payload) {
      const source = asObject(payload);
      const category = source['category'];
      const sort = source['sort'];
      const botSlug = source['botSlug'];
      const channelId = source['channelId'];
      const limit = source['limit'];
      const cursor = source['cursor'];
      if (
        category !== undefined &&
        category !== 'action' &&
        category !== 'info' &&
        category !== 'unread' &&
        category !== 'replies' &&
        category !== 'handled'
      )
        return invalidInput('category must be action, info, unread, replies or handled');
      if (sort !== undefined && sort !== 'newest' && sort !== 'oldest')
        return invalidInput('sort must be newest or oldest');
      if (botSlug !== undefined && (typeof botSlug !== 'string' || !isValidSlug(botSlug)))
        return invalidInput('invalid Bot filter');
      if (
        channelId !== undefined &&
        (typeof channelId !== 'string' || !isValidChannelId(channelId))
      )
        return invalidInput('invalid Channel filter');
      if (
        limit !== undefined &&
        (!Number.isSafeInteger(limit) || (limit as number) < 1 || (limit as number) > 100)
      )
        return invalidInput('limit must be an integer from 1 to 100');
      if (
        cursor !== undefined &&
        (typeof cursor !== 'string' || cursor.length === 0 || cursor.length > 1024)
      )
        return invalidInput('invalid cursor');
      try {
        return {
          ok: true,
          value: deps.humanAttention?.list({
            ...(category === undefined ? {} : { category: category as HumanAttentionCategory }),
            ...(sort === undefined ? {} : { sort: sort as 'newest' | 'oldest' }),
            ...(botSlug === undefined ? {} : { botSlug: botSlug as string }),
            ...(channelId === undefined ? {} : { channelId: channelId as string }),
            ...(limit === undefined ? {} : { limit: limit as number }),
            ...(cursor === undefined ? {} : { cursor: cursor as string }),
          }) ?? { items: [] },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAttentionStatus() {
      try {
        return {
          ok: true,
          value: deps.humanAttention?.status() ?? { unreadCount: 0, hasAction: false },
        };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    humanAssignmentContext(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const sessionId = asNonBlank(source, 'sessionId');
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (
        slug === undefined ||
        sessionId === undefined ||
        sessionId.length > 150 ||
        sourceEventId === undefined ||
        sourceEventId.length > 150
      )
        return invalidInput('Bot, Assignment Session and report Source Event are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const context = deps.humanAttention?.assignmentContext(slug, sessionId, sourceEventId);
      if (context === undefined)
        return invalidInput('Assignment report is unavailable for this Bot');
      return {
        ok: true,
        value: {
          context: {
            ...context,
            canReply:
              context.canReply &&
              deps.registry.get(slug)?.paused !== true &&
              deps.channels.get('dm-' + slug)?.botSlug === slug,
          },
        },
      };
    },
    humanAttentionIgnore(payload) {
      const source = asObject(payload);
      const sourceEventId = asNonBlank(source, 'sourceEventId');
      if (sourceEventId === undefined || sourceEventId.length > 150)
        return invalidInput('sourceEventId is required');
      try {
        const accepted =
          deps.humanAttentionDecisions?.ignoreAssignmentReport(sourceEventId) ?? false;
        if (!accepted) return invalidInput('Assignment report is no longer informational');
        return { ok: true, value: { accepted: true } };
      } catch (error) {
        return invalidInput(String(error));
      }
    },
    assignments(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return {
        ok: true,
        value: { assignments: deps.runtime?.listAssignments(slug) ?? [] },
      };
    },
    assignment(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const sessionId = asNonBlank(source, 'sessionId');
      if (slug === undefined) return invalidInput('slug is required');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const assignment = deps.runtime?.getAssignment(slug, sessionId);
      if (assignment === undefined) return unknownAssignment(sessionId);
      return { ok: true, value: { assignment } };
    },
    workspaceOptions() {
      try {
        return { ok: true, value: { workspaces: deps.grants?.availableWorkspaces() ?? [] } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return { ok: false, error: { code: error.code, message: error.message } };
        }
        throw error;
      }
    },
    messageAttachmentTarget(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const fileId = asNonBlank(source, 'fileId');
      if (channelId === undefined || messageId === undefined || fileId === undefined)
        return invalidInput('channelId, messageId and fileId are required');
      if (deps.attachments === undefined)
        return {
          ok: false,
          error: { code: 'storage-unavailable', message: 'Attachment store unavailable' },
        };
      try {
        return {
          ok: true,
          value: {
            target: createMessageAttachmentFiles(deps.channels, deps.attachments).target(
              channelId,
              messageId,
              fileId,
            ),
          },
        };
      } catch (error) {
        if (error instanceof ChannelAttachmentError)
          return {
            ok: false,
            error: {
              code: error.code === 'not-found' ? 'not-found' : 'invalid-input',
              message: error.message,
            },
          };
        throw error;
      }
    },
    workspaceFileTarget(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      if (slug === undefined || grantId === undefined)
        return invalidInput('slug and grantId are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: { code: 'unavailable', message: 'Workspace Grants are unavailable' },
        };
      try {
        const grant = deps.grants.requireActive(slug, grantId);
        return {
          ok: true,
          value: { target: { path: grant.workspacePath, relativePath: '', kind: 'directory' } },
        };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return { ok: false, error: { code: error.code, message: error.message } };
        throw error;
      }
    },
    grants(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return { ok: true, value: { grants: deps.grants?.list(slug) ?? [] } };
    },
    async grantCreate(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const workspaceId = asNonBlank(source, 'workspaceId');
      if (slug === undefined || workspaceId === undefined) {
        return invalidInput('slug and workspaceId are required');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: { code: 'unavailable', message: 'Workspace Grants are unavailable' },
        };
      try {
        return { ok: true, value: { grant: await deps.grants.create(slug, workspaceId) } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return { ok: false, error: { code: error.code, message: error.message } };
        }
        throw error;
      }
    },
    grantRevoke(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      if (slug === undefined || grantId === undefined) {
        return invalidInput('slug and grantId are required');
      }
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: { code: 'unavailable', message: 'Workspace Grants are unavailable' },
        };
      try {
        const grant = deps.grants.revoke(slug, grantId);
        deps.toolApproval?.cancelInvalid();
        return { ok: true, value: { grant } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError) {
          return { ok: false, error: { code: error.code, message: error.message } };
        }
        throw error;
      }
    },
    grantWriteSet(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const grantId = asNonBlank(source, 'grantId');
      const enabled = source?.['enabled'];
      if (slug === undefined || grantId === undefined || typeof enabled !== 'boolean')
        return invalidInput('slug, grantId and boolean enabled are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.grants === undefined)
        return {
          ok: false,
          error: { code: 'unavailable', message: 'Workspace Grants are unavailable' },
        };
      try {
        const grant = deps.grants.setOrchestratorWrite(slug, grantId, enabled);
        deps.toolApproval?.cancelInvalid();
        return { ok: true, value: { grant } };
      } catch (error) {
        if (error instanceof WorkspaceGrantError)
          return { ok: false, error: { code: error.code, message: error.message } };
        throw error;
      }
    },
    assignmentAccessGet(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return {
        ok: true,
        value: {
          preset: deps.assignmentAccess?.get(slug) ?? {
            botSlug: slug,
            mode: 'workspace-write',
            revision: 0,
          },
        },
      };
    },
    assignmentAccessSet(payload) {
      const source = asObject(payload);
      const slug = asNonBlank(source, 'slug');
      const mode = source['mode'];
      if (slug === undefined || (mode !== 'workspace-write' && mode !== 'danger-full-access'))
        return invalidInput('slug and valid mode are required');
      if (mode === 'danger-full-access' && source['acknowledgeRisk'] !== true)
        return invalidInput('Dangerous access requires explicit Human risk acknowledgement');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      if (deps.assignmentAccess === undefined)
        return invalidInput('Assignment access is unavailable');
      return { ok: true, value: { preset: deps.assignmentAccess.set(slug, mode) } };
    },
    toolApprovalRules(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return { ok: true, value: { rules: deps.toolRules?.list(slug) ?? [] } };
    },
    toolApprovalRuleRevoke(payload) {
      const slug = asSlug(payload);
      const id = asNonBlank(asObject(payload), 'id');
      if (slug === undefined || id === undefined) return invalidInput('slug and id are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const rule = deps.toolRules?.revoke(slug, id);
      return rule === undefined
        ? invalidInput('Unknown tool approval rule')
        : { ok: true, value: { rule } };
    },
    toolApprovalStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined) {
        return invalidInput('channelId and messageId are required');
      }
      const channel = deps.channels.get(channelId);
      if (channel?.type !== 'dm' || channel.botSlug === undefined) {
        return invalidInput('Tool approval is available only in a PersonaBot DM');
      }
      if (deps.channels.message(channelId, messageId)?.toolApprovalRequest === undefined) {
        return invalidInput('Unknown tool approval request');
      }
      return {
        ok: true,
        value: { status: deps.toolApproval?.status(channel.botSlug, messageId) ?? 'expired' },
      };
    },
    async toolApprovalDecide(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const outcome = source['outcome'];
      if (
        channelId === undefined ||
        messageId === undefined ||
        (outcome !== 'allowed-once' &&
          outcome !== 'allowed-always-exact' &&
          outcome !== 'allowed-always-all' &&
          outcome !== 'rejected')
      ) {
        return invalidInput('channelId, messageId, and a valid outcome are required');
      }
      const channel = deps.channels.get(channelId);
      if (channel?.type !== 'dm' || channel.botSlug === undefined) {
        return invalidInput('Tool approval is available only in a PersonaBot DM');
      }
      if (deps.channels.message(channelId, messageId)?.toolApprovalRequest === undefined) {
        return invalidInput('Unknown tool approval request');
      }
      const accepted = await deps.toolApproval?.decide(channel.botSlug, messageId, outcome);
      if (accepted !== true) return invalidInput('Tool approval request is no longer pending');
      return { ok: true, value: { accepted: true } };
    },
    userQuestionStatus(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      if (channelId === undefined || messageId === undefined)
        return invalidInput('channelId and messageId are required');
      const channel = deps.channels.get(channelId);
      if (channel?.type !== 'dm' || channel.botSlug === undefined)
        return invalidInput('Questions are available only in a PersonaBot DM');
      if (deps.channels.message(channelId, messageId)?.userQuestionRequest === undefined)
        return invalidInput('Unknown user question');
      return {
        ok: true,
        value: { status: deps.userQuestions?.status(channel.botSlug, messageId) ?? 'expired' },
      };
    },
    async userQuestionAnswer(payload) {
      const source = asObject(payload);
      const channelId = asNonBlank(source, 'channelId');
      const messageId = asNonBlank(source, 'messageId');
      const answer = asObject(source['answer']);
      if (channelId === undefined || messageId === undefined || !Array.isArray(answer['answers']))
        return invalidInput('channelId, messageId, and answers are required');
      const channel = deps.channels.get(channelId);
      if (channel?.type !== 'dm' || channel.botSlug === undefined)
        return invalidInput('Questions are available only in a PersonaBot DM');
      if (deps.channels.message(channelId, messageId)?.userQuestionRequest === undefined)
        return invalidInput('Unknown user question');
      const accepted = await deps.userQuestions?.answer(
        channel.botSlug,
        messageId,
        answer as unknown as AskUserQuestionAnswer,
      );
      if (accepted !== true)
        return invalidInput('Question is no longer pending or answer is invalid');
      return { ok: true, value: { accepted: true } };
    },
    sessions(payload) {
      const slug = asSlug(payload);
      if (slug === undefined) return invalidInput('slug is required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      const assignments = new Map(
        (deps.runtime?.listAssignments(slug) ?? []).map((assignment) => [
          assignment.sessionId,
          assignment,
        ]),
      );
      const sessions = deps.ownership.rootsFor(slug).map((root) => {
        const assignment = assignments.get(root.sessionId);
        return {
          sessionId: root.sessionId,
          role: root.rootRole,
          createdAt: root.createdAt,
          ...(root.cwdReference === undefined ? {} : { cwdReference: root.cwdReference }),
          ...(assignment === undefined ? {} : { assignmentActivity: assignment.activity }),
          ...(assignment?.permission === undefined
            ? {}
            : { assignmentAccessMode: assignment.permission.mode }),
        };
      });
      return { ok: true, value: { sessions } };
    },
    sessionOwner(payload) {
      const sessionId = asNonBlank(asObject(payload), 'sessionId');
      if (sessionId === undefined) return invalidInput('sessionId is required');
      const owned = deps.ownership.resolve(sessionId);
      if (owned === undefined || owned.parentSessionId !== undefined)
        return { ok: true, value: { owner: null } };
      const bot = deps.registry.get(owned.botSlug);
      if (bot === undefined) return { ok: true, value: { owner: null } };
      return {
        ok: true,
        value: {
          owner: {
            botSlug: bot.slug,
            displayName: bot.displayName,
            ...(bot.avatar === undefined
              ? {}
              : {
                  avatar: bot.avatar.startsWith('data:image/')
                    ? botAvatarUrl(bot.slug, bot.avatar)
                    : bot.avatar,
                }),
            role: owned.rootRole,
          },
        },
      };
    },
    memoryFileTarget(payload) {
      const source = asObject(payload);
      const slug = asSlug(payload);
      const path = source['path'];
      if (slug === undefined || typeof path !== 'string')
        return invalidInput('slug and path are required');
      if (deps.registry.get(slug) === undefined) return unknownBot(slug);
      return memoryCall(() => ({ target: deps.memory!.fileTarget(slug, path) }));
    },
    memorySnapshot(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({ snapshot: deps.memory!.snapshot(scope.botSlug) }));
    },
    memoryFile(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const path = asNonBlank(asObject(payload), 'path');
      if (path === undefined) return invalidInput('path is required');
      return memoryCall(() => {
        const file = deps.memory!.readAccepted(scope.botSlug, path);
        return file === undefined ? {} : { file };
      });
    },
    memoryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({ commits: deps.memory!.history(scope.botSlug) }));
    },
    memoryDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.diff(scope.botSlug, sha));
    },
    memoryGitGraph(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const offset = asObject(payload)['offset'];
      if (
        offset !== undefined &&
        (!Number.isInteger(offset) || Number(offset) < 0 || Number(offset) > 10_000)
      )
        return invalidInput('valid offset is required');
      return memoryCall(() => deps.memory!.gitGraph(scope.botSlug, Number(offset ?? 0)));
    },
    memoryGitCommitDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const sha = asNonBlank(asObject(payload), 'sha');
      if (sha === undefined || !/^[0-9a-f]{40}$/u.test(sha))
        return invalidInput('valid sha is required');
      return memoryCall(() => deps.memory!.gitCommitDiff(scope.botSlug, sha));
    },
    memoryWorkingChanges(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({ changes: deps.memory!.workingChanges(scope.botSlug) }));
    },
    memoryWorkingDiff(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const kind = source['kind'];
      if (
        path === undefined ||
        !['staged', 'unstaged', 'untracked', 'current'].includes(String(kind))
      ) {
        return invalidInput('valid path and kind are required');
      }
      return memoryCall(() =>
        deps.memory!.workingDiff(scope.botSlug, path, kind as MemoryWorkingKind),
      );
    },
    memoryRecoveryHistory(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      return memoryCall(() => ({ checkpoints: deps.memory!.recoveryHistory(scope.botSlug) }));
    },
    memoryRestore(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const checkpointId = asNonBlank(source, 'checkpointId');
      const expectedCurrentId = asNonBlank(source, 'expectedCurrentId');
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
      if (
        checkpointId === undefined ||
        expectedCurrentId === undefined ||
        !uuid.test(checkpointId) ||
        !uuid.test(expectedCurrentId)
      )
        return invalidInput('valid checkpointId and expectedCurrentId are required');
      return memoryCall(() =>
        deps.memory!.restoreHuman({
          botSlug: scope.botSlug,
          checkpointId,
          expectedCurrentId,
        }),
      );
    },
    memorySave(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const path = asNonBlank(source, 'path');
      const body = source['body'];
      const expectedHead = asNonBlank(source, 'expectedHead');
      const editId = asNonBlank(source, 'editId');
      if (
        path === undefined ||
        typeof body !== 'string' ||
        expectedHead === undefined ||
        editId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        editId.length > 100
      ) {
        return invalidInput('path, body, expectedHead, and editId are required');
      }
      return memoryCall(() => ({
        commit: deps.memory!.saveHuman({
          botSlug: scope.botSlug,
          path,
          body,
          expectedHead,
          editId,
        }),
      }));
    },
    memoryRepair(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const source = asObject(payload);
      const expectedHead = asNonBlank(source, 'expectedHead');
      const repairId = asNonBlank(source, 'repairId');
      if (
        expectedHead === undefined ||
        repairId === undefined ||
        !/^[0-9a-f]{40}$/u.test(expectedHead) ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u.test(repairId)
      )
        return invalidInput('valid expectedHead and repairId are required');
      return memoryCall(() => ({
        repair: deps.memory!.repairHuman({ botSlug: scope.botSlug, expectedHead, repairId }),
      }));
    },
    profileUsage(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const parsed = usageFilterSchema.safeParse(asObject(payload)['filter']);
      if (!parsed.success || parsed.data.end > (localDay(new Date().toISOString()) ?? ''))
        return invalidInput('Usage filter requires real dates within a 182-day non-future range');
      if (deps.usage === undefined) return unavailable();
      try {
        return { ok: true, value: deps.usage.query(scope.botSlug, parsed.data) };
      } catch (error) {
        if (error instanceof OperationalDatabaseError) return unavailable();
        throw error;
      }
    },
    profileActivity(payload) {
      const scope = dmMemory(payload);
      if (!('botSlug' in scope)) return scope;
      const slug = scope.botSlug;
      const weeks = 26;
      const since = new Date(Date.now() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
      const events = deps.channels.admissionActivity?.(slug, since) ?? [];
      const commits = deps.memory?.activity?.(slug, since) ?? [];
      const usageRows = deps.usage?.activity(slug, since) ?? [];
      const tokensByDay = new Map<string, ProfileActivityTokensDay>();
      const tokenTotals: ProfileTokenBuckets = {
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      };
      for (const row of usageRows) {
        const day = tokensByDay.get(row.day) ?? {
          day: row.day,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        day.inputTokens += row.inputTokens;
        day.outputTokens += row.outputTokens;
        day.cacheReadTokens += row.cacheReadTokens;
        day.cacheWriteTokens += row.cacheWriteTokens;
        tokensByDay.set(row.day, day);
        tokenTotals.inputTokens += row.inputTokens;
        tokenTotals.outputTokens += row.outputTokens;
        tokenTotals.cacheReadTokens += row.cacheReadTokens;
        tokenTotals.cacheWriteTokens += row.cacheWriteTokens;
      }
      return {
        ok: true,
        value: {
          slug,
          weeks,
          since,
          today: localDay(new Date().toISOString()) ?? '',
          events: bucketByReason(events),
          memoryCommits: bucketByDay(commits.map((entry) => entry.at)),
          tokens: [...tokensByDay.values()].sort((left, right) =>
            left.day.localeCompare(right.day),
          ),
          tokenTotals,
          modelUsageRows: usageRows.map((row) => ({
            day: row.day,
            purpose: row.purpose,
            provider: row.provider,
            model: row.model,
            inputTokens: (row.unknownBuckets?.inputTokens ?? 0) > 0 ? null : row.inputTokens,
            outputTokens: (row.unknownBuckets?.outputTokens ?? 0) > 0 ? null : row.outputTokens,
            cacheReadTokens:
              (row.unknownBuckets?.cacheReadTokens ?? 0) > 0 ? null : row.cacheReadTokens,
            cacheWriteTokens:
              (row.unknownBuckets?.cacheWriteTokens ?? 0) > 0 ? null : row.cacheWriteTokens,
            totalTokens:
              row.totalTokens === undefined
                ? row.inputTokens + row.outputTokens + row.cacheReadTokens + row.cacheWriteTokens
                : row.totalTokens,
          })),
          modelUsageStatus: deps.usage === undefined ? 'unavailable' : 'ready',
        },
      };
    },
    groupProfileActivity(payload) {
      const channelId = asNonBlank(asObject(payload), 'channelId');
      if (channelId === undefined || deps.channels.get(channelId)?.type !== 'group')
        return invalidInput('group channelId is required');
      return { ok: true, value: groupProfileActivity(deps.channels, channelId) };
    },
    rosterGet() {
      try {
        return { ok: true, value: deps.roster.snapshot() };
      } catch (error) {
        if (error instanceof RosterUnavailableError) return unavailable();
        throw error;
      }
    },
    async sectionCreate(payload) {
      const parsed = sectionCreatePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionCreate payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({ section: await deps.roster.sectionCreate(name) }));
    },
    async sectionRename(payload) {
      const parsed = sectionRenamePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRename payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({
        section: await deps.roster.sectionRename(parsed.data.sectionId, name),
      }));
    },
    async sectionRemove(payload) {
      const parsed = sectionRemovePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRemove payload');
      return rosterWrite(async () => ({
        removed: await deps.roster.sectionRemove(parsed.data.sectionId),
      }));
    },
    async channelAssign(payload) {
      const parsed = channelAssignPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid channelAssign payload');
      const { channelId, index } = parsed.data;
      const sectionId = parsed.data.sectionId ?? undefined;
      return rosterWrite(async () => {
        await deps.roster.channelAssign(channelId, sectionId, index);
        return {};
      });
    },
    async sectionReorder(payload) {
      const parsed = sectionReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionReorder payload');
      return rosterWrite(async () => ({
        sectionOrder: await deps.roster.sectionReorder(parsed.data.order),
      }));
    },
    async topReorder(payload) {
      const parsed = topReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid topReorder payload');
      return rosterWrite(async () => ({
        topOrder: await deps.roster.topReorder(parsed.data.order),
      }));
    },
    async pinsSet(payload) {
      const parsed = pinsSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid pinsSet payload');
      return rosterWrite(async () => ({ pins: await deps.roster.pinsSet(parsed.data.pins) }));
    },
    async hiddenSet(payload) {
      const parsed = hiddenSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid hiddenSet payload');
      return rosterWrite(async () => ({ hidden: await deps.roster.hiddenSet(parsed.data.hidden) }));
    },
    async rosterBatch(payload) {
      const parsed = rosterBatchPayload.safeParse(payload);
      if (!parsed.success) {
        return invalidInput(`rosterBatch requires 1–${MAX_ROSTER_BATCH_SIZE} distinct channel ids`);
      }
      const { action, channelIds, sectionId } = parsed.data;
      if (action !== 'move' && sectionId !== undefined) {
        return invalidInput('sectionId is only valid for a rosterBatch move');
      }
      const channels = deps.channels.list();
      const known = new Set(channels.map((channel) => channel.id));
      if (channelIds.some((id) => !known.has(id))) {
        return invalidInput('rosterBatch contains an unknown Channel');
      }
      const aliases = new Map(
        channels.flatMap((channel) =>
          channel.type === 'dm' && channel.botSlug !== undefined
            ? [[channel.botSlug, channel.id] as const]
            : [],
        ),
      );
      const change =
        action === 'move'
          ? { action, channelIds, ...(sectionId == null ? {} : { sectionId }) }
          : { action, channelIds };
      return rosterWrite(() => deps.roster.applyBatch(change, (pin) => aliases.get(pin) ?? pin));
    },
    developerModeSet(payload) {
      const enabled = asObject(payload)['enabled'];
      if (typeof enabled !== 'boolean') return invalidInput('enabled is required');
      deps.developerMode?.set(enabled);
      return { ok: true, value: { accepted: deps.developerMode !== undefined } };
    },
  };
}

function localDay(at: string): string | undefined {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return undefined;
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function bucketByDay(instants: readonly string[]): ProfileActivityDay[] {
  const counts = new Map<string, number>();
  for (const at of instants) {
    const day = localDay(at);
    if (day === undefined) continue;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts]
    .map(([day, count]) => ({ day, count }))
    .sort((left, right) => left.day.localeCompare(right.day));
}

function bucketByReason(
  entries: ReadonlyArray<{ at: string; reason: string }>,
): ProfileActivityReasonDay[] {
  const counts = new Map<string, Map<string, number>>();
  for (const entry of entries) {
    const day = localDay(entry.at);
    if (day === undefined) continue;
    const reasons = counts.get(day) ?? new Map<string, number>();
    reasons.set(entry.reason, (reasons.get(entry.reason) ?? 0) + 1);
    counts.set(day, reasons);
  }
  return [...counts]
    .flatMap(([day, reasons]) => [...reasons].map(([reason, count]) => ({ day, reason, count })))
    .sort((left, right) => left.day.localeCompare(right.day));
}
