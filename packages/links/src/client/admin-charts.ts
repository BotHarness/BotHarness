import { defineChart } from '@tanstack/charts';
import { mountChart } from '@tanstack/charts/dom';
import { tooltip } from '@tanstack/charts/tooltip';
import {
  dailyClicksDefinition,
  DAILY_HEIGHT,
  linkChartHeight,
  linkClicksDefinition,
  type ChartData,
} from '../chart-definitions.js';

const source = document.getElementById('chart-data');
if (source?.textContent) {
  const data = JSON.parse(source.textContent) as ChartData;
  const daily = document.querySelector<HTMLElement>('[data-chart="daily"]');
  if (daily) {
    mountChart(daily, {
      definition: defineChart(dailyClicksDefinition(data), { focus: 'group-x', tooltip }),
      height: DAILY_HEIGHT,
      initialWidth: 960,
      ariaLabel: 'Clicks per day by platform',
    });
  }
  const links = document.querySelector<HTMLElement>('[data-chart="links"]');
  if (links) {
    mountChart(links, {
      definition: defineChart(linkClicksDefinition(data.links), { tooltip }),
      height: linkChartHeight(data.links),
      initialWidth: 960,
      ariaLabel: 'Total clicks by link',
    });
  }
}
