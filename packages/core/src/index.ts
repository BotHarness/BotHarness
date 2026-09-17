import { join } from 'node:path';

import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

import { createPersonaBotRegistry, type PersonaBotRegistry } from './bots/registry.js';
import { resolveDshHome } from './im/config-store.js';
import { createBotStateTracker, type BotStateTracker } from './state/bot-state.js';

export const name = 'botharness-core';

export const inject = ['settings'];

export const SETTINGS_NAMESPACE = 'botharness';

export interface BotHarnessConfig {
  enabled: boolean;
}

export const DEFAULT_CONFIG: BotHarnessConfig = {
  enabled: true,
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 BotHarness core'),
});

export interface BotHarnessCore {
  rootDir: string;
  registry: PersonaBotRegistry;
  states: BotStateTracker;
}

export function createCore(options: { dshHome?: string } = {}): BotHarnessCore {
  const rootDir = join(options.dshHome ?? resolveDshHome(), 'botharness', 'bots');
  return {
    rootDir,
    registry: createPersonaBotRegistry({ rootDir }),
    states: createBotStateTracker(),
  };
}

export function apply(ctx: Context): void {
  ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: DEFAULT_CONFIG });
  ctx.provide('botharness', createCore());
}

export {
  createPersonaBotRegistry,
  isValidSlug,
  MAX_SLUG_LENGTH,
  SLUG_PATTERN,
} from './bots/registry.js';
export type {
  CreatePersonaBotInput,
  CreatePersonaBotResult,
  PersonaBotRecord,
  PersonaBotRegistry,
  PersonaBotRegistryOptions,
  RemovePersonaBotOptions,
} from './bots/registry.js';
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
export { displayNameForBot, emptyWorkspacesDocument, resolveBotIdentity } from './bots/identity.js';
export type {
  BotDomain,
  BotIdentity,
  BotResolveResult,
  ImBotRecord,
  ResolveBotIdentityInput,
  WorkspacesDocument,
} from './bots/identity.js';
