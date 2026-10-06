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

export type TelemetryDecision =
  | { enabled: true }
  | { enabled: false; reason: 'config' | 'DO_NOT_TRACK' | 'BOTHARNESS_TELEMETRY' };

export interface TelemetryStatus {
  enabled: boolean;
}

export interface TelemetryService {
  readonly enabled: boolean;
  status(): TelemetryStatus;
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

export function readInstallId(dataDir: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(readFileSync(join(dataDir, INSTALL_ID_FILE), 'utf8'));
    const id =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as Record<string, unknown>)['installId']
        : undefined;
    return typeof id === 'string' && UUID.test(id) ? id : undefined;
  } catch {
    return undefined;
  }
}

export function ensureInstallId(dataDir: string, createId: () => string = randomUUID): string {
  const existing = readInstallId(dataDir);
  if (existing !== undefined) return existing;
  const id = createId();
  try {
    mkdirSync(dataDir, { recursive: true });
    writeFileSync(join(dataDir, INSTALL_ID_FILE), `${JSON.stringify({ installId: id })}\n`, {
      mode: 0o600,
    });
  } catch {
    return id;
  }
  return id;
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
  const enabled = options.decision.enabled;
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
      queue = [...carried, ...queue].slice(-MAX_QUEUE);
      options.log?.(
        `telemetry phase=send-failed events=${pending.length} carried=${carried.length} dropped=${pending.length - carried.length}`,
      );
    }
  };

  const flush = async (): Promise<void> => {
    if (!enabled) return;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    while (inflight !== undefined) await inflight;
    inflight = deliver().finally(() => {
      inflight = undefined;
    });
    await inflight;
  };

  return {
    enabled,
    status: () => ({ enabled }),
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
