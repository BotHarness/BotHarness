// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ProfileModelUsageRow } from '../src/client/bridge.js';
import { en } from '../src/client/locale.js';
import { ModelUsageBreakdown } from '../src/client/model-usage-breakdown.js';
import { UsageMeasures, type UsageSummary } from '../src/client/model-usage-charts.js';

function translate(key: string, params?: Record<string, unknown>): string {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}
const base: ProfileModelUsageRow = {
  day: '2026-09-30',
  purpose: 'orchestrator',
  provider: 'provider-a',
  model: 'shared-name',
  inputTokens: 100,
  outputTokens: 40,
  cacheReadTokens: 10,
  cacheWriteTokens: 5,
  totalTokens: 155,
};
const props = { today: '2026-09-30', firstDay: '2026-04-02', t: translate };

function tooltipMeasures(row: ProfileModelUsageRow): string[] {
  const summary: UsageSummary = { ...row, key: row.model, label: row.model };
  const container = document.createElement('div');
  container.innerHTML = renderToStaticMarkup(
    createElement(UsageMeasures, { row: summary, t: translate }),
  );
  return [...container.querySelectorAll('dd')].map((element) => element.textContent!);
}

async function renderUsage(
  rows: ProfileModelUsageRow[],
  status: 'ready' | 'unavailable' = 'ready',
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(createElement(ModelUsageBreakdown, { ...props, rows, status })),
  );
  return {
    container,
    cleanup: async () => {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}
async function choose(container: HTMLElement, value: string) {
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>('select')!;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function setDate(container: HTMLElement, index: number, value: string) {
  await act(async () => {
    const input = container.querySelectorAll<HTMLInputElement>('input[type="date"]')[index]!;
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
      input,
      value,
    );
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function openDetails(container: HTMLElement) {
  await act(async () => {
    const details = container.querySelector<HTMLDetailsElement>('.bh-usage-details')!;
    details.open = true;
    details.dispatchEvent(new Event('toggle'));
  });
}

describe('coordinated actual-model usage', () => {
  it('merges roles and providers by model by default and synchronizes charts and details to one range', async () => {
    const { container, cleanup } = await renderUsage([
      base,
      { ...base, provider: 'provider-b', cacheWriteTokens: null, totalTokens: 150 },
      { ...base, day: '2026-09-29', inputTokens: 145, totalTokens: 200 },
      { ...base, day: '2026-09-23', inputTokens: 445, totalTokens: 500 },
      {
        ...base,
        purpose: 'assignment',
        inputTokens: 10,
        outputTokens: 5,
        cacheReadTokens: 5,
        cacheWriteTokens: 0,
        totalTokens: 20,
      },
      {
        ...base,
        purpose: 'subagent',
        inputTokens: 20,
        outputTokens: 5,
        cacheReadTokens: 5,
        cacheWriteTokens: 0,
        totalTokens: 30,
      },
    ]);
    try {
      expect(container.querySelector('select')?.value).toBe('7');
      expect(container.querySelector('.bh-usage-axis-labels')?.textContent).toBe(
        '2026-09-242026-09-30',
      );
      expect(container.querySelectorAll('.bh-profile-bar-chart')).toHaveLength(3);
      expect(container.querySelectorAll('.bh-usage-model-label')).toHaveLength(1);
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '555 tokens',
      );
      expect(container.textContent).toContain('Selected period: 555 tokens');
      expect(container.textContent).not.toContain('provider-a');
      expect(container.textContent).not.toContain('provider-b');
      expect(container.querySelector<HTMLDetailsElement>('details')?.open).toBe(false);
      expect(container.textContent).not.toContain('Orchestrator');
      expect(container.textContent).not.toContain('Assignment');
      expect(container.textContent).not.toContain('DSH Subagent');
      await openDetails(container);
      expect(container.querySelectorAll('.bh-model-usage-route')).toHaveLength(4);
      expect(container.textContent).toContain('Unknown');
      expect(container.textContent).toContain('Orchestrator');
      expect(container.textContent).toContain('Assignment');
      expect(container.textContent).toContain('DSH Subagent');
      const dailyTotal = [...container.querySelectorAll('.bh-usage-day-table tbody tr')].reduce(
        (sum, row) => sum + Number(row.querySelector('td:last-child')?.textContent),
        0,
      );
      expect(dailyTotal).toBe(555);
      await choose(container, '182');
      expect(container.textContent).toContain('Selected period: 1,055 tokens');
      await choose(container, '7');
      expect(container.textContent).toContain('Selected period: 555 tokens');
      await choose(container, '1');
      expect(container.textContent).toContain('Selected period: 355 tokens');
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '355 tokens',
      );
      expect(container.querySelectorAll('.bh-usage-day-table tbody tr')).toHaveLength(1);
      expect(container.querySelector('.bh-usage-axis-labels')?.textContent).toBe(
        '2026-09-302026-09-30',
      );
      await choose(container, 'custom');
      await setDate(container, 0, '2026-09-29');
      await setDate(container, 1, '2026-09-29');
      expect(container.textContent).toContain('Selected period: 200 tokens');
      expect(container.querySelectorAll('.bh-usage-model-label')).toHaveLength(1);
      expect(container.querySelectorAll('.bh-model-usage-route')).toHaveLength(1);
      await setDate(container, 0, '2026-09-28');
      await setDate(container, 1, '2026-09-28');
      expect(container.textContent).toContain('No model calls recorded in this period');
      expect(container.querySelectorAll('.bh-profile-bar-chart')).toHaveLength(0);
      await setDate(container, 0, '2026-09-30');
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'Choose valid start and end dates',
      );
    } finally {
      await cleanup();
    }
  });
  it('keeps an independently known total when buckets are missing, and makes missing totals unknown', async () => {
    const { container, cleanup } = await renderUsage([
      { ...base, inputTokens: null, cacheReadTokens: null },
    ]);
    try {
      expect(container.textContent).toContain('Selected period: 155 tokens');
      await openDetails(container);
      expect(container.textContent).toContain('Unknown');
    } finally {
      await cleanup();
    }
    const missing = await renderUsage([
      {
        ...base,
        totalTokens: null,
        inputTokens: null,
        outputTokens: null,
        cacheReadTokens: null,
        cacheWriteTokens: null,
      },
    ]);
    try {
      expect(missing.container.textContent).toContain('Selected period: Unknown tokens');
      expect(missing.container.querySelector('.bh-profile-empty')).toBeNull();
      expect(missing.container.querySelector('.bh-usage-model-labels')?.textContent).not.toContain(
        '0 tokens',
      );
    } finally {
      await missing.cleanup();
    }
  });
  it('keeps model rows compact while weighted cache ratios follow the selected range', async () => {
    const { container, cleanup } = await renderUsage([
      base,
      {
        ...base,
        day: '2026-09-29',
        purpose: 'assignment',
        inputTokens: 0,
        cacheReadTokens: 90,
        cacheWriteTokens: 5,
        outputTokens: 5,
        totalTokens: 100,
      },
      { ...base, provider: 'provider-b', model: 'another-model' },
    ]);
    try {
      const model = container.querySelector('.bh-usage-model-label')!;
      expect(model.textContent).toBe('shared-name255 tokens');
      expect(container.querySelector('.bh-usage-model-label .bh-usage-measures')).toBeNull();
      expect(container.querySelector('.bh-usage-cache-label')?.textContent).toContain('47.6%');
      expect(container.querySelectorAll('.bh-usage-cache-label')).toHaveLength(2);
      expect(container.querySelector('details')?.open).toBe(false);
      await choose(container, '1');
      expect(container.querySelector('.bh-usage-model-label')?.textContent).toBe(
        'another-model155 tokens',
      );
      expect(container.querySelector('.bh-usage-measures')).toBeNull();
      expect(container.querySelector('.bh-usage-cache-label')?.textContent).toContain('8.7%');
    } finally {
      await cleanup();
    }
  });
  it('switches model and provider summaries without nesting the other dimension or changing period totals', async () => {
    const { container, cleanup } = await renderUsage([
      base,
      { ...base, provider: 'provider-b' },
      {
        ...base,
        model: 'other-model',
        purpose: 'assignment',
        inputTokens: 10,
        cacheReadTokens: 5,
        cacheWriteTokens: 0,
        outputTokens: 5,
        totalTokens: 20,
      },
    ]);
    try {
      expect(container.querySelector('[data-group="model"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '310 tokens',
      );
      expect(container.textContent).not.toContain('provider-a');
      expect(container.textContent).not.toContain('provider-b');
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-group="provider"]')!.click();
      });
      expect(container.querySelector('[data-group="provider"]')?.getAttribute('aria-pressed')).toBe(
        'true',
      );
      const labels = container.querySelector('.bh-usage-model-labels')!.textContent!;
      expect(labels).toContain('provider-a175 tokens');
      expect(labels).toContain('provider-b155 tokens');
      expect(container.textContent).not.toContain('shared-name');
      expect(container.textContent).not.toContain('other-model');
      expect(container.querySelector('.bh-usage-cache')?.textContent).toContain(
        'Cache ratio by provider',
      );
      expect(container.querySelectorAll('.bh-usage-cache-label')).toHaveLength(2);
      expect(container.textContent).toContain('Selected period: 330 tokens');
      await act(async () => {
        container.querySelector<HTMLButtonElement>('[data-group="model"]')!.click();
      });
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '310 tokens',
      );
      expect(container.textContent).not.toContain('provider-a');
      expect(container.textContent).toContain('Selected period: 330 tokens');
    } finally {
      await cleanup();
    }
  });
  it('keeps unavailable and zero-denominator ratios unknown while showing independently known counts', async () => {
    const { container, cleanup } = await renderUsage([
      { ...base, inputTokens: null },
      {
        ...base,
        model: 'output-only',
        inputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 10,
        totalTokens: 10,
      },
    ]);
    try {
      const models = [...container.querySelectorAll('.bh-usage-model-label')];
      const partial = models.find((row) => row.textContent?.includes('shared-name'))!;
      expect(partial.textContent).toBe('shared-name155 tokens');
      expect(tooltipMeasures({ ...base, inputTokens: null })).toEqual([
        'Unknown',
        '10 · Unknown',
        '40 · 25.8%',
      ]);
      expect(container.querySelector('.bh-usage-legend')?.textContent).toContain(
        'Total (breakdown unavailable)',
      );
      const output = models.find((row) => row.textContent?.includes('output-only'))!;
      expect(output.textContent).toBe('output-only10 tokens');
      expect(
        tooltipMeasures({
          ...base,
          inputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          outputTokens: 10,
          totalTokens: 10,
        }),
      ).toEqual(['0', '0 · Unknown', '10 · 100%']);
      expect(container.querySelectorAll('.bh-usage-cache-label strong')).toHaveLength(2);
      expect(
        [...container.querySelectorAll('.bh-usage-cache-label strong')].map(
          (row) => row.textContent,
        ),
      ).toEqual(['Unknown', 'Unknown']);
    } finally {
      await cleanup();
    }
  });
  it('shows cache-write-inclusive input and independent output percentages in hover details', () => {
    expect(tooltipMeasures(base)).toEqual(['115', '10 · 8.7%', '40 · 25.8%']);
    expect(
      tooltipMeasures({
        ...base,
        inputTokens: 100,
        cacheReadTokens: 100,
        cacheWriteTokens: 10,
        outputTokens: 45,
        totalTokens: 255,
      }),
    ).toEqual(['210', '100 · 47.6%', '45 · 17.6%']);
  });
  it('distinguishes unavailable usage from an empty ready range', async () => {
    const { container, cleanup } = await renderUsage([], 'unavailable');
    try {
      expect(container.textContent).toContain('Model usage is temporarily unavailable');
      expect(container.querySelector('select')?.disabled).toBe(true);
      expect(container.querySelector('.bh-profile-card-total')).toBeNull();
    } finally {
      await cleanup();
    }
  });
});
