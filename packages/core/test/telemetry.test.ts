import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createTelemetryService,
  fetchTelemetrySender,
  INSTALL_ID_FILE,
  installedDshVersion,
  pluginStartedProperties,
  TELEMETRY_API_KEY,
  TELEMETRY_ENDPOINT,
  telemetryDecision,
  type TelemetryBatch,
  type TelemetrySender,
} from '../src/telemetry/service.js';
import { createBridgeMethods } from '../src/bridge/methods.js';

const dirs: string[] = [];

function dataDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'bh-telemetry-'));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const STARTED = pluginStartedProperties({
  pluginVersion: '1.0.2',
  dshVersion: '0.2.0-rc.1',
  os: 'darwin',
  arch: 'arm64',
});

function recordingSender(): { send: TelemetrySender; batches: TelemetryBatch[] } {
  const batches: TelemetryBatch[] = [];
  return {
    batches,
    send: vi.fn<TelemetrySender>(async (batch) => {
      batches.push(structuredClone(batch));
    }),
  };
}

describe('telemetryDecision', () => {
  it('defaults on', () => {
    expect(telemetryDecision(undefined, {})).toEqual({ enabled: true });
    expect(telemetryDecision(true, { BOTHARNESS_TELEMETRY: '1', DO_NOT_TRACK: '0' })).toEqual({
      enabled: true,
    });
  });

  it('honours the config and both environment opt-outs', () => {
    expect(telemetryDecision(false, {})).toEqual({ enabled: false, reason: 'config' });
    expect(telemetryDecision(true, { DO_NOT_TRACK: '1' })).toEqual({
      enabled: false,
      reason: 'DO_NOT_TRACK',
    });
    expect(telemetryDecision(undefined, { BOTHARNESS_TELEMETRY: '0' })).toEqual({
      enabled: false,
      reason: 'BOTHARNESS_TELEMETRY',
    });
  });
});

describe('telemetry service', () => {
  it.each([
    ['config false', telemetryDecision(false, {})],
    ['DO_NOT_TRACK=1', telemetryDecision(true, { DO_NOT_TRACK: '1' })],
    ['BOTHARNESS_TELEMETRY=0', telemetryDecision(true, { BOTHARNESS_TELEMETRY: '0' })],
  ])('never calls the sender or writes an Install ID with %s', async (_, decision) => {
    const dir = dataDir();
    const { send } = recordingSender();
    const telemetry = createTelemetryService({ decision, dataDir: dir, send });

    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();
    await telemetry.close();

    expect(telemetry.status()).toEqual({ enabled: false });
    expect(send).not.toHaveBeenCalled();
    expect(() => readFileSync(join(dir, INSTALL_ID_FILE))).toThrow();
  });

  it('sends plugin_started with only the allowed keys and an anonymous Install ID', async () => {
    const dir = dataDir();
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send,
      now: () => new Date('2026-10-06T08:00:00.000Z'),
    });

    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();

    expect(send).toHaveBeenCalledOnce();
    const [batch] = batches;
    expect(batch?.api_key).toBe(TELEMETRY_API_KEY);
    expect(batch?.batch).toHaveLength(1);
    const event = batch!.batch[0]!;
    expect(Object.keys(event).sort()).toEqual(['distinct_id', 'event', 'properties', 'timestamp']);
    expect(event.event).toBe('plugin_started');
    expect(event.timestamp).toBe('2026-10-06T08:00:00.000Z');
    expect(event.distinct_id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u,
    );
    expect(event.properties).toEqual({
      plugin_version: '1.0.2',
      dsh_version: '0.2.0-rc.1',
      os: 'darwin',
      arch: 'arm64',
      source: 'plugin',
      $process_person_profile: false,
    });
    const serialized = JSON.stringify(batch);
    for (const forbidden of [dir, tmpdir(), process.cwd(), 'bh-telemetry-']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('reduces non-version facts to unknown so paths cannot leak', () => {
    expect(
      pluginStartedProperties({
        pluginVersion: '/Users/someone/.dsh/package.json',
        dshVersion: undefined,
        os: 'linux',
        arch: 'x64',
      }),
    ).toEqual({ plugin_version: 'unknown', dsh_version: 'unknown', os: 'linux', arch: 'x64' });
  });

  it('keeps the same Install ID across starts', async () => {
    const dir = dataDir();
    const ids: string[] = [];
    for (let start = 0; start < 2; start += 1) {
      const { send, batches } = recordingSender();
      const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });
      telemetry.capture('plugin_started', STARTED);
      await telemetry.close();
      ids.push(batches[0]!.batch[0]!.distinct_id);
    }
    expect(ids[0]).toBe(ids[1]);
    expect(JSON.parse(readFileSync(join(dir, INSTALL_ID_FILE), 'utf8'))).toEqual({
      installId: ids[0],
    });
  });

  it('replaces an invalid stored Install ID with a random one', async () => {
    const dir = dataDir();
    writeFileSync(join(dir, INSTALL_ID_FILE), JSON.stringify({ installId: 'my-hostname' }));
    const { send, batches } = recordingSender();
    const telemetry = createTelemetryService({
      decision: { enabled: true },
      dataDir: dir,
      send,
      createId: () => '00000000-0000-4000-8000-000000000001',
    });
    telemetry.capture('plugin_started', STARTED);
    await telemetry.flush();
    expect(batches[0]!.batch[0]!.distinct_id).toBe('00000000-0000-4000-8000-000000000001');
  });

  it('swallows a sender rejection and retries those events once with the next batch', async () => {
    const dir = dataDir();
    const send = vi.fn<TelemetrySender>().mockRejectedValue(new Error('offline'));
    const telemetry = createTelemetryService({ decision: { enabled: true }, dataDir: dir, send });

    telemetry.capture('plugin_started', STARTED);
    await expect(telemetry.flush()).resolves.toBeUndefined();
    telemetry.capture('second', {});
    await expect(telemetry.flush()).resolves.toBeUndefined();
    await expect(telemetry.close()).resolves.toBeUndefined();

    expect(send).toHaveBeenCalledTimes(3);
    expect(send.mock.calls[1]![0].batch.map((event) => event.event)).toEqual([
      'plugin_started',
      'second',
    ]);
    expect(send.mock.calls[2]![0].batch.map((event) => event.event)).toEqual(['second']);
  });

  it('batches events captured close together into one request', async () => {
    vi.useFakeTimers();
    try {
      const { send, batches } = recordingSender();
      const telemetry = createTelemetryService({
        decision: { enabled: true },
        dataDir: dataDir(),
        send,
        flushDelayMs: 1_000,
      });
      telemetry.capture('plugin_started', STARTED);
      telemetry.capture('second', {});
      expect(send).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(send).toHaveBeenCalledOnce();
      expect(batches[0]!.batch).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('fetchTelemetrySender', () => {
  it('posts the batch as JSON to the first-party proxy', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('{}', { status: 200 }));
    await fetchTelemetrySender(fetchImpl)({ api_key: TELEMETRY_API_KEY, batch: [] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe(TELEMETRY_ENDPOINT);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({ api_key: TELEMETRY_API_KEY, batch: [] });
  });

  it('rejects on a non-success response so the service can drop it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 503 }));
    await expect(
      fetchTelemetrySender(fetchImpl)({ api_key: TELEMETRY_API_KEY, batch: [] }),
    ).rejects.toThrow('503');
  });
});

describe('installedDshVersion', () => {
  it('reads the version of the resolved DSH package', () => {
    expect(installedDshVersion()).toMatch(/^\d+\.\d+\.\d+/u);
  });

  it('returns undefined when DSH cannot be resolved', () => {
    expect(
      installedDshVersion(() => {
        throw new Error('missing');
      }),
    ).toBeUndefined();
  });
});

describe('telemetryStatus bridge method', () => {
  it('reports the Host decision to the Client', () => {
    const methods = createBridgeMethods({
      telemetry: { status: () => ({ enabled: true }) },
    } as unknown as Parameters<typeof createBridgeMethods>[0]);
    expect(methods.telemetryStatus()).toEqual({ ok: true, value: { enabled: true } });
  });

  it('reports disabled when the Host has no telemetry', () => {
    const methods = createBridgeMethods({} as unknown as Parameters<typeof createBridgeMethods>[0]);
    expect(methods.telemetryStatus()).toEqual({ ok: true, value: { enabled: false } });
  });
});
