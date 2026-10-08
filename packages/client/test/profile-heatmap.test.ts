// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconRefreshOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  Menu: () => null,
}));

import { zhTranslate } from '../src/client/locale.js';
import { ProfileHeatmap, type HeatmapPage } from '../src/client/profile-cards-builtins.js';

const TODAY = '2026-10-08';
let width = 600;
let root: Root;
let host: HTMLDivElement;

function dayOffset(day: string, amount: number): string {
  const [year, month, date] = day.split('-').map(Number);
  const value = new Date(year!, month! - 1, date! + amount);
  return `${value.getFullYear()}-${`${value.getMonth() + 1}`.padStart(2, '0')}-${`${value.getDate()}`.padStart(2, '0')}`;
}

beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('bh-profile-heat-scroll') ? width : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      const grid = this.classList.contains('bh-profile-heat-grid')
        ? this
        : this.querySelector('.bh-profile-heat-grid');
      return grid === null ? 0 : (grid.children.length / 7) * 12 - 2;
    },
  });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth;
  delete (HTMLElement.prototype as { scrollWidth?: number }).scrollWidth;
});

function weeks(): number {
  return host.querySelectorAll('.bh-profile-heat-cell').length / 7;
}

it('fills the width, loads older weeks while scrolling back and stops at creation', async () => {
  width = 600;
  const firstDay = dayOffset('2026-10-05', -119 * 7);
  const loadOlder = vi.fn(async (before: string): Promise<HeatmapPage> => ({
    counts: new Map([[dayOffset(before, -3), 4]]),
  }));
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map([[TODAY, 2]]),
        label: 'Events',
        today: TODAY,
        firstDay,
        loadOlder,
        t: zhTranslate,
      }),
    ),
  );
  expect(loadOlder).toHaveBeenCalledTimes(1);
  expect(loadOlder).toHaveBeenLastCalledWith(dayOffset('2026-10-05', -25 * 7), 50);
  expect(weeks()).toBe(76);
  const older = dayOffset(dayOffset('2026-10-05', -25 * 7), -3);
  expect(host.querySelector(`[data-day="${older}"]`)?.getAttribute('data-level')).toBe('2');

  const scroller = host.querySelector<HTMLElement>('.bh-profile-heat-scroll')!;
  await act(async () => {
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(loadOlder).toHaveBeenCalledTimes(2);
  expect(weeks()).toBe(120);
  expect(host.querySelector(`[data-day="${dayOffset(firstDay, -1)}"]`)).toBeNull();
  await act(async () => {
    scroller.scrollLeft = 0;
    scroller.dispatchEvent(new Event('scroll'));
  });
  expect(loadOlder).toHaveBeenCalledTimes(2);
});

it('fits the popover width without loading or scrolling', async () => {
  width = 200;
  const loadOlder = vi.fn();
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map(),
        label: 'Events',
        today: TODAY,
        compact: true,
        loadOlder,
        t: zhTranslate,
      }),
    ),
  );
  expect(weeks()).toBe(20);
  expect(host.querySelector('.bh-profile-heat')?.getAttribute('data-compact')).toBe('true');
  expect(loadOlder).not.toHaveBeenCalled();
});

it('shows the per-reason breakdown in the cell tooltip', async () => {
  width = 300;
  await act(async () =>
    root.render(
      createElement(ProfileHeatmap, {
        counts: new Map([[TODAY, 3]]),
        details: new Map([[TODAY, ['私聊 · 2', '群里 @ · 1']]]),
        label: 'Events',
        today: TODAY,
        t: zhTranslate,
      }),
    ),
  );
  await act(async () => host.querySelector<HTMLElement>(`[data-day="${TODAY}"]`)!.focus());
  const tip = host.querySelector('[role="tooltip"]')!;
  expect(tip.textContent).toContain(TODAY);
  expect([...tip.querySelectorAll('.bh-profile-tip-line')].map((line) => line.textContent)).toEqual(
    ['私聊 · 2', '群里 @ · 1'],
  );
});
