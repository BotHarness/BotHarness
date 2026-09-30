// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';

import type { ProfileModelUsageRow } from '../src/client/bridge.js';
import { en } from '../src/client/locale.js';
import { ModelUsageBreakdown } from '../src/client/model-usage-breakdown.js';

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
  it('merges roles by exact provider/model by default and synchronizes both charts and details to one range', async () => {
    const { container, cleanup } = await renderUsage([
      base,
      { ...base, provider: 'provider-b', cacheWriteTokens: null, totalTokens: 150 },
      { ...base, day: '2026-09-29', inputTokens: 145, totalTokens: 200 },
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
      expect(container.querySelector('select')?.value).toBe('182');
      expect(container.querySelectorAll('.bh-profile-bar-chart')).toHaveLength(2);
      expect(container.querySelectorAll('.bh-usage-model-label')).toHaveLength(2);
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '405 tokens',
      );
      expect(container.textContent).toContain('Selected period: 555 tokens');
      expect(container.textContent).toContain('provider-a');
      expect(container.textContent).toContain('provider-b');
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
      await choose(container, '1');
      expect(container.textContent).toContain('Selected period: 355 tokens');
      expect(container.querySelector('.bh-usage-model-labels')?.textContent).toContain(
        '205 tokens',
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
