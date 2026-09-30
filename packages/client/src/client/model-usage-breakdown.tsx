import { useState, type ReactElement } from 'react';

import type { ProfileModelUsageRow } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

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
  const [selectedDay, setDay] = useState<string>();
  const day = selectedDay ?? today;
  const routes = new Map<string, ProfileModelUsageRow>();
  for (const row of rows) {
    if (row.day !== day) continue;
    const key = JSON.stringify([row.purpose, row.provider, row.model]);
    const previous = routes.get(key);
    if (previous === undefined) routes.set(key, { ...row });
    else
      for (const bucket of bucketKeys) previous[bucket] = sumBucket(previous[bucket], row[bucket]);
  }
  const total = [...routes.values()].reduce<number | null>(
    (sum, row) => sumBucket(sum, row.totalTokens),
    0,
  );
  const count = (value: number | null): string =>
    value === null ? t('profile.usage.unknown') : value.toLocaleString();
  return (
    <section className="bh-model-usage" aria-label={t('profile.usage.byModel')}>
      <div className="bh-model-usage-header">
        <strong>{t('profile.usage.byModel')}</strong>
        <label>
          {t('profile.usage.day')}
          <input
            className="bh-profile-policy-select"
            type="date"
            value={day}
            min={firstDay}
            max={today}
            onChange={(event) => {
              const next = event.target.value;
              if (next >= firstDay && next <= today) setDay(next);
            }}
          />
        </label>
      </div>
      {status === 'unavailable' ? (
        <p className="bh-note" role="status">
          {t('profile.usage.unavailable')}
        </p>
      ) : (
        <>
          <span className="bh-note">{t('profile.usage.observed')}</span>
          {routes.size === 0 ? (
            <p className="bh-profile-empty">{t('profile.usage.empty')}</p>
          ) : (
            <>
              <strong>{t('profile.usage.dayTotal', { count: count(total) })}</strong>
              {[...routes.entries()].map(([key, row]) => (
                <div key={key} className="bh-model-usage-route">
                  <strong>
                    {row.provider} / {row.model}
                  </strong>
                  <span className="bh-note">
                    {row.purpose === 'orchestrator'
                      ? t('sessions.role.orchestrator')
                      : row.purpose === 'assignment'
                        ? t('sessions.role.assignment')
                        : row.purpose === 'subagent'
                          ? t('profile.usage.subagent')
                          : row.purpose}
                  </span>
                  <dl className="bh-model-usage-buckets">
                    {bucketKeys.map((bucket, index) => (
                      <div key={bucket}>
                        <dt>{t(bucketLabels[index]!)}</dt>
                        <dd>{count(row[bucket])}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
              {rows.some(
                (row) => row.day === day && bucketKeys.some((bucket) => row[bucket] === null),
              ) ? (
                <p className="bh-note">{t('profile.usage.partial')}</p>
              ) : null}
            </>
          )}
        </>
      )}
    </section>
  );
}
