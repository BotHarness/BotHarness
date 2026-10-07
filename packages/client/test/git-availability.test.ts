import { describe, expect, it, vi } from 'vitest';

import { createActions } from '../src/client/actions.js';
import { parseGitAvailability, type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

describe('Git availability', () => {
  it('parses the Host Git decision', () => {
    expect(parseGitAvailability({ available: true, version: '2.47.1' })).toEqual({
      available: true,
      version: '2.47.1',
    });
    expect(
      parseGitAvailability({ available: false, reason: 'too-old', version: '2.20.1' }),
    ).toEqual({ available: false, reason: 'too-old', version: '2.20.1' });
    expect(parseGitAvailability({ available: false, reason: 'missing' })).toEqual({
      available: false,
      reason: 'missing',
    });
    expect(() => parseGitAvailability({ available: false, reason: 'other' })).toThrow();
    expect(() => parseGitAvailability({ available: true })).toThrow();
  });

  it('checks Host Git again on demand and stores the result', async () => {
    const clientStore = createStore();
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'gitStatus'
        ? { ok: true, value: { available: false, reason: 'missing' } }
        : { ok: false, error: { code: 'unexpected', message: endpoint, details: {} } },
    );

    await createActions(call, clientStore).refreshGit();

    expect(call).toHaveBeenCalledWith('gitStatus', {}, undefined);
    expect(clientStore.getSnapshot().git).toEqual({ available: false, reason: 'missing' });
  });
});
