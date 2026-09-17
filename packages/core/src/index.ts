export {
  apply,
  Config,
  createCore,
  DEFAULT_CONFIG,
  inject,
  MEMORY_TREE_SECTION_ORDER,
  name,
  PERSONA_SECTION_ORDER,
  SETTINGS_NAMESPACE,
} from './plugin.js';
export type { BotHarnessConfig, BotHarnessCore } from './plugin.js';
export { createPersonaBotRegistry } from './bots/registry.js';
export type { PersonaBotRegistry, PersonaBotRegistryOptions } from './bots/registry.js';
export { isPersonaBotRecord } from './bots/persona-bot.js';
export type {
  CreatePersonaBotInput,
  CreatePersonaBotResult,
  PersonaBotRecord,
  RemovePersonaBotOptions,
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
