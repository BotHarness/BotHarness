import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  readDailyUsageAt,
  writeDailyUsageAt,
  type TelemetryService,
  type TelemetryValue,
} from './service.js';

export const DAILY_USAGE_PERIOD_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const MESSAGE_KINDS = ['human-message', 'bot-message', 'bridge-message'] as const;

export interface DailyUsageCounts {
  personaBots: number;
  sessions: number;
  messages: number;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : 0;
}

export function dailyUsageProperties(counts: DailyUsageCounts): Record<string, TelemetryValue> {
  return {
    persona_bots: count(counts.personaBots),
    sessions: count(counts.sessions),
    messages: count(counts.messages),
  };
}

export function readDailyUsageCounts(
  database: OperationalDatabaseModulePort,
  since: Date,
  until: Date,
): DailyUsageCounts {
  const from = since.toISOString();
  const to = until.toISOString();
  return database.read((db) => ({
    personaBots: count(db.prepare('SELECT COUNT(*) AS n FROM persona_bots').get()?.['n']),
    sessions: count(
      db
        .prepare(
          'SELECT COUNT(*) AS n FROM session_ownership WHERE created_at >= ? AND created_at < ?',
        )
        .get(from, to)?.['n'],
    ),
    messages: count(
      db
        .prepare(
          `SELECT COUNT(*) AS n FROM source_events WHERE source_kind IN (${MESSAGE_KINDS.map(() => '?').join(', ')}) AND created_at >= ? AND created_at < ?`,
        )
        .get(...MESSAGE_KINDS, from, to)?.['n'],
    ),
  }));
}

export function startDailyUsage(options: {
  telemetry: Pick<TelemetryService, 'enabled' | 'capture'>;
  dataDir: string;
  counts: (since: Date, until: Date) => DailyUsageCounts;
  now?: () => Date;
  intervalMs?: number;
  log?: (message: string) => void;
}): () => void {
  if (!options.telemetry.enabled) return () => undefined;
  const now = options.now ?? (() => new Date());
  const tick = (): void => {
    try {
      const at = now();
      const last = readDailyUsageAt(options.dataDir);
      const since =
        last !== undefined && last.getTime() <= at.getTime()
          ? last
          : new Date(at.getTime() - DAILY_USAGE_PERIOD_MS);
      if (last === since && at.getTime() - since.getTime() < DAILY_USAGE_PERIOD_MS) return;
      options.telemetry.capture('daily_usage', dailyUsageProperties(options.counts(since, at)));
      writeDailyUsageAt(options.dataDir, at);
    } catch {
      options.log?.('telemetry phase=daily-usage-skipped');
    }
  };
  tick();
  const timer = setInterval(tick, options.intervalMs ?? CHECK_INTERVAL_MS);
  timer.unref?.();
  return () => clearInterval(timer);
}
