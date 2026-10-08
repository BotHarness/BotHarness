import type { ProviderCredentialFailure } from './credential-health.js';

interface NativeCredentialReadiness {
  providers(): { provider: string; settingsNs: string; settingsPath: readonly string[] }[];
  settings(): { ns: string; value: unknown }[];
  describe(ref: string): Promise<{ configured: boolean }>;
}
export function createCredentialReadiness(
  native: NativeCredentialReadiness,
): (provider: string) => Promise<ProviderCredentialFailure | undefined> {
  return async (provider) => {
    const entry = native.providers().find((candidate) => candidate.provider === provider);
    if (!entry) return undefined;
    let config = native.settings().find((candidate) => candidate.ns === entry.settingsNs)?.value;
    for (const key of entry.settingsPath) {
      config =
        typeof config === 'object' && config !== null
          ? (config as Record<string, unknown>)[key]
          : undefined;
    }
    const ref =
      typeof config === 'object' && config !== null
        ? (config as Record<string, unknown>)['apiKeyEnv']
        : undefined;
    if (typeof ref !== 'string' || !ref) return undefined;
    return (await native.describe(ref)).configured ? undefined : 'missing';
  };
}
