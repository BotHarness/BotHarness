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

describe('actual model usage breakdown', () => {
  it('separates providers, preserves unknown buckets, and changes the selected day', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
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
    const rows = [
      base,
      { ...base, provider: 'provider-b', cacheWriteTokens: null, totalTokens: 150 },
      { ...base, day: '2026-09-29', totalTokens: 200 },
      { ...base, purpose: 'assignment', totalTokens: 20 },
      { ...base, purpose: 'subagent', totalTokens: 30 },
    ];
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ModelUsageBreakdown, {
            rows,
            status: 'ready',
            today: '2026-09-30',
            firstDay: '2026-04-01',
            t: translate,
          }),
        ),
      );
      expect(container.querySelectorAll('.bh-model-usage-route')).toHaveLength(4);
      expect(container.textContent).toContain('provider-a / shared-name');
      expect(container.textContent).toContain('provider-b / shared-name');
      expect(container.textContent).toContain('Day total: 355 tokens');
      expect(container.textContent).toContain('Unknown');
      expect(container.textContent).toContain('Orchestrator');
      expect(container.textContent).toContain('Assignment');
      expect(container.textContent).toContain('DSH Subagent');
      const input = container.querySelector<HTMLInputElement>('input')!;
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '2026-09-29',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.querySelectorAll('.bh-model-usage-route')).toHaveLength(1);
      expect(container.textContent).toContain('Day total: 200 tokens');
      await act(async () => {
        Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!.call(
          input,
          '2026-09-28',
        );
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      expect(container.textContent).toContain('No model calls recorded for this day');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
