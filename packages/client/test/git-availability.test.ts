import { describe, expect, it, vi } from 'vitest';

import { createActions } from '../src/client/actions.js';
import { parseGitAvailability, type BridgeCall } from '../src/client/bridge.js';
import { createStore } from '../src/client/store.js';

const IDLE = { installable: true, install: { phase: 'idle' } } as const;

describe('Git availability', () => {
  it('parses the Host Git decision', () => {
    expect(parseGitAvailability({ available: true, version: '2.47.1', source: 'managed' })).toEqual(
      {
        available: true,
        version: '2.47.1',
        source: 'managed',
        installable: false,
        install: { phase: 'idle' },
      },
    );
    expect(
      parseGitAvailability({ available: false, reason: 'too-old', version: '2.20.1', ...IDLE }),
    ).toEqual({ available: false, reason: 'too-old', version: '2.20.1', ...IDLE });
    expect(
      parseGitAvailability({
        available: false,
        reason: 'missing',
        installable: true,
        install: { phase: 'downloading', received: 10, total: 20 },
      }),
    ).toMatchObject({ install: { phase: 'downloading', received: 10, total: 20 } });
    expect(
      parseGitAvailability({
        available: false,
        reason: 'missing',
        install: { phase: 'failed', reason: 'checksum', detail: 'mismatch' },
      }).install,
    ).toEqual({ phase: 'failed', reason: 'checksum', detail: 'mismatch' });
    expect(() => parseGitAvailability({ available: false, reason: 'other' })).toThrow();
    expect(() => parseGitAvailability({ available: true })).toThrow();
  });

  it('checks Host Git again on demand and stores the result', async () => {
    const clientStore = createStore();
    const call = vi.fn<BridgeCall>(async (endpoint) =>
      endpoint === 'gitStatus'
        ? { ok: true, value: { available: false, reason: 'missing', ...IDLE } }
        : { ok: false, error: { code: 'unexpected', message: endpoint, details: {} } },
    );

    await createActions(call, clientStore).refreshGit();

    expect(call).toHaveBeenCalledWith('gitStatus', {}, undefined);
    expect(clientStore.getSnapshot().git).toEqual({ available: false, reason: 'missing', ...IDLE });
  });

  it('starts the Managed Git install and follows it until Git is usable', async () => {
    vi.useFakeTimers();
    try {
      const clientStore = createStore();
      const statuses = [{ phase: 'downloading', received: 30, total: 60 }, { phase: 'unpacking' }];
      const call = vi.fn<BridgeCall>(async (endpoint) => {
        if (endpoint === 'gitInstall') {
          return {
            ok: true,
            value: {
              available: false,
              reason: 'missing',
              installable: true,
              install: { phase: 'downloading', received: 0 },
            },
          };
        }
        const next = statuses.shift();
        return {
          ok: true,
          value:
            next === undefined
              ? { available: true, version: '2.53.0', source: 'managed', ...IDLE }
              : { available: false, reason: 'missing', installable: true, install: next },
        };
      });

      const done = createActions(call, clientStore).installGit();
      await vi.advanceTimersByTimeAsync(0);
      expect(clientStore.getSnapshot().git?.install).toEqual({ phase: 'downloading', received: 0 });
      await vi.advanceTimersByTimeAsync(500);
      expect(clientStore.getSnapshot().git?.install).toMatchObject({ received: 30, total: 60 });
      await vi.advanceTimersByTimeAsync(1000);
      await done;

      expect(clientStore.getSnapshot().git).toMatchObject({ available: true, source: 'managed' });
      expect(call.mock.calls.map(([endpoint]) => endpoint)).toEqual([
        'gitInstall',
        'gitStatus',
        'gitStatus',
        'gitStatus',
      ]);
    } finally {
      vi.useRealTimers();
    }
  });
});
