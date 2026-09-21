import { useState, type ReactElement } from 'react';

import { IconChevronDownOutline14, Menu } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import {
  isBotModeMotionPreference,
  isBotModeSortMode,
  type BotModeMotionPreference,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import type { BotHarnessKey } from './locale.js';

/** Full Settings-row props. */
export type BotModeRowProps = PropsRuntime<'settings.general.item'> &
  PropsLocale<'botharness'> &
  InjectFace<BotModePrefsFace>;

const SORT_OPTIONS: readonly { id: BotModeSortMode; label: BotHarnessKey }[] = [
  { id: 'updated', label: 'sort.updated' },
  { id: 'manual', label: 'sort.manual' },
];

const MOTION_OPTIONS: readonly { id: BotModeMotionPreference; label: BotHarnessKey }[] = [
  { id: 'system', label: 'motion.system' },
  { id: 'reduce', label: 'motion.reduce' },
  { id: 'full', label: 'motion.full' },
];

/**
 * Render the shared BotHarness motion and BOT-mode sorting preferences.
 * @param props - composed Settings slot props.
 * @returns the preference row.
 */
export function BotModeRow({
  t,
  useBotModePrefs,
  setMotionPreference,
  setSortMode,
}: BotModeRowProps): ReactElement {
  const prefs = useBotModePrefs((value) => value);
  const [motionOpen, setMotionOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);
  const sortLabel: BotHarnessKey = prefs.sortMode === 'manual' ? 'sort.manual' : 'sort.updated';
  const motionLabel: BotHarnessKey =
    prefs.motionPreference === 'reduce'
      ? 'motion.reduce'
      : prefs.motionPreference === 'full'
        ? 'motion.full'
        : 'motion.system';
  const effectiveLabel: BotHarnessKey =
    prefs.effectiveMotion === 'reduce' ? 'motion.preview.reduce' : 'motion.preview.full';
  const memoryOnly = prefs.status === 'unavailable' && prefs.mode === 'memory';
  return (
    <div className="bh-settings-rows">
      <div className="bh-settings-row bh-motion-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('motion.row.title')}</div>
          <div className="bh-settings-row-desc">
            {t(memoryOnly ? 'motion.row.memory' : 'motion.row.description')}
          </div>
          <div className="bh-motion-preview" role="status" aria-live="polite">
            <span className="bh-motion-preview-sample" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span>
              {t('motion.preview.label')} · {t(effectiveLabel)}
            </span>
          </div>
        </div>
        <Menu
          open={motionOpen}
          portal
          align="end"
          items={MOTION_OPTIONS.map((option) => ({ id: option.id, label: t(option.label) }))}
          selectedId={prefs.motionPreference}
          onSelect={(id) => {
            setMotionOpen(false);
            if (isBotModeMotionPreference(id)) setMotionPreference(id);
          }}
          onClose={() => {
            setMotionOpen(false);
          }}
          anchor={
            <button
              type="button"
              className="bh-settings-selector"
              aria-label={t('motion.menu.label')}
              aria-haspopup="menu"
              aria-expanded={motionOpen}
              onClick={() => {
                setMotionOpen((value) => !value);
              }}
            >
              {t(motionLabel)}
              <IconChevronDownOutline14 className="bh-settings-chevron" />
            </button>
          }
        />
      </div>
      <div className="bh-settings-row bh-sort-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('sort.row.title')}</div>
          <div className="bh-settings-row-desc">
            {t(memoryOnly ? 'sort.row.memory' : 'sort.row.description')}
          </div>
        </div>
        <Menu
          open={sortOpen}
          portal
          align="end"
          items={SORT_OPTIONS.map((option) => ({ id: option.id, label: t(option.label) }))}
          selectedId={prefs.sortMode}
          onSelect={(id) => {
            setSortOpen(false);
            if (isBotModeSortMode(id)) setSortMode(id);
          }}
          onClose={() => {
            setSortOpen(false);
          }}
          anchor={
            <button
              type="button"
              className="bh-settings-selector"
              aria-label={t('sort.menu.label')}
              aria-haspopup="menu"
              aria-expanded={sortOpen}
              onClick={() => {
                setSortOpen((value) => !value);
              }}
            >
              {t(sortLabel)}
              <IconChevronDownOutline14 className="bh-settings-chevron" />
            </button>
          }
        />
      </div>
    </div>
  );
}
