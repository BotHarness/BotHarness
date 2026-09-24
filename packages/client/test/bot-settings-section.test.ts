import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  menus: [] as Array<Record<string, unknown>>,
  switches: [] as Array<Record<string, unknown>>,
}));

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutline14: stub,
    Switch: (props: Record<string, unknown>) => {
      captured.switches.push(props);
      return null;
    },
    Menu: (props: Record<string, unknown>) => {
      captured.menus.push(props);
      return props['anchor'];
    },
  };
});

import type { BotModePrefsSnapshot } from '../src/client/bot-mode-prefs.js';
import { BotIconCard, BotSettingsSection } from '../src/client/bot-settings-section.js';
import { zh, zhTranslate, type BotHarnessKey } from '../src/client/locale.js';

const t = zhTranslate;

function snapshot(patch?: Partial<BotModePrefsSnapshot>): BotModePrefsSnapshot {
  return {
    motionPreference: 'system',
    botIcon: 'mascot' as const,
    developerMode: false,
    effectiveMotion: 'full',
    sortMode: 'updated',
    sortModes: {},
    mode: 'host',
    status: 'ready',
    ...patch,
  };
}

function renderSection(
  prefs: BotModePrefsSnapshot,
  setSortMode: (mode: string) => void = () => undefined,
  setMotionPreference: (preference: string) => void = () => undefined,
  setBotIcon: (icon: string) => void = () => undefined,
  setDeveloperMode: (enabled: boolean) => void = () => undefined,
): string {
  return renderToStaticMarkup(
    createElement(BotSettingsSection, {
      t,
      renderSlot: () => null,
      useBotModePrefs: ((selector: (value: BotModePrefsSnapshot) => unknown) =>
        selector(prefs)) as never,
      setSortMode: setSortMode as never,
      setMotionPreference: setMotionPreference as never,
      setBotIcon: setBotIcon as never,
      setDeveloperMode: setDeveloperMode as never,
    } as never),
  );
}

function lastMenu(): Record<string, unknown> {
  const found = captured.menus.at(-1);
  if (found === undefined) throw new Error('menu not rendered');
  return found;
}

function menuWithItem(id: string): Record<string, unknown> {
  const found = captured.menus.find((menu) =>
    ((menu['items'] as readonly Record<string, unknown>[] | undefined) ?? []).some(
      (item) => item['id'] === id,
    ),
  );
  if (found === undefined) throw new Error(`menu with ${id} not rendered`);
  return found;
}

function motionMenu(): Record<string, unknown> {
  return menuWithItem('system');
}

function iconMenu(): Record<string, unknown> {
  return menuWithItem('mascot');
}

beforeEach(() => {
  captured.menus.length = 0;
  captured.switches.length = 0;
});

describe('BotHarness settings section', () => {
  it('renders the native developer switch and sends its next value', () => {
    const setDeveloperMode = vi.fn();
    const markup = renderSection(snapshot(), undefined, undefined, undefined, setDeveloperMode);
    expect(markup).toContain('开发者模式');
    expect(captured.switches[0]).toMatchObject({ checked: false, label: '开发者模式' });
    (captured.switches[0]?.['onChange'] as (enabled: boolean) => void)(true);
    expect(setDeveloperMode).toHaveBeenCalledWith(true);
  });

  it('renders the row copy and the selected mode from the shared store', () => {
    const markup = renderSection(snapshot({ sortMode: 'manual' }));

    expect(markup).toContain('Bot 列表排序');
    expect(markup).toContain('设置 Bot 模式列表的默认排序方式');
    expect(markup).toContain('手动排序');
    expect(markup).toContain('bh-settings-selector');
    expect(lastMenu()['selectedId']).toBe('manual');
    expect(
      (lastMenu()['items'] as readonly Record<string, unknown>[]).map((item) => item['id']),
    ).toEqual(['updated', 'manual']);
  });

  it('renders and writes the three-state motion preference with its effective preview', () => {
    const setMotionPreference = vi.fn();
    const markup = renderSection(
      snapshot({ motionPreference: 'system', effectiveMotion: 'reduce' }),
      () => undefined,
      setMotionPreference,
    );

    expect(markup).toContain('界面动效');
    expect(markup).toContain('跟随系统');
    expect(markup).toContain('当前已减少动效');
    expect(motionMenu()['selectedId']).toBe('system');
    expect(
      (motionMenu()['items'] as readonly Record<string, unknown>[]).map((item) => item['id']),
    ).toEqual(['system', 'reduce', 'full']);

    const onSelect = motionMenu()['onSelect'] as (id: string) => void;
    onSelect('full');
    expect(setMotionPreference).toHaveBeenCalledWith('full');

    setMotionPreference.mockClear();
    onSelect('unrelated');
    expect(setMotionPreference).not.toHaveBeenCalled();
  });

  it('writes through the shared policy when an option is picked', () => {
    const setSortMode = vi.fn();
    renderSection(snapshot(), setSortMode);

    const onSelect = lastMenu()['onSelect'] as (id: string) => void;
    onSelect('manual');
    expect(setSortMode).toHaveBeenCalledWith('manual');

    setSortMode.mockClear();
    onSelect('unrelated');
    expect(setSortMode).not.toHaveBeenCalled();
  });

  it('surfaces the memory-mode caveat instead of pretending persistence', () => {
    const markup = renderSection(snapshot({ status: 'unavailable', mode: 'memory' }));

    expect(markup).toContain('仅当前会话生效，不会保存');
    expect(markup).not.toContain('设置 Bot 模式列表的默认排序方式');
  });
  it('selects a mark when its card is activated', () => {
    const setBotIcon = vi.fn();
    const card = BotIconCard({
      option: 'simple',
      label: 'DeepSeekBot 简约',
      selected: false,
      onSelect: setBotIcon,
    });
    (card.props as { onClick: () => void }).onClick();
    expect(setBotIcon).toHaveBeenCalledWith('simple');
  });

  it('renders one card per Bot mark and writes the picked one', () => {
    const setBotIcon = vi.fn();
    const markup = renderSection(snapshot({ botIcon: 'blob' }), undefined, undefined, setBotIcon);
    expect(markup).toContain('Bot 图标');
    expect(markup).toContain('生成形象');
    expect(markup).toContain('bh-icon-grid');
    expect(markup).toContain('data-selected="true"');
    expect(markup.match(/bh-icon-card(?!-)/g)?.length).toBe(4);

    const cards = [...markup.matchAll(/<button[^>]*class="bh-icon-card"[^>]*>/g)].map((m) => m[0]);
    expect(cards).toHaveLength(4);
    expect(cards.filter((card) => card.includes('data-selected="true"'))).toHaveLength(1);
  });
});
