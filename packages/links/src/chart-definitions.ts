import { barX, barY, defineChart } from '@tanstack/charts';
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

export interface ChartData {
  days: string[];
  daily: DailyClicks[];
  links: LinkTotal[];
}

export const DAILY_HEIGHT = 260;
export const LINK_ROW_HEIGHT = 30;

export function dailyClicksDefinition({ days, daily }: Pick<ChartData, 'days' | 'daily'>) {
  const labelled = days.filter((_, index) => index % 5 === 0 || index === days.length - 1);
  return defineChart({
    marks: [
      barY(daily, {
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
}

export function sortedLinkTotals(links: readonly LinkTotal[]): LinkTotal[] {
  return [...links].sort((a, b) => b.clicks - a.clicks || a.link.localeCompare(b.link));
}

export function linkClicksDefinition(links: readonly LinkTotal[]) {
  const sorted = sortedLinkTotals(links);
  return defineChart({
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
}

export function linkChartHeight(links: readonly LinkTotal[]): number {
  return 40 + links.length * LINK_ROW_HEIGHT;
}
