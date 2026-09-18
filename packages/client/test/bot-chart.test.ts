import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { describe, expect, it } from 'vitest';

import { StateDistributionChart } from '../src/client/bot-chart.js';

describe('StateDistributionChart', () => {
  it('prerenders a bar per aggregate state', () => {
    const markup = renderToStaticMarkup(
      createElement(StateDistributionChart, {
        counts: { thinking: 1, working: 2, waiting: 1, blocked: 0, idle: 3 },
      }),
    );

    expect(markup).toContain('ts-chart-host');
    expect(markup).toContain('<svg');
    expect(markup).toContain('进行中');
    expect(markup).toContain('阻塞');
  });
});
