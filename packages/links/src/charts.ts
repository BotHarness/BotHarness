import { barX, barY, createChartRuntime, defineChart, renderChartSvg } from '@tanstack/charts';
import { colorLegend, colorLegendItems } from '@tanstack/charts/legend';
import { scaleBand } from '@tanstack/charts/scales/band';
import { scaleLinear } from '@tanstack/charts/scales/linear';

export interface DailyClicks {
  day: string;
  platform: string;
  clicks: number;
}

export interface LinkTotal {
  link: string;
  clicks: number;
}

export interface ChartSvg {
  svg: string;
  width: number;
  height: number;
}

const WIDTH = 960;
const LINK_ROW_HEIGHT = 30;

function render(
  definition: Parameters<ReturnType<typeof createChartRuntime>['render']>[0],
  height: number,
  ariaLabel: string,
  idPrefix: string,
): ChartSvg {
  const runtime = createChartRuntime();
  try {
    const scene = runtime.render(definition, { width: WIDTH, height });
    return { svg: renderChartSvg(scene, { ariaLabel, idPrefix }), width: WIDTH, height };
  } finally {
    runtime.destroy();
  }
}

export function dailyClicksChart(days: readonly string[], rows: readonly DailyClicks[]): ChartSvg {
  const labelled = days.filter((_, index) => index % 5 === 0 || index === days.length - 1);
  const definition = defineChart({
    marks: [
      barY(rows, {
        x: 'day',
        y: 'clicks',
        color: 'platform',
        key: (row) => `${row.day}:${row.platform}`,
        radius: { end: 2 },
      }),
    ],
    scales: {
      x: {
        scale: scaleBand<string>().domain(days).padding(0.2),
        axis: { ticks: { values: labelled, format: (day: string) => day.slice(5) } },
      },
      y: { scale: scaleLinear, nice: true, grid: true },
    },
    color: {
      legend: colorLegend({
        placement: 'top',
        items: colorLegendItems({ justify: 'start', gap: 16 }),
      }),
    },
  });
  return render(definition, 240, 'Clicks per day by platform', 'daily');
}

export function linkClicksChart(links: readonly LinkTotal[]): ChartSvg {
  const sorted = [...links].sort((a, b) => b.clicks - a.clicks || a.link.localeCompare(b.link));
  const definition = defineChart({
    marks: [barX(sorted, { x: 'clicks', y: 'link', radius: { end: 2 } })],
    scales: {
      x: { scale: scaleLinear, nice: true, grid: true },
      y: {
        scale: scaleBand<string>()
          .domain(sorted.map((row) => row.link))
          .padding(0.25),
      },
    },
  });
  return render(definition, 40 + sorted.length * LINK_ROW_HEIGHT, 'Total clicks by link', 'links');
}
