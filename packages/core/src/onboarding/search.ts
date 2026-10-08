import type { Context } from '@deepseek-ai/cordis';
import type { ScopeKey } from '@deepseek-ai/dsh-scope';

interface NativeSearchConfiguration {
  configuration(): {
    entry: {
      options: { id: string; name: string };
      fiber?: { state: number; config: { searchProvider?: string } };
    };
  }[];
}
interface NativeSearchSettings {
  describe(options: { redactSecrets: true }): {
    ns: string;
    value: unknown;
    secrets?: { path: readonly (string | number)[]; set: boolean }[];
  }[];
}
interface NativeSearchPresets {
  acquireScope(id: string): Promise<{ key: ScopeKey } & AsyncDisposable>;
}

export async function onboardingNewsAvailable(ctx: Context, preset: string): Promise<boolean> {
  try {
    if (!ctx.get('web')) return false;
    const editor = ctx.get('configEditor') as NativeSearchConfiguration | undefined;
    const settings = ctx.get('settings') as NativeSearchSettings | undefined;
    const presets = ctx.get('agentPresets') as NativeSearchPresets | undefined;
    if (!editor || !settings || !presets) return false;
    const entries = editor
      .configuration()
      .map(({ entry }) => entry)
      .filter((entry) => entry.fiber?.state === 2);
    const web = entries.filter((entry) => entry.options.name === '@deepseek-ai/dsh-web');
    const providers = entries.filter(
      (entry) => entry.options.name === '@deepseek-ai/dsh-web-search-deepseek',
    );
    if (web.length !== 1 || providers.length !== 1) return false;
    const selected = web[0]!.fiber!.config.searchProvider ?? process.env.DSH_WEB_SEARCH_PROVIDER;
    if (selected !== undefined && selected !== 'deepseek-official') return false;
    const section = settings
      .describe({ redactSecrets: true })
      .find((row) => row.ns === providers[0]!.options.id);
    if (!section || typeof section.value !== 'object' || section.value === null) return false;
    const config = section.value as Record<string, unknown>;
    const endpoint = config['baseURL'] ?? process.env.DEEPSEEK_SEARCH_BASE_URL;
    if (endpoint !== undefined && (typeof endpoint !== 'string' || !URL.canParse(endpoint)))
      return false;
    for (const key of ['maxTokens', 'maxUses']) {
      if (typeof config[key] !== 'number' || !Number.isInteger(config[key]) || config[key] <= 0)
        return false;
    }
    const literal =
      section.secrets?.some(
        (secret) => secret.path.length === 1 && secret.path[0] === 'apiKey' && secret.set,
      ) === true;
    const ref = config['apiKeyEnv'];
    const credentials = ctx.get('credentials') as
      | {
          describe(ref: string): Promise<{ configured: boolean }>;
        }
      | undefined;
    if (
      !literal &&
      (!credentials ||
        typeof ref !== 'string' ||
        !ref ||
        !(await credentials.describe(ref)).configured)
    )
      return false;
    const lease = await presets.acquireScope(preset);
    try {
      return ctx.tools.get('web_search', lease.key) !== undefined;
    } finally {
      await lease[Symbol.asyncDispose]();
    }
  } catch {
    return false;
  }
}
