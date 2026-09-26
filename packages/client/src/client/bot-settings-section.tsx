import { useState, type ReactElement, type ReactNode } from 'react';

import { IconChevronDownOutlineRegular, Menu, Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {
  InjectFace,
  PropsLocale,
  PropsRenderSlots,
  PropsRuntime,
} from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import {
  isBotModeIcon,
  isBotModeMotionPreference,
  isBotModeSortMode,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSortMode,
} from '../bot-mode-settings.js';
import { BotIcon } from './bot-icon.js';
import type { BotModePrefsFace } from './bot-mode-prefs.js';
import type { BotHarnessKey } from './locale.js';

/** Full Settings-section props. */
export type BotSettingsSectionProps = PropsRuntime<'settings.section'> &
  PropsRenderSlots<'botharness.settings.item'> &
  PropsLocale<'botharness'> &
  InjectFace<BotModePrefsFace>;

const SORT_OPTIONS: readonly { id: BotModeSortMode; label: BotHarnessKey }[] = [
  { id: 'updated', label: 'sort.updated' },
  { id: 'manual', label: 'sort.manual' },
];

const ICON_OPTIONS: readonly { id: BotModeIcon; label: BotHarnessKey }[] = [
  { id: 'mascot', label: 'icon.mascot' },
  { id: 'simple', label: 'icon.simple' },
  { id: 'blob', label: 'icon.blob' },
  { id: 'bot', label: 'icon.bot' },
];

const MOTION_OPTIONS: readonly { id: BotModeMotionPreference; label: BotHarnessKey }[] = [
  { id: 'system', label: 'motion.system' },
  { id: 'reduce', label: 'motion.reduce' },
  { id: 'full', label: 'motion.full' },
];

/**
 * One Bot mark card: the whole card selects the mark, and the selected card is
 * outlined. Hook-free on purpose, so tests can invoke its `onClick` directly
 * without a DOM.
 */
export function BotIconCard({
  option,
  label,
  selected,
  onSelect,
}: {
  readonly option: BotModeIcon;
  readonly label: string;
  readonly selected: boolean;
  readonly onSelect: (icon: BotModeIcon) => void;
}): ReactElement {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="bh-icon-card"
      data-selected={selected ? 'true' : undefined}
      onClick={() => {
        onSelect(option);
      }}
    >
      <BotIcon icon={option} size={40} className="bh-icon-card-art" />
      <span className="bh-icon-card-label">{label}</span>
    </button>
  );
}

/**
 * The BotHarness settings page: the shared motion and BOT-mode sorting
 * preferences, rendered as their own section instead of inside the native
 * General page.
 * @param props - composed Settings section props.
 * @returns the BotHarness settings page.
 */
export function BotSettingsSection({
  t,
  renderSlot,
  useBotModePrefs,
  setMotionPreference,
  setSortMode,
  setBotIcon,
  setDeveloperMode,
  setStartInBotMode,
}: BotSettingsSectionProps): ReactElement {
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
      <div className="bh-settings-row bh-icon-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('icon.row.title')}</div>
          <div className="bh-settings-row-desc">{t('icon.row.description')}</div>
        </div>
      </div>
      <div className="bh-icon-grid" role="radiogroup" aria-label={t('icon.row.title')}>
        {ICON_OPTIONS.map((option) => (
          <BotIconCard
            key={option.id}
            option={option.id}
            label={t(option.label)}
            selected={prefs.botIcon === option.id}
            onSelect={setBotIcon}
          />
        ))}
      </div>
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
              <IconChevronDownOutlineRegular className="bh-settings-chevron" />
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
              <IconChevronDownOutlineRegular className="bh-settings-chevron" />
            </button>
          }
        />
      </div>
      <div className="bh-settings-row bh-developer-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('developer.row.title')}</div>
          <div className="bh-settings-row-desc">{t('developer.row.description')}</div>
        </div>
        <Switch
          checked={prefs.developerMode}
          onChange={setDeveloperMode}
          label={t('developer.row.title')}
        />
      </div>
      <div className="bh-settings-row bh-startup-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-title">{t('startup.row.title')}</div>
          <div className="bh-settings-row-desc">{t('startup.row.description')}</div>
        </div>
        <Switch
          checked={prefs.startInBotMode}
          onChange={setStartInBotMode}
          label={t('startup.row.title')}
        />
      </div>
      {/* The slot contract types its ReactNode against the DSH client's React
          types, which can differ from this package's pinned @types/react; the
          cast keeps the boundary from failing on a duplicated ReactNode. */}
      {renderSlot('botharness.settings.item', {}) as unknown as ReactNode}
    </div>
  );
}
