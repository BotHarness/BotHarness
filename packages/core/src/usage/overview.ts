import type { DatabaseSync } from 'node:sqlite';

export type UsageOverviewPeriod = 'today' | 'week';
export interface UsageOverviewBuckets {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheReadTokens: number | null;
  cacheWriteTokens: number | null;
  totalTokens: number | null;
}
export interface UsageOverviewResult {
  period: UsageOverviewPeriod;
  start: string;
  end: string;
  timezone: string;
  nextRefreshAt: string;
  totals: UsageOverviewBuckets;
  days: Array<UsageOverviewBuckets & { day: string }>;
  bots: Array<UsageOverviewBuckets & { slug: string }>;
  nextCursor?: string;
  freshness: 'ready' | 'reconciling' | 'degraded';
  readAt: string;
  reconciledAt: string | null;
  legacyBaseline: boolean;
}
function dayOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const columns = [
  ['input_tokens', 'unknown_input', 'inputTokens'],
  ['output_tokens', 'unknown_output', 'outputTokens'],
  ['cache_read_tokens', 'unknown_cache_read', 'cacheReadTokens'],
  ['cache_write_tokens', 'unknown_cache_write', 'cacheWriteTokens'],
  ['total_tokens', 'unknown_total', 'totalTokens'],
]
  .map(
    ([value, unknown, alias]) =>
      `CASE WHEN SUM(${unknown}) > 0 THEN NULL ELSE COALESCE(SUM(${value}), 0) END AS ${alias}`,
  )
  .join(', ');
const empty: UsageOverviewBuckets = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 0,
};
export function queryOverviewUsage(
  db: DatabaseSync,
  period: UsageOverviewPeriod,
  after: string | undefined,
  now: Date,
  freshness: Pick<UsageOverviewResult, 'freshness' | 'reconciledAt'>,
): UsageOverviewResult {
  const end = dayOf(now);
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  date.setDate(date.getDate() - (period === 'week' ? 6 : 0));
  const days: string[] = [];
  do {
    days.push(dayOf(date));
    date.setDate(date.getDate() + 1);
  } while (days.at(-1) !== end);
  const start = days[0]!;
  const totals = db
    .prepare(`SELECT ${columns} FROM usage_daily WHERE day >= ? AND day <= ?`)
    .get(start, end) as unknown as UsageOverviewBuckets;
  const daily = db
    .prepare(
      `SELECT day, ${columns} FROM usage_daily WHERE day >= ? AND day <= ? GROUP BY day ORDER BY day`,
    )
    .all(start, end) as unknown as UsageOverviewResult['days'];
  const bots = db
    .prepare(
      `SELECT bot_slug AS slug, ${columns} FROM usage_daily WHERE day >= ? AND day <= ? AND bot_slug > ? GROUP BY bot_slug ORDER BY bot_slug LIMIT 21`,
    )
    .all(start, end, after ?? '') as unknown as UsageOverviewResult['bots'];
  return {
    period,
    start,
    end,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    nextRefreshAt: date.toISOString(),
    totals,
    days: days.map((day) => daily.find((row) => row.day === day) ?? { ...empty, day }),
    bots: bots.slice(0, 20),
    ...(bots.length > 20 ? { nextCursor: bots[19]!.slug } : {}),
    legacyBaseline: db.prepare('SELECT 1 FROM usage_legacy_baselines LIMIT 1').get() !== undefined,
    readAt: now.toISOString(),
    ...freshness,
  };
}
