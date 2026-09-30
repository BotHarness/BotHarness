import { useMemo, useState, type ReactElement } from 'react';

import { barX, barY, defineChart } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';

import type { ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { useProfileChartTokens } from './profile-chart-theme.js';

const bucketKeys = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'totalTokens',
] as const;
const bucketLabels = [
  'profile.tokens.uncachedInput',
  'profile.tokens.output',
  'profile.usage.cacheRead',
  'profile.usage.cacheWrite',
  'profile.usage.total',
] as const;
type UsageSummary = Pick<ProfileModelUsageRow, (typeof bucketKeys)[number]> & {
  key: string;
  label: string;
  model?: string;
  provider?: string;
};

function sumBucket(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function summaries(
  rows: readonly ProfileModelUsageRow[],
  group: (row: ProfileModelUsageRow) => Pick<UsageSummary, 'key' | 'label' | 'model' | 'provider'>,
): UsageSummary[] {
  const result = new Map<string, UsageSummary>();
  for (const row of rows) {
    const identity = group(row);
    const previous = result.get(identity.key);
    if (previous === undefined)
      result.set(identity.key, {
        ...identity,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        cacheReadTokens: row.cacheReadTokens,
        cacheWriteTokens: row.cacheWriteTokens,
        totalTokens: row.totalTokens,
      });
    else for (const key of bucketKeys) previous[key] = sumBucket(previous[key], row[key]);
  }
  return [...result.values()];
}

function offsetDay(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const result = new Date(year!, month! - 1, date!);
  result.setDate(result.getDate() + amount);
  return `${result.getFullYear()}-${`${result.getMonth() + 1}`.padStart(2, '0')}-${`${result.getDate()}`.padStart(2, '0')}`;
}

function Buckets({ row, t }: { row: UsageSummary; t: BotHarnessTranslate }): ReactElement {
  return (
    <dl className="bh-model-usage-buckets">
      {bucketKeys.map((key, index) => (
        <div key={key}>
          <dt>{t(bucketLabels[index]!)}</dt>
          <dd>{row[key] === null ? t('profile.usage.unknown') : row[key].toLocaleString()}</dd>
        </div>
      ))}
    </dl>
  );
}

function UsageChart({
  rows,
  horizontal,
  t,
  label,
}: {
  rows: UsageSummary[];
  horizontal?: boolean;
  t: BotHarnessTranslate;
  label: string;
}): ReactElement {
  const colors = useProfileChartTokens();
  const theme = {
    foreground: colors.foreground,
    muted: colors.muted,
    grid: colors.grid,
    background: 'transparent',
    palette: [colors.cached],
  };
  const definition = useMemo(
    () =>
      horizontal
        ? defineChart({
            marks: [
              barX<UsageSummary>(rows, {
                x: 'totalTokens',
                y: 'key',
                fill: colors.cached,
                radius: 3,
                maxThickness: 16,
              }),
            ],
            scales: {
              x: { scale: scaleLinear, nice: true },
              y: { scale: () => scalePoint<string>().padding(0.5) },
            },
            guides: false,
            margin: 0,
            tooltip,
            theme,
          })
        : defineChart({
            marks: [
              barY<UsageSummary>(rows, {
                x: 'key',
                y: 'totalTokens',
                fill: colors.cached,
                radius: 2,
                maxThickness: 18,
              }),
            ],
            scales: {
              x: { scale: () => scalePoint<string>().padding(0.5) },
              y: { scale: scaleLinear, nice: true },
            },
            guides: false,
            margin: { top: 4, right: 0, bottom: 0, left: 0 },
            tooltip,
            theme,
          }),
    [colors, rows, horizontal],
  );
  return (
    <Chart
      definition={definition}
      ariaLabel={label}
      height={horizontal ? Math.max(64, rows.length * 64) : 128}
      className="bh-profile-bar-chart"
      renderTooltipBody={({ points }) => {
        const row = points[0]?.datum as UsageSummary | undefined;
        return row === undefined ? null : (
          <div className="bh-profile-chart-tip">
            <strong>{row.label}</strong>
            <Buckets row={row} t={t} />
          </div>
        );
      }}
    />
  );
}

export function ModelUsageBreakdown({
  rows,
  status,
  today,
  firstDay,
  t,
}: {
  rows: readonly ProfileModelUsageRow[];
  status: 'ready' | 'unavailable';
  today: string;
  firstDay: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [preset, setPreset] = useState('7');
  const [customStart, setStart] = useState(firstDay);
  const [customEnd, setEnd] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const start =
    preset === 'custom'
      ? customStart
      : [firstDay, offsetDay(today, 1 - Number(preset))].sort().at(-1)!;
  const end = preset === 'custom' ? customEnd : today;
  const valid =
    /^\d{4}-\d{2}-\d{2}$/u.test(start) &&
    /^\d{4}-\d{2}-\d{2}$/u.test(end) &&
    start >= firstDay &&
    end <= today &&
    start <= end;
  const selected = valid ? rows.filter((row) => row.day >= start && row.day <= end) : [];
  const models = summaries(selected, (row) => ({
    key: JSON.stringify([row.provider, row.model]),
    label: `${row.provider} / ${row.model}`,
    model: row.model,
    provider: row.provider,
  }));
  models.sort(
    (left, right) =>
      (right.totalTokens ?? -1) - (left.totalTokens ?? -1) || left.label.localeCompare(right.label),
  );
  const days = summaries(selected, (row) => ({ key: row.day, label: row.day }));
  const daily = new Map(days.map((row) => [row.key, row]));
  const series: UsageSummary[] = [];
  if (valid)
    for (let day = start; day <= end; day = offsetDay(day, 1))
      series.push(
        daily.get(day) ?? {
          key: day,
          label: day,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 0,
        },
      );
  const total = models.reduce<number | null>((sum, row) => sumBucket(sum, row.totalTokens), 0);
  const count = (value: number | null) =>
    value === null ? t('profile.usage.unknown') : value.toLocaleString();
  const role = (purpose: string) =>
    purpose === 'orchestrator'
      ? t('sessions.role.orchestrator')
      : purpose === 'assignment'
        ? t('sessions.role.assignment')
        : purpose === 'subagent'
          ? t('profile.usage.subagent')
          : purpose;
  const details = summaries(selected, (row) => ({
    key: JSON.stringify([row.purpose, row.provider, row.model]),
    label: `${role(row.purpose)} · ${row.provider} / ${row.model}`,
  }));
  return (
    <section
      className="bh-model-usage bh-model-usage-overview"
      aria-label={t('profile.usage.byModel')}
    >
      <div className="bh-model-usage-header">
        <label>
          {t('profile.usage.range')}
          <select
            className="bh-profile-policy-select"
            value={preset}
            disabled={status !== 'ready'}
            onChange={(event) => setPreset(event.target.value)}
          >
            <option value="182">{t('profile.usage.range26')}</option>
            <option value="90">{t('profile.usage.range90')}</option>
            <option value="30">{t('profile.usage.range30')}</option>
            <option value="7">{t('profile.usage.range7')}</option>
            <option value="1">{t('profile.usage.range1')}</option>
            <option value="custom">{t('profile.usage.custom')}</option>
          </select>
        </label>
        <span className="bh-note">
          {start} – {end}
        </span>
      </div>
      {preset === 'custom' ? (
        <div className="bh-model-usage-range">
          <label>
            {t('profile.usage.start')}
            <input
              className="bh-profile-policy-select"
              type="date"
              min={firstDay}
              max={today}
              value={customStart}
              onChange={(event) => setStart(event.target.value)}
            />
          </label>
          <label>
            {t('profile.usage.end')}
            <input
              className="bh-profile-policy-select"
              type="date"
              min={firstDay}
              max={today}
              value={customEnd}
              onChange={(event) => setEnd(event.target.value)}
            />
          </label>
        </div>
      ) : null}
      {status === 'unavailable' ? (
        <p className="bh-note" role="status">
          {t('profile.usage.unavailable')}
        </p>
      ) : !valid ? (
        <p className="bh-note" role="alert">
          {t('profile.usage.invalidRange')}
        </p>
      ) : (
        <>
          <strong className="bh-profile-card-total" aria-live="polite">
            {t('profile.usage.periodTotal', { count: count(total) })}
          </strong>
          {selected.length === 0 ? (
            <p className="bh-profile-empty">{t('profile.usage.periodEmpty')}</p>
          ) : (
            <>
              {selected.some((row) => bucketKeys.some((key) => row[key] === null)) ? (
                <p className="bh-note" role="status">
                  {t('profile.usage.partial')}
                </p>
              ) : null}
              <div className="bh-usage-daily">
                <strong>{t('profile.usage.daily')}</strong>
                <UsageChart rows={series} label={t('profile.usage.daily')} t={t} />
                <div className="bh-usage-axis-labels">
                  <span>{start}</span>
                  <span>{end}</span>
                </div>
              </div>
              <div className="bh-usage-models">
                <strong>{t('profile.usage.byModel')}</strong>
                <div className="bh-usage-model-plot">
                  <div className="bh-usage-model-labels">
                    {models.map((row) => (
                      <div className="bh-usage-model-label" key={row.key}>
                        <span title={row.label}>{row.model}</span>
                        <span className="bh-note" title={row.provider}>
                          {row.provider}
                        </span>
                        <strong>{count(row.totalTokens)} tokens</strong>
                      </div>
                    ))}
                  </div>
                  <UsageChart rows={models} horizontal label={t('profile.usage.byModel')} t={t} />
                </div>
              </div>
              <details
                className="bh-usage-details"
                onToggle={(event) => setExpanded(event.currentTarget.open)}
              >
                <summary>{t('profile.usage.details')}</summary>
                {expanded ? (
                  <div>
                    <p className="bh-note">{t('profile.usage.observed')}</p>
                    <strong>{t('profile.usage.executionDetails')}</strong>
                    {details.map((row) => (
                      <div key={row.key} className="bh-model-usage-route">
                        <strong>{row.label}</strong>
                        <Buckets row={row} t={t} />
                      </div>
                    ))}
                    <strong>{t('profile.usage.daily')}</strong>
                    <div className="bh-usage-table-scroll">
                      <table className="bh-usage-day-table">
                        <caption>
                          {start} – {end}
                        </caption>
                        <thead>
                          <tr>
                            <th scope="col">{t('profile.usage.day')}</th>
                            {bucketLabels.map((key) => (
                              <th scope="col" key={key}>
                                {t(key)}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {days
                            .sort((a, b) => b.key.localeCompare(a.key))
                            .map((row) => (
                              <tr key={row.key}>
                                <th scope="row">{row.label}</th>
                                {bucketKeys.map((key) => (
                                  <td key={key}>{count(row[key])}</td>
                                ))}
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </details>
            </>
          )}
        </>
      )}
    </section>
  );
}
