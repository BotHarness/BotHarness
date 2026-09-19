import { useState, type ReactElement } from 'react';

import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import { isBotModeSortMode, type BotModeSortMode } from '../bot-mode-settings.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import type { BotHarnessKey } from './locale.js';

/** Full Settings-row props. */
export type BotModeRowProps = PropsRuntime<'settings.general.item'> &
  PropsLocale<'botharness'> &
  InjectFace<BotModePrefsFace>;

const OPTIONS: readonly { id: BotModeSortMode; label: BotHarnessKey }[] = [
  { id: 'updated', label: 'sort.updated' },
  { id: 'manual', label: 'sort.manual' },
];

/**
 * Render the global BOT-mode list sort preference.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function BotModeRow({ t, useBotModePrefs, setSortMode }: BotModeRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const [open, setOpen] = useState(false);
  const selectedLabel: BotHarnessKey = prefs.sortMode === 'manual' ? 'sort.manual' : 'sort.updated';
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <div className="bh-sort-row">
      <div className="bh-sort-row-text">
        <div className="bh-sort-row-title">{t('sort.row.title')}</div>
        <div className="bh-sort-row-desc">
          {t(memoryOnly ? 'sort.row.memory' : 'sort.row.description')}
        </div>
      </div>
      <Menu
        open={open}
        portal
        align="end"
        items={OPTIONS.map((option) => ({ id: option.id, label: t(option.label) }))}
        selectedId={prefs.sortMode}
        onSelect={(id) => {
          setOpen(false);
          if (isBotModeSortMode(id)) setSortMode(id);
        }}
        onClose={() => {
          setOpen(false);
        }}
        anchor={
          <button
            type="button"
            className="bh-sort-selector"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => {
              setOpen((value) => !value);
            }}
          >
            {t(selectedLabel)}
            <IconChevronDownOutline14 className="bh-sort-chevron" />
          </button>
        }
      />
    </div>
  );
}
