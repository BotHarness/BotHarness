import { useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';

import { barY, defineChart, stack } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';

import type {
  ProfileActivityDay,
  ProfileActivityReasonDay,
  ProfileActivityTokensDay,
} from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ProfileCardDescriptor } from './profile-cards.js';

export const PROFILE_ACTIVITY_WEEKS = 26;

const HEAT_LEVEL_THRESHOLDS = [1, 3, 6, 11] as const;
const TOKEN_SERIES_STORAGE_DAYS = 14;

function localDayKey(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function anchorDate(todayKey: string | undefined): Date {
  if (todayKey !== undefined && /^\d{4}-\d{2}-\d{2}$/u.test(todayKey)) {
    const [year, month, day] = todayKey.split('-').map(Number);
    return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
  }
  return new Date();
}

export function trailingProfileDays(todayKey: string | undefined, count: number): string[] {
  const today = anchorDate(todayKey);
  const days: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - index);
    days.push(localDayKey(date));
  }
  return days;
}

function heatWindow(todayKey: string | undefined): { days: string[]; todayKey: string } {
  const today = anchorDate(todayKey);
  const start = new Date(today);
  const mondayOffset = (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - mondayOffset - (PROFILE_ACTIVITY_WEEKS - 1) * 7);
  const days: string[] = [];
  for (let index = 0; index < PROFILE_ACTIVITY_WEEKS * 7; index += 1) {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    days.push(localDayKey(date));
  }
  return { days, todayKey: localDayKey(today) };
}

function heatLevel(count: number): number {
  let level = 0;
  for (const threshold of HEAT_LEVEL_THRESHOLDS) {
    if (count >= threshold) level += 1;
  }
  return level;
}

export function countByDay(days: readonly ProfileActivityDay[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const entry of days) {
    counts.set(entry.day, (counts.get(entry.day) ?? 0) + entry.count);
  }
  return counts;
}

function sumCounts(days: readonly ProfileActivityDay[]): number {
  return days.reduce((total, entry) => total + entry.count, 0);
}

export function ProfileHeatmap({
  counts,
  label,
  today,
  t,
}: {
  counts: ReadonlyMap<string, number>;
  label: string;
  today: string | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const { days, todayKey } = heatWindow(today);
  const [hovered, setHovered] = useState<
    { day: string; count: number; column: number } | undefined
  >(undefined);
  const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
  const tipLeft =
    hovered === undefined
      ? '50%'
      : `${Math.min(92, Math.max(8, ((hovered.column + 0.5) / PROFILE_ACTIVITY_WEEKS) * 100))}%`;
  return (
    <div className="bh-profile-heat">
      <div
        className="bh-profile-heat-grid"
        role="group"
        aria-label={t('profile.heat.aria', { label })}
      >
        {days.map((day, index) => {
          const future = day > todayKey;
          const count = counts.get(day) ?? 0;
          const column = Math.floor(index / 7);
          if (future) {
            return (
              <span
                key={day}
                className="bh-profile-heat-cell"
                data-level="future"
                aria-hidden="true"
              />
            );
          }
          return (
            <button
              key={day}
              type="button"
              className="bh-profile-heat-cell"
              data-level={heatLevel(count)}
              aria-label={`${day} · ${t('profile.heat.tip', { count })}`}
              onMouseEnter={() => setHovered({ day, count, column })}
              onMouseLeave={() => setHovered(undefined)}
              onFocus={() => setHovered({ day, count, column })}
              onBlur={() => setHovered(undefined)}
            />
          );
        })}
        {hovered === undefined ? null : (
          <div className="bh-profile-heat-tip" role="tooltip" style={{ left: tipLeft }}>
            <span className="bh-profile-tip-day">{hovered.day}</span>
            <span className="bh-profile-tip-value">
              {t('profile.heat.tip', { count: hovered.count })}
            </span>
          </div>
        )}
      </div>
      {total === 0 ? <div className="bh-profile-empty">{t('profile.empty')}</div> : null}
    </div>
  );
}

function reasonLabel(reason: string, t: BotHarnessTranslate): string {
  switch (reason) {
    case 'human-dm':
      return t('profile.reason.humanDm');
    case 'group-mention':
      return t('profile.reason.groupMention');
    case 'group-ordinary':
      return t('profile.reason.groupOrdinary');
    case 'bot-dm':
      return t('profile.reason.botDm');
    case 'group-invite':
      return t('profile.reason.groupInvite');
    case 'group-join-request':
    case 'group-join-decision':
      return t('profile.reason.groupJoin');
    case 'assignment-report':
      return t('profile.reason.assignmentReport');
    default:
      return reason;
  }
}

function reasonTotals(
  events: readonly ProfileActivityReasonDay[],
): Array<{ reason: string; count: number }> {
  const totals = new Map<string, number>();
  for (const entry of events) {
    totals.set(entry.reason, (totals.get(entry.reason) ?? 0) + entry.count);
  }
  return [...totals]
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function EventActivityCard({
  activity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const events = activity?.events ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  const reasons = reasonTotals(events);
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(events), weeks, t)}</div>
      <ProfileHeatmap
        counts={countByDay(events)}
        label={t('profile.card.events')}
        today={activity?.today}
        t={t}
      />
      {reasons.length === 0 ? null : (
        <ul className="bh-profile-reasons">
          {reasons.map((entry) => (
            <li key={entry.reason}>
              <span>{reasonLabel(entry.reason, t)}</span>
              <span className="bh-profile-reason-count">{entry.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MemoryActivityCard({
  activity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const commits = activity?.memoryCommits ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">{totalText(sumCounts(commits), weeks, t)}</div>
      <ProfileHeatmap
        counts={countByDay(commits)}
        label={t('profile.card.memory')}
        today={activity?.today}
        t={t}
      />
    </div>
  );
}

export function formatTokenCount(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value}`;
}

type TokenSeries = 'cached' | 'uncached' | 'output';

interface TokenBarRow {
  id: string;
  day: string;
  series: TokenSeries;
  tokens: number;
}

interface TokenDayTotals {
  day: string;
  cached: number;
  uncached: number;
  output: number;
}

function tokenDayTotals(tokens: readonly ProfileActivityTokensDay[]): Map<string, TokenDayTotals> {
  const days = new Map<string, TokenDayTotals>();
  for (const entry of tokens) {
    const totals = days.get(entry.day) ?? {
      day: entry.day,
      cached: 0,
      uncached: 0,
      output: 0,
    };
    totals.cached += entry.cacheReadTokens;
    totals.uncached += entry.inputTokens + entry.cacheWriteTokens;
    totals.output += entry.outputTokens;
    days.set(entry.day, totals);
  }
  return days;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

export interface TokenShares {
  read: number;
  output: number;
  cachedPercent: number;
  outputPercent: number;
}

export function tokenShares(totals: {
  cached: number;
  uncached: number;
  output: number;
}): TokenShares {
  const read = totals.cached + totals.uncached;
  return {
    read,
    output: totals.output,
    cachedPercent: percent(totals.cached, read),
    outputPercent: percent(totals.output, read + totals.output),
  };
}

interface ChartTokens {
  cached: string;
  uncached: string;
  output: string;
  foreground: string;
  muted: string;
  grid: string;
}

function resolveChartTokens(): ChartTokens {
  const fallback: ChartTokens = {
    cached: 'currentColor',
    uncached: 'currentColor',
    output: 'currentColor',
    foreground: 'currentColor',
    muted: 'currentColor',
    grid: 'currentColor',
  };
  if (typeof window === 'undefined' || typeof getComputedStyle !== 'function') return fallback;
  const surface = document.querySelector('.bh-root') ?? document.documentElement;
  const style = getComputedStyle(surface);
  const token = (name: string, fallbackValue: string): string =>
    style.getPropertyValue(name).trim() || fallbackValue;
  const cached = token('--bh-accent', 'currentColor');
  return {
    cached,
    uncached: token('--bh-chart-read-dim', cached),
    output: token('--bh-chart-output', cached),
    foreground: token('--dsw-alias-label-primary', 'currentColor'),
    muted: token('--dsw-alias-label-tertiary', 'currentColor'),
    grid: token('--dsw-alias-border-l2', 'currentColor'),
  };
}

let chartTokens: ChartTokens | undefined;
let chartObserver: MutationObserver | undefined;
const chartListeners = new Set<() => void>();

function chartTokenSnapshot(): ChartTokens {
  chartTokens ??= resolveChartTokens();
  return chartTokens;
}

function refreshChartTokens(): void {
  const next = resolveChartTokens();
  const previous = chartTokenSnapshot();
  if (
    next.cached === previous.cached &&
    next.uncached === previous.uncached &&
    next.output === previous.output &&
    next.foreground === previous.foreground &&
    next.muted === previous.muted &&
    next.grid === previous.grid
  )
    return;
  chartTokens = next;
  chartListeners.forEach((listener) => listener());
}

function subscribeChartTokens(listener: () => void): () => void {
  chartListeners.add(listener);
  if (
    chartObserver === undefined &&
    typeof MutationObserver === 'function' &&
    typeof document !== 'undefined'
  ) {
    chartObserver = new MutationObserver(refreshChartTokens);
    chartObserver.observe(document.body, { attributes: true });
    chartObserver.observe(document.documentElement, { attributes: true });
  }
  refreshChartTokens();
  return () => {
    chartListeners.delete(listener);
    if (chartListeners.size === 0) {
      chartObserver?.disconnect();
      chartObserver = undefined;
    }
  };
}

function TokenTip({ totals, t }: { totals: TokenDayTotals; t: BotHarnessTranslate }): ReactElement {
  const shares = tokenShares(totals);
  return (
    <div className="bh-profile-chart-tip">
      <span className="bh-profile-tip-day">{totals.day}</span>
      <ul className="bh-profile-tip-rows">
        <li>
          <span>{t('profile.tokens.cached')}</span>
          <span>{formatTokenCount(totals.cached)}</span>
        </li>
        <li>
          <span>{t('profile.tokens.uncachedInput')}</span>
          <span>{formatTokenCount(totals.uncached)}</span>
        </li>
        <li>
          <span>{t('profile.tokens.output')}</span>
          <span>{formatTokenCount(totals.output)}</span>
        </li>
      </ul>
      <span className="bh-profile-tip-shares">
        {t('profile.tokens.shares', {
          cached: shares.cachedPercent,
          output: shares.outputPercent,
        })}
      </span>
    </div>
  );
}

function TokenUsageCard({
  activity,
  t,
}: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const tokens = activity?.tokens ?? [];
  const weeks = activity?.weeks ?? PROFILE_ACTIVITY_WEEKS;
  const days = useMemo(
    () => trailingProfileDays(activity?.today, TOKEN_SERIES_STORAGE_DAYS),
    [activity?.today],
  );
  const dayTotals = useMemo(() => tokenDayTotals(tokens), [tokens]);
  const windowTotals = useMemo(() => {
    let cached = 0;
    let uncached = 0;
    let output = 0;
    for (const totals of dayTotals.values()) {
      cached += totals.cached;
      uncached += totals.uncached;
      output += totals.output;
    }
    return { cached, uncached, output };
  }, [dayTotals]);
  const shares = tokenShares(windowTotals);
  const rows = useMemo<TokenBarRow[]>(
    () =>
      days.flatMap((day) => {
        const totals = dayTotals.get(day);
        return [
          { id: `${day}-cached`, day, series: 'cached' as const, tokens: totals?.cached ?? 0 },
          {
            id: `${day}-uncached`,
            day,
            series: 'uncached' as const,
            tokens: totals?.uncached ?? 0,
          },
          { id: `${day}-output`, day, series: 'output' as const, tokens: totals?.output ?? 0 },
        ];
      }),
    [dayTotals, days],
  );
  const colors = useSyncExternalStore(subscribeChartTokens, chartTokenSnapshot, chartTokenSnapshot);
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY<TokenBarRow>(rows, {
            x: 'day',
            y: 'tokens',
            z: 'series',
            color: 'series',
            layout: stack(),
            radius: 2,
            maxThickness: 10,
          }),
        ],
        scales: {
          x: { scale: () => scalePoint<string>().padding(0.4) },
          y: { scale: scaleLinear, nice: true },
        },
        guides: false,
        theme: {
          foreground: colors.foreground,
          muted: colors.muted,
          grid: colors.grid,
          background: 'transparent',
          palette: [colors.cached, colors.uncached, colors.output],
        },
        tooltip,
      }),
    [colors, rows],
  );
  const total = windowTotals.cached + windowTotals.uncached + windowTotals.output;
  return (
    <div className="bh-profile-card-body">
      <div className="bh-profile-card-total">
        {t('profile.tokens.window', { weeks, count: formatTokenCount(total) })}
      </div>
      <Chart
        definition={definition}
        ariaLabel={t('profile.tokens.sparkline')}
        height={48}
        className="bh-profile-bar-chart"
        renderTooltipBody={({ points }) => {
          const datum = points[0]?.datum as TokenBarRow | undefined;
          if (datum === undefined) return null;
          const totals = dayTotals.get(datum.day);
          if (totals === undefined) return null;
          return <TokenTip totals={totals} t={t} />;
        }}
      />
      <div className="bh-profile-token-shares">
        {t('profile.tokens.shares', {
          cached: shares.cachedPercent,
          output: shares.outputPercent,
        })}
      </div>
      {total === 0 ? <div className="bh-profile-empty">{t('profile.empty')}</div> : null}
    </div>
  );
}

function TotalsCard({ activity, t }: Parameters<ProfileCardDescriptor['render']>[0]): ReactElement {
  const events = sumCounts(activity?.events ?? []);
  const commits = sumCounts(activity?.memoryCommits ?? []);
  const tokens = (activity?.tokens ?? []).reduce(
    (sum, entry) =>
      sum + entry.inputTokens + entry.outputTokens + entry.cacheReadTokens + entry.cacheWriteTokens,
    0,
  );
  return (
    <div className="bh-profile-card-body">
      <dl className="bh-profile-stats">
        <div>
          <dt>{t('profile.stat.events')}</dt>
          <dd>{events}</dd>
        </div>
        <div>
          <dt>{t('profile.stat.memoryCommits')}</dt>
          <dd>{commits}</dd>
        </div>
        <div>
          <dt>{t('profile.stat.tokens')}</dt>
          <dd>{formatTokenCount(tokens)}</dd>
        </div>
      </dl>
    </div>
  );
}

function totalText(count: number, weeks: number, t: BotHarnessTranslate): string {
  return t('profile.window.total', { weeks, count });
}

export function createProfileCardBuiltins(
  t: BotHarnessTranslate,
): readonly ProfileCardDescriptor[] {
  return [
    {
      id: 'token-usage',
      label: t('profile.card.tokens'),
      order: 5,
      render: (props) => <TokenUsageCard {...props} />,
    },
    {
      id: 'event-activity',
      label: t('profile.card.events'),
      order: 10,
      render: (props) => <EventActivityCard {...props} />,
    },
    {
      id: 'memory-activity',
      label: t('profile.card.memory'),
      order: 20,
      render: (props) => <MemoryActivityCard {...props} />,
    },
    {
      id: 'totals',
      label: t('profile.card.totals'),
      order: 30,
      render: (props) => <TotalsCard {...props} />,
    },
  ];
}
