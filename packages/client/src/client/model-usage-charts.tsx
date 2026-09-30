import { useMemo, type ReactElement } from 'react';

import { barX, barY, defineChart, dot, stack } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';

import type { ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useProfileChartTokens } from './profile-chart-theme.js';

export type UsageSummary = Omit<ProfileModelUsageRow, 'day' | 'purpose' | 'provider' | 'model'> & {
  key: string;
  label: string;
};
type UsageSeries = 'cached' | 'uncached' | 'output' | 'unclassified';
type ChartDatum = UsageSummary & { series?: UsageSeries; tokens?: number; ratio?: number };

function inputTotal(row: UsageSummary): number | null {
  return row.inputTokens === null || row.cacheReadTokens === null || row.cacheWriteTokens === null
    ? null
    : row.inputTokens + row.cacheReadTokens + row.cacheWriteTokens;
}
function ratio(part: number | null, whole: number | null): number | null {
  return part === null || whole === null || whole <= 0 || part < 0 || part > whole
    ? null
    : (part / whole) * 100;
}
function percent(value: number | null, t: BotHarnessTranslate): string {
  return value === null
    ? t('profile.usage.unknown')
    : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
}
function count(value: number | null, t: BotHarnessTranslate): string {
  return value === null ? t('profile.usage.unknown') : value.toLocaleString();
}

export function UsageMeasures({
  row,
  t,
}: {
  row: UsageSummary;
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <dl className="bh-usage-measures">
      <div>
        <dt>{t('profile.usage.inputTotal')}</dt>
        <dd>{count(inputTotal(row), t)}</dd>
      </div>
      <div className="bh-usage-cached-measure">
        <dt>{t('profile.usage.inputCached')}</dt>
        <dd>
          {count(row.cacheReadTokens, t)} ·{' '}
          {percent(ratio(row.cacheReadTokens, inputTotal(row)), t)}
        </dd>
      </div>
      <div>
        <dt>{t('profile.tokens.output')}</dt>
        <dd>
          {count(row.outputTokens, t)} · {percent(ratio(row.outputTokens, row.totalTokens), t)}
        </dd>
      </div>
    </dl>
  );
}

export function CacheRatio({
  row,
  t,
}: {
  row: UsageSummary;
  t: BotHarnessTranslate;
}): ReactElement {
  return <strong>{percent(ratio(row.cacheReadTokens, inputTotal(row)), t)}</strong>;
}

export function UsageLegend({
  rows,
  t,
}: {
  rows: UsageSummary[];
  t: BotHarnessTranslate;
}): ReactElement {
  return (
    <div className="bh-usage-legend">
      <span>
        <i data-series="cached" />
        {t('profile.usage.cacheRead')}
      </span>
      <span>
        <i data-series="uncached" />
        {t('profile.usage.otherInput')}
      </span>
      <span>
        <i data-series="output" />
        {t('profile.tokens.output')}
      </span>
      {rows.some(
        (row) =>
          inputTotal(row) === null ||
          row.outputTokens === null ||
          row.totalTokens !== inputTotal(row)! + row.outputTokens,
      ) ? (
        <span>
          <i data-series="unclassified" />
          {t('profile.usage.unclassified')}
        </span>
      ) : null}
    </div>
  );
}

function segments(rows: UsageSummary[]): ChartDatum[] {
  return rows.flatMap<ChartDatum>((row) => {
    const input = inputTotal(row);
    if (input !== null && row.outputTokens !== null && row.totalTokens === input + row.outputTokens)
      return [
        { ...row, series: 'cached' as const, tokens: row.cacheReadTokens! },
        {
          ...row,
          series: 'uncached' as const,
          tokens: row.inputTokens! + row.cacheWriteTokens!,
        },
        { ...row, series: 'output' as const, tokens: row.outputTokens },
      ];
    return row.totalTokens === null
      ? []
      : [{ ...row, series: 'unclassified' as const, tokens: row.totalTokens }];
  });
}

export function UsageChart({
  rows,
  kind,
  t,
  label,
}: {
  rows: UsageSummary[];
  kind: 'daily' | 'model' | 'cache';
  t: BotHarnessTranslate;
  label: string;
}): ReactElement {
  const colors = useProfileChartTokens();
  const definition = useMemo(() => {
    const theme = {
      foreground: colors.foreground,
      muted: colors.muted,
      grid: colors.grid,
      background: 'transparent',
    };
    const categories = rows.map((row) => row.key);
    if (kind === 'cache') {
      const points = rows.flatMap<ChartDatum>((row) => {
        const value = ratio(row.cacheReadTokens, inputTotal(row));
        return value === null ? [] : [{ ...row, ratio: value }];
      });
      return defineChart({
        marks: [
          barX<ChartDatum>(rows, { x: () => 100, y: 'key', fill: colors.grid, maxThickness: 6 }),
          dot<ChartDatum>(points, { x: 'ratio', y: 'key', r: 4, fill: colors.cached }),
        ],
        scales: {
          x: { scale: scaleLinear, domain: [0, 100] },
          y: { scale: () => scalePoint<string>().padding(0.5), domain: categories },
        },
        guides: false,
        margin: { top: 0, right: 6, bottom: 0, left: 6 },
        tooltip,
        theme,
      });
    }
    const data = segments(rows);
    const magnitude = {
      scale: scaleLinear,
      domain: [0, Math.max(1, ...rows.map((row) => row.totalTokens ?? 0))],
      nice: true,
    };
    const categorical = { scale: () => scalePoint<string>().padding(0.5), domain: categories };
    return defineChart({
      marks:
        kind === 'model'
          ? [
              barX<ChartDatum>(data, {
                x: 'tokens',
                y: 'key',
                z: 'series',
                color: 'series',
                layout: stack({ order: ['cached', 'uncached', 'output', 'unclassified'] }),
                radius: 2,
                maxThickness: 18,
              }),
            ]
          : [
              barY<ChartDatum>(data, {
                x: 'key',
                y: 'tokens',
                z: 'series',
                color: 'series',
                layout: stack({ order: ['cached', 'uncached', 'output', 'unclassified'] }),
                radius: 2,
                maxThickness: 18,
              }),
            ],
      scales:
        kind === 'model' ? { x: magnitude, y: categorical } : { x: categorical, y: magnitude },
      color: {
        domain: ['cached', 'uncached', 'output', 'unclassified'],
        range: [colors.cached, colors.uncached, colors.output, colors.muted],
      },
      guides: false,
      margin: kind === 'model' ? 0 : { top: 4, right: 0, bottom: 0, left: 0 },
      tooltip,
      theme,
    });
  }, [colors, rows, kind]);
  return (
    <Chart
      definition={definition}
      ariaLabel={label}
      height={kind === 'daily' ? 128 : rows.length * (kind === 'model' ? 128 : 64)}
      className="bh-profile-bar-chart"
      renderTooltipBody={({ points }) => {
        const datum = points[0]?.datum as { key: string } | undefined;
        const row = rows.find((entry) => entry.key === datum?.key);
        return row === undefined ? null : (
          <div className="bh-profile-chart-tip">
            <strong>{row.label}</strong>
            <span>
              {t('profile.usage.total')}: {count(row.totalTokens, t)} tokens
            </span>
            <UsageMeasures row={row} t={t} />
            {kind === 'cache' ? (
              <span>
                {t('profile.usage.cachedShare')}: <CacheRatio row={row} t={t} />
              </span>
            ) : null}
          </div>
        );
      }}
    />
  );
}
