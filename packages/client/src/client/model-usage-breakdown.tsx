import { useRef, useState, type ReactElement } from 'react';
import { IconRefreshOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import { useMountedResource } from './mounted-resource.js';
import type { UsageFilter, UsageQueryResult, ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { CacheRatio, UsageChart, UsageLegend, type UsageSummary } from './model-usage-charts.js';

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
function sumBucket(left: number | null, right: number | null): number | null {
  return left === null || right === null ? null : left + right;
}

function summaries(
  rows: readonly ProfileModelUsageRow[],
  group: (row: ProfileModelUsageRow) => Pick<UsageSummary, 'key' | 'label'>,
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

export function ModelUsageBreakdown({
  rows: initialRows,
  status: initialStatus,
  loadUsage,
  today,
  firstDay,
  t,
}: {
  loadUsage?: (filter: UsageFilter) => Promise<UsageQueryResult>;
  rows: readonly ProfileModelUsageRow[];
  status: 'ready' | 'unavailable';
  today: string;
  firstDay: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const [route, setRoute] = useState('');
  const [purpose, setPurpose] = useState<UsageFilter['purpose']>();
  const [refresh, setRefresh] = useState(0);
  const [resource, setResource] = useState<{
    key: string;
    result?: UsageQueryResult;
    error?: boolean;
    loading?: boolean;
  }>();
  const request = useRef(0);
  const [preset, setPreset] = useState('7');
  const [customStart, setStart] = useState(firstDay);
  const [customEnd, setEnd] = useState(today);
  const [expanded, setExpanded] = useState(false);
  const [grouping, setGrouping] = useState<'model' | 'provider'>('model');
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
  const filter: UsageFilter = {
    start,
    end,
    ...(route ? { [grouping]: route } : {}),
    ...(purpose ? { purpose } : {}),
  };
  const key = JSON.stringify(filter);
  const mount = useMountedResource<HTMLElement>(() => {
    const generation = ++request.current;
    if (!valid || loadUsage === undefined) return;
    setResource((previous) => ({
      key,
      loading: true,
      ...(previous?.key === key && previous.result ? { result: previous.result } : {}),
    }));
    void loadUsage(filter).then(
      (result) => {
        if (generation === request.current) setResource({ key, result });
      },
      () => {
        if (generation === request.current)
          setResource((previous) => ({
            key,
            error: true,
            ...(previous?.key === key && previous.result ? { result: previous.result } : {}),
          }));
      },
    );
    return () => {
      ++request.current;
    };
  }, [key, valid, loadUsage, refresh]);
  const query = resource?.key === key ? resource.result : undefined;
  const loading =
    loadUsage !== undefined && valid && (resource?.key !== key || resource.loading === true);
  const error = resource?.key === key && resource.error === true;
  const rows = loadUsage === undefined ? initialRows : (query?.rows ?? []);
  const status =
    loadUsage === undefined ? initialStatus : query === undefined ? 'unavailable' : 'ready';
  const routes =
    (grouping === 'model' ? resource?.result?.models : resource?.result?.providers) ??
    [...new Set(initialRows.map((row) => row[grouping]))].sort();
  const selected = valid
    ? rows.filter(
        (row) =>
          row.day >= start &&
          row.day <= end &&
          (!route || row[grouping] === route) &&
          (!purpose || row.purpose === purpose),
      )
    : [];
  const models = summaries(selected, (row) => ({
    key: row[grouping],
    label: row[grouping],
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
  const calculatedTotal = models.reduce<number | null>(
    (sum, row) => sumBucket(sum, row.totalTokens),
    0,
  );
  const total = query === undefined ? calculatedTotal : query.periodTotal;
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
      ref={mount}
      aria-busy={loading}
      className="bh-model-usage bh-model-usage-overview"
      aria-label={t('profile.card.tokens')}
    >
      <div className="bh-model-usage-header">
        <label>
          {t('profile.usage.range')}
          <select
            className="bh-profile-policy-select"
            value={preset}
            disabled={loadUsage === undefined && status !== 'ready'}
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
      <div className="bh-model-usage-header">
        <div className="bh-usage-grouping" role="group" aria-label={t('profile.usage.grouping')}>
          <button
            type="button"
            data-group="model"
            aria-pressed={grouping === 'model'}
            onClick={() => {
              setGrouping('model');
              setRoute('');
            }}
          >
            {t('profile.usage.models')}
          </button>
          <button
            type="button"
            data-group="provider"
            aria-pressed={grouping === 'provider'}
            onClick={() => {
              setGrouping('provider');
              setRoute('');
            }}
          >
            {t('profile.usage.providers')}
          </button>
        </div>
        <label>
          {t(grouping === 'model' ? 'profile.usage.models' : 'profile.usage.providers')}
          <select
            className="bh-profile-policy-select"
            aria-label={t('profile.usage.routeFilter')}
            value={route}
            onChange={(event) => setRoute(event.target.value)}
          >
            <option value="">{t('profile.usage.allRoutes')}</option>
            {routes.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {loadUsage !== undefined ? (
          <button
            type="button"
            className="bh-profile-pin"
            aria-label={t('profile.usage.refresh')}
            title={t('profile.usage.refresh')}
            disabled={loading}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <IconRefreshOutlineRegular size={16} />
          </button>
        ) : null}
      </div>
      {loading && query !== undefined ? (
        <p className="bh-note" role="status">
          {t('profile.usage.loading')}
        </p>
      ) : null}
      {error && query !== undefined ? (
        <p className="bh-note" role="status">
          {t('profile.usage.stale', { at: new Date(query.readAt).toLocaleString() })}
        </p>
      ) : null}
      {query !== undefined ? (
        <>
          <p className="bh-note" aria-live="polite">
            {t('profile.usage.allTime', { count: count(query.allTimeTotal) })}
          </p>
          {query.freshness !== 'ready' ? (
            <p className="bh-note" role="status">
              {t(
                query.freshness === 'reconciling'
                  ? 'profile.usage.reconciling'
                  : 'profile.usage.degraded',
              )}
            </p>
          ) : null}
          {query.legacyBaseline ? (
            <p className="bh-note" role="status">
              {t('profile.usage.legacy')}
            </p>
          ) : null}
          {query.facetsTruncated ? (
            <p className="bh-note" role="status">
              {t('profile.usage.facetsTruncated')}
            </p>
          ) : null}
        </>
      ) : null}
      {status === 'unavailable' ? (
        <p className="bh-note" role="status">
          {t(
            error
              ? 'profile.usage.loadFailed'
              : loading
                ? 'profile.usage.loading'
                : 'profile.usage.unavailable',
          )}
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
          {query?.truncated === true ? (
            <p className="bh-note" role="status">
              {t('profile.usage.truncated')}
            </p>
          ) : selected.length === 0 ? (
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
                <UsageChart rows={series} kind="daily" label={t('profile.usage.daily')} t={t} />
                <div className="bh-usage-axis-labels">
                  <span>{start}</span>
                  <span>{end}</span>
                </div>
              </div>
              <div className="bh-usage-models">
                <div className="bh-usage-model-heading">
                  <strong>
                    {t(grouping === 'model' ? 'profile.usage.byModel' : 'profile.usage.byProvider')}
                  </strong>
                </div>
                <UsageLegend rows={models} t={t} />
                <div className="bh-usage-model-plot">
                  <div className="bh-usage-model-labels">
                    {models.map((row) => (
                      <div className="bh-usage-model-label" key={row.key}>
                        <span title={row.label}>{row.label}</span>
                        <strong>{count(row.totalTokens)} tokens</strong>
                      </div>
                    ))}
                  </div>
                  <UsageChart
                    rows={models}
                    kind="model"
                    label={t(
                      grouping === 'model' ? 'profile.usage.byModel' : 'profile.usage.byProvider',
                    )}
                    t={t}
                  />
                </div>
              </div>
              <div className="bh-usage-cache">
                <strong>
                  {t(
                    grouping === 'model'
                      ? 'profile.usage.cacheRatio'
                      : 'profile.usage.providerCacheRatio',
                  )}
                </strong>
                <p className="bh-note">{t('profile.usage.ratioDescription')}</p>
                <div className="bh-usage-model-plot">
                  <div>
                    {models.map((row) => (
                      <div className="bh-usage-cache-label" key={row.key}>
                        <span title={row.label}>{row.label}</span>
                        <CacheRatio row={row} t={t} />
                      </div>
                    ))}
                  </div>
                  <div>
                    <UsageChart
                      rows={models}
                      kind="cache"
                      label={t(
                        grouping === 'model'
                          ? 'profile.usage.cacheRatio'
                          : 'profile.usage.providerCacheRatio',
                      )}
                      t={t}
                    />
                    <div className="bh-usage-axis-labels">
                      <span>0%</span>
                      <span>100%</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}
      <details
        className="bh-usage-details"
        onToggle={(event) => setExpanded(event.currentTarget.open)}
      >
        <summary>
          {t('profile.usage.details')}
          {purpose ? ` · ${role(purpose)}` : ''}
        </summary>
        {expanded ? (
          <div>
            <label>
              {t('profile.usage.roleFilter')}
              <select
                className="bh-profile-policy-select"
                aria-label={t('profile.usage.roleFilter')}
                value={purpose ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setPurpose(
                    value === 'orchestrator' || value === 'assignment' || value === 'subagent'
                      ? value
                      : undefined,
                  );
                }}
              >
                <option value="">{t('profile.usage.allRoles')}</option>
                {['orchestrator', 'assignment', 'subagent'].map((value) => (
                  <option key={value} value={value}>
                    {role(value)}
                  </option>
                ))}
              </select>
            </label>
            {query !== undefined ? (
              <p className="bh-note">
                {t('profile.usage.readAt', { at: new Date(query.readAt).toLocaleString() })}
              </p>
            ) : null}
            <p className="bh-note">{t('profile.usage.observed')}</p>
            {query?.truncated ? null : (
              <>
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
              </>
            )}
          </div>
        ) : null}
      </details>
    </section>
  );
}
