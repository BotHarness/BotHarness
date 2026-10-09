import { expect, it, vi } from 'vitest';
import { createCredentialReadiness } from '../src/models/credential-readiness.js';

it('describes the current native reference without retrieving secrets or calling a model', async () => {
  const describe = vi.fn(async () => ({ configured: false }));
  let reference = 'EMPTY_KEY';
  const readiness = createCredentialReadiness({
    providers: () => [
      { provider: 'official', settingsNs: 'native', settingsPath: [] },
      { provider: 'gateway', settingsNs: 'pi', settingsPath: ['providers', 'custom'] },
    ],
    settings: () => [
      { ns: 'native', value: { apiKeyEnv: reference } },
      { ns: 'pi', value: { providers: { custom: { apiKeyEnv: 'GATEWAY_KEY' } } } },
    ],
    describe,
  });
  expect(await readiness('official')).toBe('missing');
  expect(describe).toHaveBeenLastCalledWith('EMPTY_KEY');
  reference = 'CONFIGURED_KEY';
  describe.mockResolvedValue({ configured: true });
  expect(await readiness('official')).toBeUndefined();
  expect(describe).toHaveBeenLastCalledWith('CONFIGURED_KEY');
  expect(await readiness('gateway')).toBeUndefined();
  expect(describe).toHaveBeenLastCalledWith('GATEWAY_KEY');
  describe.mockClear();
  expect(await readiness('ambient')).toBeUndefined();
  expect(describe).not.toHaveBeenCalled();
});
