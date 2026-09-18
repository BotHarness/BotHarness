import { useMemo, type ReactElement } from 'react';

import { Chart } from '@tanstack/react-charts';
import { barY, defineChart } from '@tanstack/charts';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';

import { STATE_COLORS, STATE_LABELS, STATE_ORDER, type BotState } from './labels.js';

export function StateDistributionChart({
  counts,
}: {
  counts: Record<BotState, number>;
}): ReactElement {
  const definition = useMemo(
    () =>
      defineChart({
        marks: [
          barY(
            STATE_ORDER.map((state) => ({
              state,
              label: STATE_LABELS[state],
              count: counts[state],
            })),
            {
              x: 'label',
              y: 'count',
              fill: (row) => STATE_COLORS[row.state],
              radius: 3,
            },
          ),
        ],
        scales: {
          x: { scale: () => scaleBand<string>().padding(0.25) },
          y: { scale: scaleLinear, nice: true },
        },
        tooltip: false,
      }),
    [counts],
  );

  return (
    <Chart
      definition={definition}
      height={170}
      initialWidth={560}
      ariaLabel="PersonaBot 状态分布"
      ariaDescription="按聚合状态统计的 PersonaBot 数量"
    />
  );
}
