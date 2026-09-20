export {
  apply,
  Config,
  createCore,
  DEFAULT_CONFIG,
  inject,
  MEMORY_TREE_SECTION_ORDER,
  name,
  PERSONA_SECTION_ORDER,
} from './plugin.js';
export type { BotHarnessConfig, BotHarnessCore } from './plugin.js';
export { createBridgeMethods } from './bridge/methods.js';
export type {
  BridgeError,
  BridgeMethods,
  BridgeMethodsDeps,
  BridgeResult,
  PersonaBotDetail,
  PersonaBotSummary,
} from './bridge/methods.js';
export {
  BRIDGE_NAMESPACE,
  BRIDGE_SERVICE_KEY,
  BotharnessBridgeService,
  registerBridge,
} from './bridge/rpc.js';
export {
  createRosterStore,
  RosterStore,
  RosterUnavailableError,
  RosterUnknownSectionError,
} from './roster/store.js';
export type { RosterDomainFacility, RosterSection, RosterSnapshot } from './roster/store.js';
export { rosterDomainSpec, rosterDomainState, rosterSectionRecord } from './roster/spec.js';
export type { RosterDomainState, RosterSectionRecord } from './roster/spec.js';
export { createPersonaBotRegistry } from './bots/registry.js';
export type { PersonaBotRegistry, PersonaBotRegistryOptions } from './bots/registry.js';
export {
  dmChannelId,
  groupChannelIdBase,
  isChannelMessage,
  isChannelRecord,
  isValidChannelId,
  slugifyChannelName,
} from './channels/channel.js';
export type {
  ChannelMessage,
  ChannelMessageAuthor,
  ChannelMessageExternal,
  ChannelRecord,
  ChannelType,
} from './channels/channel.js';
export { createChannelStore, DEFAULT_MESSAGE_PAGE, MAX_MESSAGE_PAGE } from './channels/store.js';
export type {
  ChannelReadOptions,
  ChannelStore,
  ChannelStoreOptions,
  CreateChannelGroupInput,
} from './channels/store.js';
export { isPersonaBotRecord } from './bots/persona-bot.js';
export type {
  CreatePersonaBotInput,
  CreatePersonaBotResult,
  PersonaBotPatch,
  PersonaBotRecord,
  RemovePersonaBotOptions,
  UpdatePersonaBotResult,
} from './bots/persona-bot.js';
export { isValidSlug, MAX_SLUG_LENGTH, SLUG_PATTERN } from './bots/slug.js';
export { aggregateSessionStates, createBotStateTracker } from './state/bot-state.js';
export type {
  AggregatedState,
  BotStateEvent,
  BotStateSnapshot,
  BotStateTracker,
  SessionState,
} from './state/bot-state.js';
export {
  canonicalizeWorkspacePath,
  createImStoreReader,
  parseImBotsConfig,
  parseWorkspacesDocument,
  resolveBotFromStores,
  resolveDshHome,
} from './im/config-store.js';
export type { ImStoreReaderOptions, ImStoresSnapshot } from './im/config-store.js';
export {
  createDshSessionSource,
  isInsideWorkspace,
  SESSION_TITLE_MAX_CHARS,
  sessionTitle,
  summarizeSession,
} from './sessions/source.js';
export type {
  BotSessionSource,
  DshSession,
  DshSessionEvent,
  DshSessionStore,
  SessionSummary,
} from './sessions/source.js';
export { displayNameForBot, emptyWorkspacesDocument, resolveBotIdentity } from './im/identity.js';
export type {
  BotDomain,
  BotIdentity,
  BotResolveResult,
  ImBotRecord,
  ResolveBotIdentityInput,
  WorkspacesDocument,
} from './im/identity.js';
export { createMemoryStore, MemoryWriteError } from './memory/store.js';
export type {
  MemoryEntry,
  MemoryStore,
  MemoryStoreOptions,
  MemoryWriteInput,
  MemoryWriteResult,
} from './memory/store.js';
export type { MemoryCommit } from './memory/git.js';
export { formatMemoryTree, MEMORY_TREE_LIMIT } from './memory/tree.js';
export type {
  MemoryTreeEntry,
  MemoryTreeFile,
  MemoryTreeFolder,
  MemoryTreeOverflow,
} from './memory/tree.js';
export type { MemorySearchHit } from './memory/search.js';
export { createMemoryTools } from './memory/tools.js';
export type { MemoryToolsOptions } from './memory/tools.js';
export { createMemoryService } from './memory/service.js';
export type { MemoryAgentRef, MemoryService, MemoryServiceOptions } from './memory/service.js';
export {
  mountOperationalDatabase,
  OPERATIONAL_DATABASE_FILENAME,
  OperationalDatabaseError,
} from './database/owner.js';
export type {
  OperationalDatabaseDiagnostics,
  OperationalDatabaseErrorCode,
  OperationalDatabaseErrorDetails,
  OperationalDatabaseMetrics,
  OperationalDatabaseMode,
  OperationalDatabaseOwner,
  OperationalDatabaseOwnerOptions,
  PostCommitNotification,
  ProfileWriterLeaseMetadata,
} from './database/owner.js';
export { BOT_HARNESS_SCHEMA_PLAN } from './database/schema-plan.js';
export { createBotRuntime } from './runtime/bot-runtime.js';
export type {
  AssignmentAgentRun,
  AssignmentActivity,
  AssignmentDetail,
  AssignmentReport,
  AssignmentReportInput,
  AssignmentReportState,
  AssignmentSummary,
  BotAgentAdapter,
  BotRuntime,
  BotRuntimeOptions,
  ChannelMessageView,
  HandleDmMessageInput,
  OrchestratorAgentRun,
  OrchestratorChannelAccess,
} from './runtime/bot-runtime.js';
export { createDshBotAgentAdapter } from './runtime/dsh-bot-agent-adapter.js';
export type { DshAgentHost, DshBotAgentAdapterOptions } from './runtime/dsh-bot-agent-adapter.js';
export {
  defineSchemaPlan,
  FOUNDATION_SCHEMA_GENERATION,
  FOUNDATION_SCHEMA_PLAN,
  LEGACY_FORWARD_MIGRATION_PLAN,
} from './database/schema.js';
export type {
  LegacyForwardMigrationPlanEntry,
  SchemaMigration,
  SchemaPlan,
} from './database/schema.js';
