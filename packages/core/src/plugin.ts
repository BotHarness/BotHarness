import { createOutboundMessaging, type OutboundMessaging } from './messaging/outbound.js';
import { createDshImProvider } from './messaging/dsh-im.js';
import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-agent';
import type {} from '@deepseek-ai/dsh-session';
import type {} from '@deepseek-ai/dsh-system-prompt';
import type {} from '@deepseek-ai/dsh-tools';
import type { ApprovalService } from '@deepseek-ai/dsh-user-approval';
import Schema from '@deepseek-ai/schemastery';

import { installOrchestratorFileTools } from './workspaces/orchestrator-file-tools.js';
import { nativeExecutionRoot } from './workspaces/grant-native-tools.js';
import { createAttachmentStore, type AttachmentStore } from './attachments/store.js';
import { createMemoryFileHttp, MEMORY_FILE_DOWNLOAD_PATH } from './memory/file-http.js';
import {
  createAttachmentHttp,
  CHANNEL_ATTACHMENT_PATH,
  CHANNEL_ATTACHMENT_UPLOAD_PATH,
} from './attachments/http.js';
import { createBridgeMethods } from './bridge/methods.js';
import type { BotAgentSetupInfo } from './runtime/dsh-bot-agent-adapter.js';
import { registerBridge } from './bridge/rpc.js';
import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { createModelPresetStore, type ModelPresetStore } from './models/presets.js';
import { createModelCatalog } from './models/catalog.js';
import { createModelRouteReadiness } from './models/readiness.js';
import { createBotAvatarHttp, BOT_AVATAR_PATH } from './bots/avatar-http.js';
import { createChannelLiveHub, CHANNEL_STREAM_PATH, type ChannelLiveHub } from './channels/live.js';
import type { ChannelDraftEvent } from './channels/draft.js';
import { DeveloperModeSkillGate } from './logs/skill.js';
import type { ChannelStore } from './channels/store.js';
import { createSqliteChannelStore } from './channels/sqlite-store.js';
import {
  attachOperationalModule,
  mountOperationalDatabase,
  type OperationalDatabaseOwner,
} from './database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
import { resolveDshHome } from './im/config-store.js';
import { ensureMemoryRepository } from './memory/repository.js';
import { cloneMemoryRepository } from './memory/clone.js';
import { createMemoryService, type MemoryService } from './memory/service.js';
import { createRosterStore, type RosterStore } from './roster/store.js';
import {
  createBotRuntime,
  type AssignmentEventTail,
  type BotAgentAdapter,
  type BotRuntime,
} from './runtime/bot-runtime.js';
import { createBotAttentionQuery, type BotAttentionQuery } from './runtime/attention.js';
import { createBotSourcePolicyStore, type BotSourcePolicyStore } from './runtime/source-policy.js';
import {
  createHumanAttentionQuery,
  createHumanAttentionDecisions,
  type HumanAttentionQuery,
  type HumanAttentionDecisions,
} from './runtime/human-attention.js';
import {
  grantExecutionDenial,
  grantToolExecutionDenial,
  isSafeMemoryDirectoryListing,
  requiresHumanToolApproval,
} from './workspaces/grant-execution.js';
import { ChannelToolApproval } from './workspaces/tool-approval.js';
import { ChannelUserQuestions } from './channels/user-questions.js';
import {
  createAssignmentAccessStore,
  type AssignmentAccessStore,
} from './workspaces/assignment-access.js';
import {
  createToolApprovalRuleStore,
  type ToolApprovalRuleStore,
} from './workspaces/tool-approval-rules.js';
import {
  createWorkspaceGrantStore,
  type DshWorkspaceLookup,
  type WorkspaceGrantStore,
} from './workspaces/grants.js';
import {
  createDshBotAgentAdapter,
  type DshAgentPresetHost,
  type DshDefaultModelHost,
} from './runtime/dsh-bot-agent-adapter.js';
import { createSessionOwnership, type SessionOwnership } from './sessions/ownership.js';
import {
  readAssignmentReportPage,
  readBoundedAssignmentTail,
  type AssignmentSessionQuery,
  type AssignmentReportPage,
} from './runtime/assignment-tail.js';
import type { DshSessionEvent, DshSessionStore } from './sessions/source.js';
import {
  createBotStateTracker,
  personaBotActivitySnapshot,
  type BotStateTracker,
  type PersonaBotActivityEvent,
} from './state/bot-state.js';
import { createDshActivityProjection } from './state/dsh-activity.js';
import { readPublicToolDetail } from './state/tool-activity.js';
import { createUsageProjection, type UsageProjection } from './usage/usage.js';
import { installBotSubagentModelTools } from './runtime/subagent-model-tools.js';

export const name = 'botharness-core';

export const inject = ['tools', 'systemPrompt', 'sessions', 'agents', 'agentDefaultModel', 'llm'];

export const PERSONA_SECTION_ORDER = 10400;

const COMPACTION_END_EVENT: string = 'compaction/end';

export interface CompactionRefreshSink {
  ownership: { resolve(sessionId: string): { botSlug: string } | undefined };
  memory: {
    refreshPersonaAfterCompaction(botSlug: string, sessionId: string): { refreshed: boolean };
  };
  warn(message: string): void;
}

export function handleCompactionEvent(
  sink: CompactionRefreshSink,
  sessionId: string,
  eventType: string,
): void {
  if (eventType !== COMPACTION_END_EVENT) return;
  const owner = sink.ownership.resolve(sessionId);
  if (owner === undefined) return;
  try {
    sink.memory.refreshPersonaAfterCompaction(owner.botSlug, sessionId);
  } catch (error) {
    sink.warn(`botharness: persona refresh after compaction failed: ${String(error)}`);
  }
}

export interface BotHarnessConfig {
  enabled: boolean;

  agentPreset?: string;
}

export const DEFAULT_AGENT_PRESET = 'standard';

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
  agentPreset: DEFAULT_AGENT_PRESET,
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
  agentPreset: Schema.string()
    .default(DEFAULT_AGENT_PRESET)
    .description('PersonaBot 会话加入的 DSH agent preset（提供 file/Shell/grep 等普通工具）'),
});

export interface BotHarnessCore {
  rootDir: string;
  operationalDatabase: OperationalDatabaseOwner;
  registry: PersonaBotRegistry;
  modelPresets: ModelPresetStore;

  contributeBotAgentSetup(contribute: BotAgentSetup): () => void;

  configureGroupInvitations(autoAccept: () => boolean): () => void;

  hostTools: Set<string>;

  runBotAgentSetups(
    agentCtx: Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void;
  states: BotStateTracker;
  ownership: SessionOwnership;
  memory: MemoryService;

  usage?: UsageProjection;
  channels: ChannelStore;
  attachments: AttachmentStore;
  live: ChannelLiveHub;
  roster: RosterStore;
  runtime: BotRuntime;
  attention: BotAttentionQuery;
  sourcePolicy: BotSourcePolicyStore;
  humanAttention: HumanAttentionQuery;
  humanAttentionDecisions: HumanAttentionDecisions;
  grants: WorkspaceGrantStore;
  externalMessaging: OutboundMessaging;
  toolRules: ToolApprovalRuleStore;
  assignmentAccess: AssignmentAccessStore;
}

function unavailableAgentAdapter(): BotAgentAdapter {
  const unavailable = () =>
    Promise.reject(new Error('BotHarness Agent runtime is unavailable outside a DSH Host'));
  return {
    runOrchestrator: unavailable,
    runAssignment: unavailable,
    requestAssignment: () => {
      throw new Error('BotHarness Agent runtime is unavailable outside a DSH Host');
    },
    close: async () => undefined,
  };
}

type BotAgentSetup = (
  agentCtx: import('@deepseek-ai/cordis').Context,
  agent: import('@deepseek-ai/dsh-agent').Agent,
  info: BotAgentSetupInfo,
) => void;

export function createCore(
  options: {
    dshHome?: string;
    warn?: (message: string) => void;
    agents?: BotAgentAdapter;
    saveReportSpill?: (input: {
      sessionId: string;
      content: string;
    }) => Promise<{ locator: string; bytes: number; retrievalHint: string }>;
    readAssignmentTail?: (sessionId: string) => Promise<AssignmentEventTail>;
    readAssignmentReportPage?: (
      sessionId: string,
      acceptedSummary: string,
      offset: number,
    ) => Promise<AssignmentReportPage>;
    workspaces?: () => DshWorkspaceLookup | undefined;
    autoAcceptGroupInvitations?: () => boolean;
    activeQuestionMessageIds?: () => readonly string[];
    activeToolApprovalMessageIds?: () => readonly string[];
  } = {},
): BotHarnessCore {
  const dshHome = options.dshHome ?? resolveDshHome();
  const rootDir = join(dshHome, 'botharness', 'bots');
  let usage: UsageProjection | undefined;
  const registry = createPersonaBotRegistry({
    rootDir,
    onDisplayNameChanged: () => {
      try {
        live?.publishRosterCommitted();
      } catch {
        options.warn?.('bot-name-publication-failed');
      }
    },
    onPurge: (slug, removeFiles) => {
      if (usage === undefined) throw new Error('Usage purge requires a ready operational database');
      usage.purgeBot(slug, removeFiles);
    },
    cloneMemory: (destination, url) => cloneMemoryRepository({ destination, url }),
    initializeMemory: (memoryDir) => {
      const repository = ensureMemoryRepository({ memoryDir });
      return repository.ok
        ? { ok: true }
        : {
            ok: false,
            ...(repository.code === 'git-not-found' ? { code: 'git-not-found' as const } : {}),
            message: `${repository.code}: ${repository.message}`,
          };
    },
  });
  const modelPresets = createModelPresetStore(join(dshHome, 'botharness'));
  const states = createBotStateTracker();
  let live: ChannelLiveHub | undefined;
  let runtime: BotRuntime | undefined;
  const attachments = createAttachmentStore({
    rootDir: join(dshHome, 'botharness', 'attachments'),
  });
  const operationalDatabase = mountOperationalDatabase({
    dshHome,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  const sourcePolicy = createBotSourcePolicyStore(
    attachOperationalModule(operationalDatabase, 'bot-inbox'),
  );
  const externalMessaging = createOutboundMessaging({
    attachments,
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    onAdmitted: (slug, sourceEventId) => runtime?.admitExternalSource?.(slug, sourceEventId),
    onPlaced: (commit) => live?.publishCommitted(commit),
    recover: operationalDatabase.mode === 'ready',
    isBotActive: (slug) => {
      const bot = registry.get(slug);
      return operationalDatabase.mode === 'ready' && bot !== undefined && bot.paused !== true;
    },
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const initialGroupInvitationPolicy = options.autoAcceptGroupInvitations ?? (() => true);
  const groupInvitationPolicies: { policy: () => boolean }[] = [];
  const channels = createSqliteChannelStore({
    autoAcceptGroupInvitations: () =>
      (groupInvitationPolicies.at(-1)?.policy ?? initialGroupInvitationPolicy)(),
    database: attachOperationalModule(operationalDatabase, 'messaging'),
    sourcePolicy,
    databaseOwnerReady: operationalDatabase.mode === 'ready',
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    attachments,
    botDisplayName: (botSlug) => registry.get(botSlug)?.displayName,
    rootDir: join(dshHome, 'botharness', 'channels'),
    onCommitted: (commit) => {
      let publicationFailed = false;
      try {
        live?.publishCommitted(commit);
      } catch {
        publicationFailed = true;
      }
      if (commit.message.memberDeparture !== undefined) {
        try {
          runtime?.admitGroupMessage(commit.channelId, commit.message.id);
        } catch {
          runtime?.retryGroupMessageAdmission?.(commit.channelId, commit.message.id);
          options.warn?.('group-admission-wake-failed-retrying');
        }
      }
      if (publicationFailed) options.warn?.('channel-live-publication-failed');
    },
    onRecordChanged: () => live?.publishRosterCommitted(),
    onAdmissionChanged: (channelId, messageId, message) =>
      live?.publishAdmission(channelId, messageId, message),
    onHumanReadChanged: (channelId, humanId, revision) =>
      live?.publishHumanRead(channelId, humanId, revision),
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  const attention = createBotAttentionQuery(
    attachOperationalModule(operationalDatabase, 'messaging'),
    channels,
  );
  const humanAttentionDatabase = attachOperationalModule(operationalDatabase, 'human-attention');
  const humanAttention = createHumanAttentionQuery(
    humanAttentionDatabase,
    options.activeQuestionMessageIds,
    options.activeToolApprovalMessageIds,
  );
  const humanAttentionDecisions = createHumanAttentionDecisions(humanAttentionDatabase);
  live = createChannelLiveHub(channels, {
    snapshot: () =>
      personaBotActivitySnapshot(
        registry.list().map((bot) => bot.slug),
        states,
      ),
    onChange: (changed) => states.onActivity(() => changed()),
  });
  if (operationalDatabase.mode === 'ready')
    for (const bot of registry.list())
      if (bot.paused === true) channels.cancelInvitationsForBot(bot.slug);
  const ownership = createSessionOwnership(
    attachOperationalModule(operationalDatabase, 'session-ownership'),
  );
  const memory = createMemoryService({
    registry,
    ownership,
    database: operationalDatabase,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  usage =
    operationalDatabase.mode === 'ready'
      ? createUsageProjection({
          ownership,
          database: operationalDatabase,
          botCreatedAt: (slug) => registry.get(slug)?.createdAt,
        })
      : undefined;
  const grants = createWorkspaceGrantStore({
    database: attachOperationalModule(operationalDatabase, 'workspace-grants'),
    workspaces: options.workspaces ?? (() => undefined),
  });
  const toolRules = createToolApprovalRuleStore(
    attachOperationalModule(operationalDatabase, 'tool-approval-rules'),
  );
  const assignmentAccess = createAssignmentAccessStore(
    attachOperationalModule(operationalDatabase, 'assignment-access'),
  );
  const orchestratorCwd = (bot: { slug: string }): string | undefined =>
    registry.memoryDirFor(bot.slug);
  const hostTools = new Set<string>();
  const botAgentSetups = new Set<BotAgentSetup>();
  const contributeBotAgentSetup = (contribute: BotAgentSetup): (() => void) => {
    botAgentSetups.add(contribute);
    return () => {
      botAgentSetups.delete(contribute);
    };
  };
  const runBotAgentSetups = (
    agentCtx: import('@deepseek-ai/cordis').Context,
    agent: import('@deepseek-ai/dsh-agent').Agent,
    info: BotAgentSetupInfo,
  ): void => {
    for (const contribute of [...botAgentSetups]) contribute(agentCtx, agent, info);
  };

  runtime = createBotRuntime({
    database: operationalDatabase,
    externalMessaging,
    sourcePolicy,
    registry,
    channels,
    attachments,
    agents: options.agents ?? unavailableAgentAdapter(),
    ...(options.saveReportSpill === undefined ? {} : { saveReportSpill: options.saveReportSpill }),
    ...(options.readAssignmentTail === undefined
      ? {}
      : { readAssignmentTail: options.readAssignmentTail }),
    ...(options.readAssignmentReportPage === undefined
      ? {}
      : { readAssignmentReportPage: options.readAssignmentReportPage }),
    memory,
    ownership,
    grants,
    assignmentAccess,
    workspaceRoot: join(dshHome, 'botharness', 'runtime-workspaces'),
    orchestratorCwd,
    ...(options.warn === undefined ? {} : { warn: options.warn }),
  });
  if (operationalDatabase.mode === 'ready') runtime.reconcileMemoryChangesOnStartup?.();
  return {
    rootDir,
    operationalDatabase,
    externalMessaging,
    registry,
    modelPresets,
    configureGroupInvitations: (autoAccept) => {
      const registration = { policy: autoAccept };
      groupInvitationPolicies.push(registration);
      return () => {
        const index = groupInvitationPolicies.indexOf(registration);
        if (index !== -1) groupInvitationPolicies.splice(index, 1);
      };
    },
    contributeBotAgentSetup,
    runBotAgentSetups,
    hostTools,
    states,
    ownership,
    memory,
    ...(usage === undefined ? {} : { usage }),
    grants,
    toolRules,
    assignmentAccess,
    channels,
    attention,
    sourcePolicy,
    humanAttention,
    humanAttentionDecisions,
    attachments,
    live,
    roster: createRosterStore({
      warn: options.warn,
      onCommitted: () => live?.publishRosterCommitted(),
    }),
    runtime,
  };
}

export function apply(ctx: Context, config: BotHarnessConfig): void {
  if (!config.enabled) return;
  const dshHome = resolveDshHome();
  let publishDraft: (event: ChannelDraftEvent) => void = () => undefined;
  const modelCatalog = createModelCatalog(ctx.llm);
  const modelReadiness = createModelRouteReadiness(
    {
      get: (slug) => core.registry.get(slug),
      migrateLegacyModel: (slug, expectedModel, route) =>
        core.registry.migrateLegacyModel(slug, expectedModel, route),
    },
    modelCatalog,
  );
  const agentAdapter = createDshBotAgentAdapter({
    agents: ctx.agents,
    defaultModel: (ctx as unknown as { agentDefaultModel: DshDefaultModelHost }).agentDefaultModel,
    resolveModelPlan: (slug) => core.registry.get(slug)?.modelPlan,
    hasSession: async (sessionId) => {
      const persistence = ctx.get('sessionPersistence') as unknown as
        | { stat(id: string): Promise<unknown> }
        | undefined;
      if (persistence === undefined) throw new Error('DSH Session Persistence is unavailable');
      return (await persistence.stat(sessionId)) !== undefined;
    },
    prepareModelRoute: (slug, role, retainedRoute) =>
      modelReadiness.prepare(slug, role, retainedRoute),
    orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
    defaultAgentPreset: config.agentPreset ?? DEFAULT_AGENT_PRESET,
    resolveAgentPresets: () => ctx.get('agentPresets') as DshAgentPresetHost | undefined,
    publishDraft: (event) => publishDraft(event),
    onAgentSetup: (agentCtx, agent, info) => core.runBotAgentSetups(agentCtx, agent, info),
    onOrchestratorFileSetup: (agentCtx, agent) =>
      installOrchestratorFileTools(
        agentCtx,
        agent,
        ctx.get('agentPresets') as DshAgentPresetHost | undefined,
        (name, args) => nativeExecutionRoot(core, agent.session, name, args),
      ),
    authorizeBorrow: (agent, role) => {
      const owner = core.ownership.resolve(agent.session.id);
      if (owner?.rootRole !== role) throw new Error('BotHarness Agent role mismatch');
      const denial = grantExecutionDenial(
        core,
        agent.session,
        ctx.get('sandboxPolicy'),
        ctx.get('approval'),
      );
      if (denial !== undefined) throw new Error(denial);
    },
  });
  let userQuestions: ChannelUserQuestions | undefined;
  let toolApproval: ChannelToolApproval | undefined;
  const core = createCore({
    dshHome,
    activeQuestionMessageIds: () => userQuestions?.activeMessageIds() ?? [],
    activeToolApprovalMessageIds: () => toolApproval?.activeMessageIds() ?? [],
    warn: (message) => ctx.logger.warn(message),
    agents: agentAdapter,
    saveReportSpill: async ({ sessionId, content }) => {
      const spillStore = ctx.get('spillStore') as unknown as
        | {
            saveText(input: {
              owner: { sessionId: string };
              source: { kind: 'session-reference'; sessionId: string; label: string };
              suggestedName: string;
              content: string;
            }): Promise<{ locator: string; bytes: number; retrievalHint: string }>;
          }
        | undefined;
      if (spillStore === undefined) throw new Error('DSH Spill service is unavailable');
      return spillStore.saveText({
        owner: { sessionId },
        source: { kind: 'session-reference', sessionId, label: 'Assignment report' },
        suggestedName: 'assignment-report.txt',
        content,
      });
    },
    readAssignmentTail: async (sessionId) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readBoundedAssignmentTail(query, sessionId);
    },
    readAssignmentReportPage: async (sessionId, acceptedSummary, offset) => {
      const query = ctx.get('sessionQuery') as unknown as AssignmentSessionQuery | undefined;
      if (query === undefined) throw new Error('DSH Session Query is unavailable');
      return readAssignmentReportPage(query, sessionId, acceptedSummary, offset);
    },
    workspaces: () => ctx.get('workspaceRegistry') as unknown as DshWorkspaceLookup | undefined,
  });
  publishDraft = (event) => core.live.publishDraft(event);
  ctx.effect(() => () => core.operationalDatabase.close(), 'botharness: operational database');
  ctx.effect(() => {
    const controller = new AbortController();
    if (core.operationalDatabase.mode === 'ready')
      void core.channels.migrateAttachments?.(controller.signal).catch(() => {
        if (!controller.signal.aborted)
          ctx.logger.warn('attachment-migration phase=failed action=inspect-database-and-restart');
      });
    return () => controller.abort();
  }, 'botharness: retained attachment migration');
  ctx.effect(() => () => core.runtime.close(), 'botharness: bot runtime');
  ctx.effect(() => () => core.live.close(), 'botharness: Channel live hub');
  ctx.provide('botharness', core);
  ctx.effect(() => () => core.externalMessaging.close(), 'botharness: external messaging');
  ctx.inject(['dshIm'], (child) => {
    const provider = createDshImProvider(child.get('dshIm'));
    if (provider !== undefined) child.effect(() => core.externalMessaging.register(provider));
  });

  const permissionDenial = (session: import('@deepseek-ai/dsh-session').Session) =>
    grantExecutionDenial(core, session, ctx.get('sandboxPolicy'), ctx.get('approval'));

  ctx.on(
    'agent/pre-step',
    async ({ agent }, next) =>
      permissionDenial(agent.session) === undefined ? next() : { kind: 'reject' },
    { global: true },
  );
  toolApproval = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    (agent, owner) => {
      const cwd = agent.session.header.cwd ?? '';
      if (owner.rootRole === 'assignment') {
        const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
        const grantId = assignment?.permission?.grantId;
        if (grantId === undefined) return undefined;
        try {
          core.grants.requireActive(owner.botSlug, grantId);
        } catch {
          return undefined;
        }
        return JSON.stringify(['assignment', cwd, grantId]);
      }
      const activeIds = core.grants
        .list(owner.botSlug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => `${grant.id}:${grant.writeRevision ?? 0}`)
        .sort();
      return JSON.stringify(['orchestrator', cwd, activeIds]);
    },
  );
  userQuestions = new ChannelUserQuestions(
    core.channels,
    core.ownership,
    (agent) => ctx.agents.get(agent.id) === agent,
    (message) => ctx.logger.warn(message),
  );
  ctx.effect(() => () => userQuestions.close(), 'botharness: Channel user questions');
  ctx.on(
    'user-questions/request',
    async (request, next) => (await userQuestions.ask(request)) ?? next(),
    { global: true },
  );
  const approvedCalls = new Set<symbol>();
  ctx.effect(() => () => toolApproval.close(), 'botharness: Channel tool approvals');
  ctx.on('approval/request', async (request, next) => (await toolApproval.ask(request)) ?? next(), {
    global: true,
  });
  ctx.on(
    'tools/pre-execute',
    async (execution, next) => {
      const agent = execution.agent;
      if (agent === undefined || core.ownership.resolve(agent.session.id) === undefined)
        return next();
      if (!requiresHumanToolApproval(execution.name, execution.arguments)) return next();
      if (isSafeMemoryDirectoryListing(core, agent.session, execution.name, execution.arguments))
        return next();

      const computerTools = ctx.get('botharnessComputerTools') as
        | {
            ownsTool?(name: string): boolean;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(): string;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (computerTools?.ownsTool?.(execution.name) === true) {
        if (computerTools.needsAuthorization?.(agent.session.id) !== true) return next();
        const authorizationScope = computerTools.authorizationScope?.();
        const computerApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackComputer = toolApproval.track(execution);
        if (computerApproval === undefined || untrackComputer === undefined) {
          return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
        }
        try {
          const outcome = await computerApproval.request({
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason: "This PersonaBot wants to act on the profile's shared Computer.",
            signal: execution.signal,
          });
          if (outcome !== 'allowed-once') {
            return { kind: 'deny', reason: 'Human approval was ' + outcome };
          }
          if (computerTools.markAuthorized?.(agent.session.id, authorizationScope) === false)
            return {
              kind: 'deny',
              reason:
                'Computer Target changed while awaiting Human approval; request a new action.',
            };
          approvedCalls.add(execution.token);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackComputer();
        }
      }
      const browserTools = ctx.get('botharnessBrowserTools') as
        | {
            ownsTool?(name: string): boolean;
            executionSignal?(sessionId: string): AbortSignal | undefined;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(): string;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (browserTools?.ownsTool?.(execution.name) === true) {
        const browserSignal = browserTools.executionSignal?.(agent.session.id);
        if (browserTools.executionSignal !== undefined && browserSignal === undefined)
          return { kind: 'deny', reason: 'Browser Access is off for this PersonaBot' };
        if (browserTools.needsAuthorization?.(agent.session.id) !== true) return next();
        const browserAuthorizationScope = browserTools.authorizationScope?.();
        const browserApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackBrowser = toolApproval.track(execution);
        if (browserApproval === undefined || untrackBrowser === undefined) {
          return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
        }
        try {
          const outcome = await browserApproval.request({
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason: "This PersonaBot wants to act in the profile's shared Bot Browser.",
            signal: AbortSignal.any([execution.signal, browserSignal ?? execution.signal]),
          });
          if (outcome !== 'allowed-once') {
            return { kind: 'deny', reason: 'Human approval was ' + outcome };
          }
          if (browserTools.markAuthorized?.(agent.session.id, browserAuthorizationScope) === false)
            return {
              kind: 'deny',
              reason: 'Browser Target changed while awaiting Human approval; request a new action.',
            };
          approvedCalls.add(execution.token);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackBrowser();
        }
      }
      const denial = permissionDenial(agent.session);
      if (denial !== undefined) return { kind: 'deny', reason: denial };
      if (
        typeof execution.arguments === 'object' &&
        execution.arguments !== null &&
        'sandbox_permissions' in execution.arguments
      ) {
        return {
          kind: 'deny',
          reason: 'BotHarness Session cannot request sandbox permission escalation',
        };
      }
      const owner = core.ownership.resolve(agent.session.id);
      const snapshot =
        owner?.rootRole === 'assignment'
          ? core.runtime.getAssignment(owner.botSlug, owner.sessionId)?.permission
          : undefined;
      if (snapshot?.mode === 'danger-full-access') return next();
      const approval = ctx.get('approval') as ApprovalService | undefined;
      const untrack = toolApproval.track(execution);
      if (approval === undefined || untrack === undefined) {
        return { kind: 'deny', reason: 'The tool call cannot be presented for Human approval' };
      }
      try {
        const outcome = await approval.request({
          agent,
          toolName: execution.name,
          callId: execution.callId,
          reason:
            execution.name === 'channel_attachment_open'
              ? 'This PersonaBot wants to edit the selected original attachment. All references to this file will show its current contents.'
              : 'This tool call may access files outside the authorized folder.',
          signal: execution.signal,
        });
        if (outcome !== 'allowed-once') {
          return { kind: 'deny', reason: 'Human approval was ' + outcome };
        }
        if (!toolApproval.validAfterDecision(agent, execution.callId))
          return { kind: 'deny', reason: 'Approval rule scope changed' };
        approvedCalls.add(execution.token);
        return await next();
      } catch {
        return { kind: 'deny', reason: 'Human approval is unavailable' };
      } finally {
        untrack();
      }
    },
    { global: true },
  );

  ctx.tools.guard(({ agent, name, arguments: args, token }) => {
    const allowedOnce = approvedCalls.delete(token);
    return agent === undefined
      ? undefined
      : grantToolExecutionDenial(
          core,
          agent.session,
          ctx.get('sandboxPolicy'),
          ctx.get('approval'),
          name,
          args,
          allowedOnce,
        );
  });
  ctx.on(
    'tools/result',
    (execution) => {
      approvedCalls.delete(execution.token);
    },
    { global: true },
  );

  ctx.on(
    'agent/assistant-stream',
    ({ agent, frame }) => agentAdapter.acceptAssistantStream(agent.session.id, frame),
    { global: true },
  );

  const dshSessions = (ctx as unknown as { sessions: DshSessionStore }).sessions;

  const developerModeTarget: { gate?: DeveloperModeSkillGate } = {};
  registerBridge(
    ctx,
    createBridgeMethods({
      warn: (message) => ctx.logger.warn(message),
      registry: core.registry,
      modelPresets: core.modelPresets,
      modelCatalog,
      modelReadiness,
      states: core.states,
      runningSessionIds: () =>
        new Set(
          ctx.agents
            .list()
            .filter((agent) => agent.status === 'running')
            .map((agent) => agent.id),
        ),
      channels: core.channels,
      attachments: core.attachments,
      ownership: core.ownership,
      memory: core.memory,
      ...(core.usage === undefined ? {} : { usage: core.usage }),
      roster: core.roster,
      runtime: core.runtime,
      attention: core.attention,
      sourcePolicy: core.sourcePolicy,
      humanAttention: core.humanAttention,
      humanAttentionDecisions: core.humanAttentionDecisions,
      grants: core.grants,
      externalMessaging: core.externalMessaging,
      toolApproval,
      userQuestions,
      toolRules: core.toolRules,
      assignmentAccess: core.assignmentAccess,
      developerMode: {
        set: (enabled: boolean) => developerModeTarget.gate?.set(enabled),
      },
      computerAccess: {
        changed: (slug: string) => {
          const provider = ctx.get('botharnessComputerTools') as unknown as
            | { reconcileBot?: (slug: string) => Promise<void> }
            | undefined;
          const pending = provider?.reconcileBot?.(slug);
          void pending?.catch((error: unknown) => {
            ctx.logger.warn(
              `botharness: Computer tool reconcile failed for ${slug}: ${String(error)}`,
            );
          });
        },
      },
      browserAccess: {
        changed: (slug: string) => {
          const provider = ctx.get('botharnessBrowserTools') as unknown as
            | { reconcileBot?: (slug: string) => Promise<void> }
            | undefined;
          const pending = provider?.reconcileBot?.(slug);
          void pending?.catch((error: unknown) => {
            ctx.logger.warn(
              `botharness: Browser tool reconcile failed for ${slug}: ${String(error)}`,
            );
          });
        },
      },
      browserProfile: {
        changed: (slug: string) => {
          const provider = ctx.get('botharnessBrowserTools') as unknown as
            | { resetBot?: (slug: string) => void }
            | undefined;
          provider?.resetBot?.(slug);
        },
      },
    }),
  );

  ctx.inject(['skills'], (skillsCtx) => {
    const skills = (
      skillsCtx as unknown as {
        skills: {
          register(skill: {
            readonly name: string;
            readonly description: string;
            readonly whenToUse: string;
            readonly content: string;
            readonly invocation: {
              readonly modelInvocable: boolean;
              readonly userInvocable: boolean;
            };
            readonly source: string;
            readonly provider: string;
          }): () => void;
        };
      }
    ).skills;
    developerModeTarget.gate = new DeveloperModeSkillGate({
      register: (definition) => {
        let dispose: (() => void) | undefined;
        skillsCtx.effect(() => {
          dispose = skills.register(definition);
          return () => dispose?.();
        }, 'botharness: operational logs skill');
        return () => dispose?.();
      },
    });
  });

  ctx.inject(['connection'], (connectionCtx) => {
    const connection = (
      connectionCtx as unknown as {
        connection: {
          fetch: {
            register(route: {
              path: string;
              methods: readonly ('GET' | 'POST')[];
              requestBody: 'buffered' | 'streaming';
              fetch(request: Request): Promise<Response>;
            }): () => Promise<void>;
          };
        };
      }
    ).connection;
    connectionCtx.effect(() => {
      return connection.fetch.register({
        path: CHANNEL_STREAM_PATH,
        methods: ['GET'],
        requestBody: 'buffered',
        fetch: async (request) => {
          return core.live.open(request);
        },
      });
    }, 'botharness: Channel live stream');
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: MEMORY_FILE_DOWNLOAD_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: createMemoryFileHttp(core.memory),
        }),
      'botharness: current Memory file download',
    );
    const attachmentHttp = createAttachmentHttp(core.attachments, core.channels, async (input) => {
      const ref = await core.externalMessaging.acquireFile(
        input.slug,
        input.sourceEventId,
        input.attachmentId,
        input.signal,
      );
      const signal = AbortSignal.any([
        input.signal,
        core.externalMessaging.inbound.sourceSignal(input.slug, input.sourceEventId),
      ]);
      const downloaded = await core.attachments.download(ref.fileId!, ref.name, signal);
      return downloaded;
    });
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_UPLOAD_PATH,
          methods: ['POST'],
          requestBody: 'streaming',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment upload',
    );
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: CHANNEL_ATTACHMENT_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: attachmentHttp,
        }),
      'botharness: Channel attachment download',
    );
    const botAvatarHttp = createBotAvatarHttp(core.registry);
    connectionCtx.effect(
      () =>
        connection.fetch.register({
          path: BOT_AVATAR_PATH,
          methods: ['GET'],
          requestBody: 'buffered',
          fetch: botAvatarHttp,
        }),
      'botharness: PersonaBot avatar',
    );
  });
  const activity = createDshActivityProjection({
    ownership: core.ownership,
    states: core.states,
    describeCall: (sessionId, name, args) => {
      const agent = ctx.agents.list().find((candidate) => candidate.session.id === sessionId);
      if (agent === undefined) return undefined;
      const definition = ctx.tools.get(name, agent);
      if (definition === undefined) return undefined;
      const view = definition.presentCall?.(args);
      const publicDetail = readPublicToolDetail(definition, args);
      return {
        name: definition.name,
        ...(view === undefined ? {} : { view }),
        ...(publicDetail === undefined ? {} : { publicDetail }),
      };
    },
  });
  ctx.effect(() =>
    core.states.onActivity((event) => ctx.emit('botharness/personabot/activity', event)),
  );

  ctx.on(
    'session/event',
    (session, event) => {
      activity.handleSessionEvent(session.id, event);
      core.usage?.handleSessionEvent(session.id, event);
      handleCompactionEvent(
        {
          ownership: core.ownership,
          memory: core.memory,
          warn: (message) => ctx.logger.warn(message),
        },
        session.id,
        event.type,
      );
    },
    { global: true },
  );
  ctx.on(
    'agent/created',
    ({ agent }) => {
      activity.handleAgentCreated(agent.session);
      core.usage?.primeSession(agent.session.id, agent.session.snapshotEvents());
      const owner = core.ownership.resolve(agent.session.id);
      if (owner !== undefined) {
        installBotSubagentModelTools(
          agent.ctx,
          agent,
          () => core.registry.get(owner.botSlug)?.modelPlan,
        );
      }
    },
    { global: true },
  );
  ctx.on(
    'agent/disposed',
    ({ agent }) => {
      activity.handleSessionDisposed(agent.session.id);
    },
    { global: true },
  );
  activity.rebuild(dshSessions.list());
  for (const session of dshSessions.list())
    core.usage?.primeSession(session.id, session.snapshotEvents());
  if (core.usage !== undefined) {
    const usage = core.usage;

    ctx.inject(['sessionQuery'], (sessionCtx) => {
      const query = sessionCtx.get('sessionQuery') as unknown as
        | {
            readSession(id: string): Promise<{
              events: readonly DshSessionEvent[];
              inheritedEventCount?: number;
            }>;
          }
        | undefined;
      if (query === undefined) return;
      const readUsageLog = async (sessionId: string) => {
        try {
          const snapshot = await query.readSession(sessionId);
          return {
            events: snapshot.events,
            inheritedEventCount: snapshot.inheritedEventCount ?? 0,
          };
        } catch (error) {
          ctx.logger.warn(`botharness: usage log read failed for ${sessionId}: ${String(error)}`);
          return undefined;
        }
      };
      const tracked = core.ownership.list().map((record) => record.sessionId);
      void usage.rebuild(tracked, readUsageLog).then(
        (report) => {
          if (report.legacyBaselineBots !== undefined) {
            ctx.logger.warn(
              `botharness: usage legacy baseline retained; phase=reconcile bots=${report.legacyBaselineBots} historical_backfill=unverifiable`,
            );
          }
          ctx.logger.info(
            `botharness: usage reconciliation completed (${report.folded} attempts, ${report.failed} failed sessions)`,
          );
        },
        (error: unknown) => {
          ctx.logger.warn(`botharness: usage projection rebuild failed: ${String(error)}`);
        },
      );
    });
  }

  ctx.inject(['storageDomain'], (storageCtx) => {
    void core.roster.attach(storageCtx.storageDomain).catch((error: unknown) => {
      ctx.logger.warn(`botharness: failed to open the roster domain: ${String(error)}`);
    });
    storageCtx.effect(() => () => core.roster.detach(), 'botharness: roster domain');
  });

  ctx.systemPrompt.section({
    name: 'botharness:persona',
    order: PERSONA_SECTION_ORDER,
    text: ({ agent }) => core.memory.personaForSession(agent?.session?.id),
  });
}

declare module '@deepseek-ai/cordis' {
  interface Events {
    'botharness/personabot/activity'(event: PersonaBotActivityEvent): void;
  }
}
