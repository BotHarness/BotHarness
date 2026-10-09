import type { Context } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';
import { onboardingNewsAvailable } from '../src/onboarding/search.js';

function native() {
  const entries = [
    {
      options: { id: 'web', name: '@deepseek-ai/dsh-web' },
      fiber: { state: 2, config: {} as { searchProvider?: string } },
    },
    {
      options: { id: 'search', name: '@deepseek-ai/dsh-web-search-deepseek' },
      fiber: { state: 2, config: {} },
    },
  ];
  const section = {
    ns: 'search',
    value: { apiKeyEnv: 'SEARCH_KEY', maxTokens: 4096, maxUses: 5 } as Record<string, unknown>,
    secrets: [{ path: ['apiKey'], set: false }],
  };
  const dispose = vi.fn(async () => {});
  const describe = vi.fn(async (_ref: string) => ({ configured: true }));
  const acquireScope = vi.fn(async (_id: string) => ({ key: {}, [Symbol.asyncDispose]: dispose }));
  const tools = { get: vi.fn(() => ({}) as unknown) };
  const services: Record<string, unknown> = {
    web: {},
    configEditor: { configuration: () => entries.map((entry) => ({ entry })) },
    settings: { describe: vi.fn(() => [section]) },
    credentials: { describe },
    agentPresets: { acquireScope },
  };
  const ctx = { get: (name: string) => services[name], tools } as unknown as Context;
  return { ctx, entries, section, services, describe, dispose, acquireScope, tools };
}
it('uses the search credential reference and actual preset Tool scope, then releases the lease', async () => {
  const n = native();
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(true);
  expect(n.describe).toHaveBeenCalledExactlyOnceWith('SEARCH_KEY');
  expect(n.acquireScope).toHaveBeenCalledExactlyOnceWith('standard');
  expect(n.tools.get).toHaveBeenCalledWith('web_search', expect.any(Object));
  expect(n.dispose).toHaveBeenCalledOnce();
});
it('does not infer search from a working chat key, and reads repairs on the next query', async () => {
  const n = native();
  n.describe.mockResolvedValueOnce({ configured: false });
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(false);
  expect(n.acquireScope).not.toHaveBeenCalled();
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(true);
});
it.each(['web', 'settings', 'configEditor', 'agentPresets', 'credentials'])(
  'falls back when %s is absent',
  async (name) => {
    const n = native();
    delete n.services[name];
    expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(false);
  },
);
it('accepts native redacted literal-key presence without reading or returning its secret', async () => {
  const n = native();
  n.section.secrets[0]!.set = true;
  delete n.services['credentials'];
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(true);
  expect(n.describe).not.toHaveBeenCalled();
});
it.each([
  'missing-provider',
  'unloaded-provider',
  'other-provider',
  'invalid-endpoint',
  'invalid-limit',
  'missing-ref',
])('falls back for %s', async (mode) => {
  const n = native();
  if (mode === 'missing-provider') n.entries.pop();
  if (mode === 'unloaded-provider') n.entries[1]!.fiber.state = 3;
  if (mode === 'other-provider') n.entries[0]!.fiber.config.searchProvider = 'custom-search';
  if (mode === 'invalid-endpoint') n.section.value['baseURL'] = 'not a url';
  if (mode === 'invalid-limit') n.section.value['maxUses'] = 0;
  if (mode === 'missing-ref') delete n.section.value['apiKeyEnv'];
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(false);
});
it('falls back when the selected Bot preset does not expose web_search', async () => {
  const n = native();
  n.tools.get.mockReturnValue(undefined);
  expect(await onboardingNewsAvailable(n.ctx, 'minimal')).toBe(false);
  expect(n.dispose).toHaveBeenCalledOnce();
});
it('fails closed on credential errors and always disposes a queried Tool scope', async () => {
  const n = native();
  n.describe.mockRejectedValueOnce(Error('credential unavailable'));
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(false);
  n.tools.get.mockImplementation(() => {
    throw Error('scope unavailable');
  });
  expect(await onboardingNewsAvailable(n.ctx, 'standard')).toBe(false);
  expect(n.dispose).toHaveBeenCalledOnce();
});
