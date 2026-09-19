import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutline14: stub,
    Menu: (props: Record<string, unknown>) => {
      captured.menus.push(props);
      return props['anchor'];
    },
  };
});

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { BotModeRow } from '../src/client/bot-mode-row.js';
import { zh, type BotHarnessKey } from '../src/client/locale.js';

const t = (key: BotHarnessKey): string => zh[key];

function snapshot(patch?: Partial<BotModePrefsSnapshot>): BotModePrefsSnapshot {
  return { sortMode: 'updated', sortModes: {}, mode: 'host', status: 'ready', ...patch };
}

function renderRow(
  prefs: BotModePrefsSnapshot,
  setSortMode: (mode: string) => void = () => undefined,
): string {
  return renderToStaticMarkup(
    createElement(BotModeRow, {
      t,
      useBotModePrefs: ((selector: (value: BotModePrefsSnapshot) => unknown) =>
        selector(prefs)) as never,
      setSortMode: setSortMode as never,
    } as never),
  );
}

function lastMenu(): Record<string, unknown> {
  const found = captured.menus.at(-1);
  if (found === undefined) throw new Error('menu not rendered');
  return found;
}

beforeEach(() => {
  captured.menus.length = 0;
});

describe('BOT-mode General settings row', () => {
  it('renders the row copy and the selected mode from the shared store', () => {
    const markup = renderRow(snapshot({ sortMode: 'manual' }));

    expect(markup).toContain('BOT 列表排序');
    expect(markup).toContain('设置 BOT 模式列表的默认排序方式');
    expect(markup).toContain('手动排序');
    expect(markup).toContain('bh-sort-selector');
    expect(lastMenu()['selectedId']).toBe('manual');
    expect(
      (lastMenu()['items'] as readonly Record<string, unknown>[]).map((item) => item['id']),
    ).toEqual(['updated', 'manual']);
  });

  it('writes through the shared policy when an option is picked', () => {
    const setSortMode = vi.fn();
    renderRow(snapshot(), setSortMode);

    const onSelect = lastMenu()['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    onSelect('unrelated');
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('surfaces the memory-mode caveat instead of pretending persistence', () => {
    const markup = renderRow(snapshot({ status: 'unavailable', mode: 'memory' }));

    expect(markup).toContain('仅当前会话生效，不会保存');
    expect(markup).not.toContain('设置 BOT 模式列表的默认排序方式');
  });
});
