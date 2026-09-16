import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

export const name = 'deepseekbot';

export const inject = ['settings'];

export const SETTINGS_NAMESPACE = 'deepseekbot';

export interface DeepSeekBotConfig {
  enabled: boolean;
  dshHome: string;
}

export const DEFAULT_CONFIG: DeepSeekBotConfig = {
  enabled: true,
  dshHome: '',
};

export const Config = Schema.object({
  enabled: Schema.boolean().default(DEFAULT_CONFIG.enabled).description('启用 DeepSeekBot 插件'),
  dshHome: Schema.string()
    .default(DEFAULT_CONFIG.dshHome)
    .description('DSH_HOME 覆盖（留空则读取环境变量）'),
});

export function apply(ctx: Context): void {
  ctx.settings.register(SETTINGS_NAMESPACE, Config, { base: DEFAULT_CONFIG });
}

export {
  canonicalizeWorkspacePath,
  createImStoreReader,
  parseImBotsConfig,
  parseWorkspacesDocument,
  resolveBotFromStores,
  resolveDshHome,
} from './im/config-store.js';
export type { ImStoreReaderOptions, ImStoresSnapshot } from './im/config-store.js';
export { emptyWorkspacesDocument, resolveBotIdentity, slugForBot } from './bots/identity.js';
export type {
  BotDomain,
  BotIdentity,
  BotResolveResult,
  ImBotRecord,
  ResolveBotIdentityInput,
  WorkspacesDocument,
} from './bots/identity.js';
