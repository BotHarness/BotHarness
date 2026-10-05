import { expect, it } from 'vitest';
import {
  loadMessagingDefaults,
  saveMessagingDefaults,
  type BridgeCall,
} from '../src/client/bridge.js';

const defaults = {
  platform: 'slack' as const,
  collection: 'mentions' as const,
  wake: 'digest' as const,
  count: 5,
  intervalSeconds: 30,
  identityEnabled: true,
  revision: 2,
  changedAt: '2026-10-05T00:00:00Z',
};
it('reads back the saved platform and refuses another platform response', async () => {
  const calls: { method: string; payload: unknown }[] = [];
  const call: BridgeCall = async (method, payload) => {
    calls.push({ method, payload });
    return { ok: true, value: defaults };
  };
  const { revision, changedAt: _at, ...preferences } = defaults;
  expect(await saveMessagingDefaults(call, { ...preferences, expectedRevision: revision })).toEqual(
    defaults,
  );
  expect(calls.map((c) => c.payload)).toEqual([
    { input: { ...preferences, expectedRevision: 2 } },
    { platform: 'slack' },
  ]);
  await expect(loadMessagingDefaults(call)).rejects.toMatchObject({ code: 'invalid-response' });
});
