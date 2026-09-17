export {
  apply,
  Config,
  createCore,
  DEFAULT_CONFIG,
  inject,
  name,
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
