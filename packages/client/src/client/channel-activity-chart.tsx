import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import { useMemo, type ReactElement } from 'react';
import { barX, defineChart, stack } from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { scalePoint } from '@tanstack/charts/scales/point';
import { tooltip } from '@tanstack/charts/tooltip';
import { Chart } from '@tanstack/charts/react/tooltip';
import type { ChannelActivityRow } from '../../../core/src/channels/activity-today.js';
import type { BotHarnessTranslate } from './locale.js';
import { useProfileChartTokens } from './profile-chart-theme.js';

type Datum = { channelId: string; series: 'human' | 'bot' | 'other'; count: number };
export function ChannelActivityChart({
  rows,
  t,
  onSelect,
}: {
  rows: ChannelActivityRow[];
  t: BotHarnessTranslate;
  onSelect: (channelId: string) => void;
}): ReactElement {
  const colors = useProfileChartTokens();
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barX<Datum>(
            rows.flatMap((row) =>
              (['human', 'bot', 'other'] as const).map((series) => ({
                channelId: row.channelId,
                series,
                count: row[series],
              })),
            ),
            {
              x: 'count',
              y: 'channelId',
              z: 'series',
              color: 'series',
              layout: stack({ order: ['human', 'bot', 'other'] }),
              maxThickness: 18,
              radius: 2,
            },
          ),
        ],
        scales: {
          x: {
            scale: scaleLinear,
            domain: [0, rows.reduce((max, row) => Math.max(max, row.total), 1)],
            nice: true,
            grid: true,
            axis: { ticks: { format: (value) => String(value) } },
          },
          y: {
            scale: () => scalePoint<string>().padding(0.5),
            domain: rows.map((row) => row.channelId),
            axis: {
              ticks: {
                format: (value) => {
                  const name =
                    rows.find((row) => row.channelId === String(value))?.name ?? String(value);
                  return name.length > 16 ? name.slice(0, 15) + '…' : name;
                },
              },
            },
          },
        },
        color: {
          domain: ['human', 'bot', 'other'],
          range: [colors.cached, colors.output, colors.muted],
        },
        margin: { top: 4, left: 116, right: 16, bottom: 28 },
        tooltip,
        theme: {
          foreground: colors.foreground,
          muted: colors.muted,
          grid: colors.grid,
          background: 'transparent',
        },
      }),
    [rows, colors],
  );
  return (
    <Chart
      definition={definition}
      height={Math.max(80, rows.length * 36 + 32)}
      ariaLabel={t('channelActivity.title')}
      className="bh-channel-statistics-chart"
      onSelect={(point) => {
        if (point) onSelect(point.datum.channelId);
      }}
      renderTooltipBody={({ points }) => {
        const point = points[0];
        const row = rows.find((row) => row.channelId === point?.datum.channelId);
        return row ? (
          <div className="bh-profile-chart-tip">
            <strong>{row.name}</strong>
            <span>
              {t('channelActivity.messages')}: {row.total}
            </span>
            <span>
              {t('channelActivity.human')}: {row.human} · {t('channelActivity.bot')}: {row.bot} ·{' '}
              {t('channelActivity.other')}: {row.other}
            </span>
          </div>
        ) : null;
      }}
    />
  );
}
