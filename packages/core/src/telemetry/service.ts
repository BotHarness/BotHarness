import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const TELEMETRY_ENDPOINT = 'https://t.botharness.ai/batch/';
export const TELEMETRY_API_KEY = 'phc_CxrCyBuRHVSs996eyHXAeyJbyE8rJXgREbEYsfxUkR3J';
export const TELEMETRY_SOURCE = 'plugin';
export const INSTALL_ID_FILE = 'telemetry.json';

const FLUSH_DELAY_MS = 2_000;
const REQUEST_TIMEOUT_MS = 8_000;
const MAX_QUEUE = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;

export type TelemetryValue = string | number | boolean;

export interface TelemetryBatchEvent {
  event: string;
  distinct_id: string;
  properties: Record<string, TelemetryValue>;
  timestamp: string;
}

export interface TelemetryBatch {
  api_key: string;
  batch: TelemetryBatchEvent[];
}

export type TelemetrySender = (batch: TelemetryBatch) => Promise<void>;

export type TelemetryLock = 'config' | 'DO_NOT_TRACK' | 'BOTHARNESS_TELEMETRY';

export type TelemetryDecision = { enabled: true } | { enabled: false; reason: TelemetryLock };

export interface TelemetryStatus {
  enabled: boolean;
  preference: boolean;
  lockedBy?: TelemetryLock;
}

export interface TelemetryService {
  readonly enabled: boolean;
  status(): TelemetryStatus;
  setPreference(enabled: boolean): TelemetryStatus;
  capture(event: string, properties?: Record<string, TelemetryValue>): void;
  flush(): Promise<void>;
  close(): Promise<void>;
}

export interface TelemetryServiceOptions {
  decision: TelemetryDecision;
  dataDir: string;
  send?: TelemetrySender;
  now?: () => Date;
  flushDelayMs?: number;
  createId?: () => string;
  log?: (message: string) => void;
}

export interface PluginStartedFacts {
  pluginVersion: string | undefined;
  dshVersion: string | undefined;
  os: string;
  arch: string;
}

const OFF_VALUES = new Set(['0', 'false', 'off', 'no']);
const ON_VALUES = new Set(['1', 'true', 'yes', 'on']);

function normalized(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function telemetryDecision(
  configured: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env,
): TelemetryDecision {
  if (configured === false) return { enabled: false, reason: 'config' };
  if (ON_VALUES.has(normalized(env['DO_NOT_TRACK'])))
    return { enabled: false, reason: 'DO_NOT_TRACK' };
  if (OFF_VALUES.has(normalized(env['BOTHARNESS_TELEMETRY'])))
    return { enabled: false, reason: 'BOTHARNESS_TELEMETRY' };
  return { enabled: true };
}

interface TelemetryFile {
  installId?: string;
  enabled?: false;
}

function readTelemetryFile(dataDir: string): TelemetryFile {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dataDir, INSTALL_ID_FILE), 'utf8'));
    if (typeof parsed !== 'object' || parsed === null) return {};
    const record = parsed as Record<string, unknown>;
    const id = record['installId'];
    return {
      ...(typeof id === 'string' && UUID.test(id) ? { installId: id } : {}),
      ...(record['enabled'] === false ? { enabled: false } : {}),
    };
  } catch {
    return {};
  }
}

function writeTelemetryFile(dataDir: string, file: TelemetryFile): void {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, INSTALL_ID_FILE), `${JSON.stringify(file)}\n`, { mode: 0o600 });
}

export function readInstallId(dataDir: string): string | undefined {
  return readTelemetryFile(dataDir).installId;
}

export function readTelemetryPreference(dataDir: string): boolean {
  return readTelemetryFile(dataDir).enabled !== false;
}

export function ensureInstallId(dataDir: string, createId: () => string = randomUUID): string {
  const file = readTelemetryFile(dataDir);
  if (file.installId !== undefined) return file.installId;
  const id = createId();
  try {
    writeTelemetryFile(dataDir, { ...file, installId: id });
  } catch {
    return id;
  }
  return id;
}

export function writeTelemetryPreference(dataDir: string, enabled: boolean): void {
  const { installId } = readTelemetryFile(dataDir);
  writeTelemetryFile(dataDir, {
    ...(installId === undefined ? {} : { installId }),
    ...(enabled ? {} : { enabled: false }),
  });
}

export function telemetryVersion(value: string | undefined): string {
  return value !== undefined && VERSION.test(value) ? value : 'unknown';
}

export function pluginStartedProperties(facts: PluginStartedFacts): Record<string, TelemetryValue> {
  return {
    plugin_version: telemetryVersion(facts.pluginVersion),
    dsh_version: telemetryVersion(facts.dshVersion),
    os: facts.os,
    arch: facts.arch,
  };
}

export function installedDshVersion(
  resolve: (specifier: string) => string = (specifier) => import.meta.resolve(specifier),
): string | undefined {
  try {
    const manifest: unknown = JSON.parse(
      readFileSync(new URL('../package.json', resolve('@deepseek-ai/dsh-tools')), 'utf8'),
    );
    const version =
      typeof manifest === 'object' && manifest !== null
        ? (manifest as Record<string, unknown>)['version']
        : undefined;
    return typeof version === 'string' ? version : undefined;
  } catch {
    return undefined;
  }
}

export function fetchTelemetrySender(
  fetchImpl: typeof fetch = fetch,
  endpoint: string = TELEMETRY_ENDPOINT,
): TelemetrySender {
  return async (batch) => {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`telemetry ingest responded ${response.status}`);
  };
}

interface Pending {
  event: TelemetryBatchEvent;
  retried: boolean;
}

export function createTelemetryService(options: TelemetryServiceOptions): TelemetryService {
  const lockedBy = options.decision.enabled ? undefined : options.decision.reason;
  let preference = readTelemetryPreference(options.dataDir);
  let enabled = lockedBy === undefined && preference;
  const send = options.send ?? fetchTelemetrySender();
  const now = options.now ?? (() => new Date());
  const flushDelayMs = options.flushDelayMs ?? FLUSH_DELAY_MS;
  let installId: string | undefined;
  let queue: Pending[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inflight: Promise<void> | undefined;
  let closed = false;

  const distinctId = (): string => {
    installId ??= ensureInstallId(options.dataDir, options.createId);
    return installId;
  };

  const schedule = (): void => {
    if (timer !== undefined || closed) return;
    timer = setTimeout(() => {
      timer = undefined;
      void flush();
    }, flushDelayMs);
    timer.unref?.();
  };

  const deliver = async (): Promise<void> => {
    const pending = queue;
    queue = [];
    if (pending.length === 0) return;
    try {
      await send({ api_key: TELEMETRY_API_KEY, batch: pending.map((entry) => entry.event) });
      options.log?.(`telemetry phase=sent events=${pending.length}`);
    } catch {
      const carried = pending
        .filter((entry) => !entry.retried)
        .map((entry) => ({ event: entry.event, retried: true }));
      queue = enabled ? [...carried, ...queue].slice(-MAX_QUEUE) : [];
      options.log?.(
        `telemetry phase=send-failed events=${pending.length} carried=${carried.length} dropped=${pending.length - carried.length}`,
      );
    }
  };

  const cancelTimer = (): void => {
    if (timer === undefined) return;
    clearTimeout(timer);
    timer = undefined;
  };

  const status = (): TelemetryStatus =>
    lockedBy === undefined ? { enabled, preference } : { enabled, preference, lockedBy };

  const flush = async (): Promise<void> => {
    if (!enabled) return;
    cancelTimer();
    while (inflight !== undefined) await inflight;
    inflight = deliver().finally(() => {
      inflight = undefined;
    });
    await inflight;
  };

  return {
    get enabled() {
      return enabled;
    },
    status,
    setPreference(next) {
      if (lockedBy !== undefined) return status();
      preference = next;
      enabled = next;
      if (!next) {
        cancelTimer();
        const dropped = queue.length;
        queue = [];
        options.log?.(`telemetry phase=disabled reason=preference dropped=${dropped}`);
      } else {
        options.log?.('telemetry phase=enabled reason=preference');
      }
      writeTelemetryPreference(options.dataDir, next);
      if (next) installId = ensureInstallId(options.dataDir, options.createId);
      return status();
    },
    capture(event, properties = {}) {
      if (!enabled || closed) return;
      try {
        queue.push({
          event: {
            event,
            distinct_id: distinctId(),
            properties: {
              ...properties,
              source: TELEMETRY_SOURCE,
              $process_person_profile: false,
            },
            timestamp: now().toISOString(),
          },
          retried: false,
        });
        if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
        schedule();
      } catch {
        return;
      }
    },
    flush,
    async close() {
      if (closed) return;
      closed = true;
      await flush().catch(() => undefined);
    },
  };
}
