import { describe, expect, it, vi } from 'vitest';

import { createModelCatalog } from '../src/models/catalog.js';
import { createProviderCredentialHealth } from '../src/models/credential-health.js';

function fakeLlm() {
  return {
    listProviders: () => [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'opencode-go', name: 'OpenCode Go' },
    ],
    listModels: async (provider: string) =>
      provider === 'deepseek'
        ? [{ id: 'deepseek-chat', name: 'Chat' }]
        : [{ id: 'deepseek-v4.1-flash', name: 'Flash' }],
    resolveModelInfo: async () => ({}),
    resolveCallConfig: vi.fn(async () => ({})),
  };
}

describe('provider credential health', () => {
  it('marks a provider after a credential failure and forgets it on reset', async () => {
    const health = createProviderCredentialHealth();
    const llm = fakeLlm();
    const catalog = createModelCatalog(llm as never, {
      credentials: health,
      defaultRoute: () => ({
        provider: 'opencode-go',
        model: 'deepseek-v4.1-flash',
      }),
    });

    health.observe('opencode-go', 'RATE_LIMITED');
    health.observe('deepseek', 'MISSING_CREDENTIAL');
    expect((await catalog.list()).map((entry) => [entry.provider, entry.credential])).toEqual([
      ['deepseek', 'missing'],
      ['opencode-go', undefined],
    ]);
    await expect(
      catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' }),
    ).rejects.toThrow('Provider deepseek has no API key');
    await catalog.validate({
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    });
    expect(catalog.defaultRoute?.()).toEqual({
      provider: 'opencode-go',
      model: 'deepseek-v4.1-flash',
    });

    health.observe('deepseek', 'INVALID_CREDENTIAL');
    await expect(
      catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' }),
    ).rejects.toThrow('has an invalid API key');

    health.reset();
    expect((await catalog.list()).every((entry) => entry.credential === undefined)).toBe(true);
    await catalog.validate({ provider: 'deepseek', model: 'deepseek-chat' });
  });
});
