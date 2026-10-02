import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useRef, useState, type ReactElement } from 'react';
import {
  Button,
  IconRefreshOutlineRegular,
  IconRightUpOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { OverviewUsage } from '../../../core/src/bridge/methods.js';
import type { BridgeActions } from './actions.js';
import type { BotHarnessTranslate } from './locale.js';
import { UsageChart, UsageLegend, UsageMeasures, type UsageSummary } from './model-usage-charts.js';
import { useMountedResource } from './mounted-resource.js';
export function OverviewUsageView({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [period, setPeriod] = useState<'today' | 'week'>('today');
  const [value, setValue] = useState<OverviewUsage>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const refresh = useRef<(after?: string) => void>(() => {});
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    let pending = false;
    let current: OverviewUsage | undefined;
    let midnight: ReturnType<typeof setTimeout> | undefined;
    setValue(undefined);
    setError(false);
    const load = async (after?: string): Promise<void> => {
      if (!active || pending) return;
      pending = true;
      setBusy(true);
      try {
        let next = await actions.overviewUsage(period, after);
        if (after && current && (next.start !== current.start || next.end !== current.end)) {
          next = await actions.overviewUsage(period);
          after = undefined;
        }
        if (!active) return;
        current = {
          ...next,
          bots:
            after && current
              ? [
                  ...current.bots,
                  ...next.bots.filter(
                    (row) => !current!.bots.some((existing) => existing.slug === row.slug),
                  ),
                ]
              : next.bots,
        };
        setValue(current);
        setError(false);
        if (midnight !== undefined) clearTimeout(midnight);
        midnight = setTimeout(
          () => void load(),
          Math.max(1000, Date.parse(next.nextRefreshAt) - Date.now() + 100),
        );
      } catch {
        if (active) setError(true);
      } finally {
        pending = false;
        if (active) setBusy(false);
      }
    };
    refresh.current = (after) => void load(after);
    void load();
    const timer = setInterval(() => void load(), 30000);
    return () => {
      active = false;
      clearInterval(timer);
      if (midnight !== undefined) clearTimeout(midnight);
      refresh.current = () => {};
    };
  }, [actions, period]);
  const count = (tokens: number | null): string =>
    tokens === null ? t('profile.usage.unknown') : tokens.toLocaleString();
  const rows: UsageSummary[] =
    value?.days.map((row) => ({ ...row, key: row.day, label: row.day })) ?? [];
  return (
    <section ref={mount} className="bh-overview-usage" aria-label={t('overviewUsage.title')}>
      <header>
        <div>
          <h3>{t('overviewUsage.title')}</h3>
          {value ? (
            <p>
              {value.start}
              {value.start === value.end ? '' : ` → ${value.end}`} · {value.timezone}
            </p>
          ) : null}
        </div>
        <div className="bh-overview-usage-controls">
          <div role="group" aria-label={t('overviewUsage.range')}>
            {(['today', 'week'] as const).map((range) => (
              <Button
                key={range}
                size="sm"
                variant={range === period ? 'primary' : 'outline'}
                aria-pressed={range === period}
                data-usage-period={range}
                onClick={() => setPeriod(range)}
              >
                {t(`overviewUsage.${range}`)}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            aria-label={t('overviewUsage.refresh')}
            aria-busy={busy}
            disabled={busy}
            onClick={() => refresh.current()}
          >
            <IconRefreshOutlineRegular size={16} />
          </Button>
        </div>
      </header>
      {busy && !value ? <p role="status">{t('overviewUsage.loading')}</p> : null}
      {error ? <p role="alert">{t('overviewUsage.error')}</p> : null}
      {value ? (
        <>
          <div className="bh-overview-usage-total">
            <span>{t('overviewUsage.total')}</span>
            <strong data-usage-total>{count(value.totals.totalTokens)}</strong>
            <span>tokens</span>
          </div>
          <p>{t('overviewUsage.scope')}</p>
          {value.freshness !== 'ready' ? (
            <p role="status">{t(`overviewUsage.${value.freshness}`)}</p>
          ) : null}
          {value.legacyBaseline ? <p>{t('overviewUsage.legacy')}</p> : null}
          {value.days.some((row) => Object.values(row).some((amount) => amount === null)) ? (
            <p>{t('overviewUsage.partial')}</p>
          ) : null}
          <UsageMeasures
            row={{ ...value.totals, key: 'total', label: t('overviewUsage.total') }}
            t={t}
          />
          {rows.some((row) => row.totalTokens !== null && row.totalTokens > 0) ? (
            <>
              <UsageLegend rows={rows} t={t} />
              <UsageChart rows={rows} kind="daily" label={t('overviewUsage.trend')} t={t} />
            </>
          ) : null}
          <div
            className={
              period === 'week'
                ? 'bh-overview-usage-axis bh-overview-usage-week'
                : 'bh-overview-usage-axis'
            }
            aria-hidden="true"
          >
            {value.days.map((row) => (
              <span key={row.day}>{row.day.slice(5)}</span>
            ))}
          </div>
          <details className="bh-overview-usage-days">
            <summary>{t('overviewUsage.daily')}</summary>
            <ul>
              {value.days.map((row) => (
                <li key={row.day}>
                  <span>{row.day}</span>
                  <strong>{count(row.totalTokens)}</strong>
                </li>
              ))}
            </ul>
          </details>
          <h4>{t('overviewUsage.bots')}</h4>
          {value.bots.length === 0 ? (
            <p>{t('overviewUsage.empty')}</p>
          ) : (
            <ul className="bh-overview-usage-bots">
              {value.bots.map((bot) => (
                <li key={bot.slug} data-usage-bot={bot.slug}>
                  <div>
                    <strong>{bot.displayName}</strong>
                    {!bot.current ? <span>{t('overviewUsage.retained')}</span> : null}
                  </div>
                  <strong>{count(bot.totalTokens)}</strong>
                  {bot.current ? (
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`${t('profile.open')}: ${bot.displayName}`}
                      onClick={() => void actions.openBot(bot.slug, 'profile')}
                    >
                      <IconRightUpOutlineRegular size={16} />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {value.nextCursor ? (
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => refresh.current(value.nextCursor)}
            >
              {t('overviewUsage.more')}
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
