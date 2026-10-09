import { useState, useSyncExternalStore, type ReactElement, type ReactNode } from 'react';

import {
  IconChevronDownOutlineRegular,
  IconCloseOutlineRegular,
  Menu,
} from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsRenderSlots } from '@deepseek-ai/dsh-client-ui-slots';

import type {} from './bot-settings-slot.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';

export const BOT_SETTINGS_SECTIONS = {
  general: 'general',
  models: 'models',
  messaging: 'messaging',
  imApps: 'im-apps',
  companions: 'companions',
  dataPrivacy: 'data-privacy',
  advanced: 'advanced',
  about: 'about',
} as const;

export const BOT_SETTINGS_DEFAULT_SECTION = BOT_SETTINGS_SECTIONS.general;

const SECTION_SLOT = 'botharness.settings.section';

export interface BotSettingsSectionRow {
  readonly id: string;
  readonly order: number;
  readonly label: string;
}

export interface BotSettingsSnapshot {
  readonly open: boolean;
  readonly sectionId: string | undefined;
}

export interface BotSettingsSectionSource {
  getSnapshot(): readonly BotSettingsSectionRow[];
  subscribe(listener: () => void): () => void;
}

export class BotSettings {
  #snapshot: BotSettingsSnapshot = { open: false, sectionId: undefined };
  readonly #listeners = new Set<() => void>();

  readonly getSnapshot = (): BotSettingsSnapshot => this.#snapshot;

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  };

  readonly open = (sectionId?: string): void => {
    this.#set({ open: true, sectionId: sectionId ?? this.#snapshot.sectionId });
  };

  readonly select = (sectionId: string): void => {
    this.#set({ ...this.#snapshot, sectionId });
  };

  readonly close = (): void => {
    this.#set({ ...this.#snapshot, open: false });
  };

  #set(next: BotSettingsSnapshot): void {
    if (next.open === this.#snapshot.open && next.sectionId === this.#snapshot.sectionId) return;
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }
}

export type BotSettingsViewProps = PropsRenderSlots<'botharness.settings.section'> & {
  botSettings: BotSettings;
  sections: BotSettingsSectionSource;
  t: BotHarnessTranslate;
};

const NARROW_FRAME_QUERY = '(max-width: 648px)';

function narrowFrameQuery(): MediaQueryList | undefined {
  return typeof matchMedia === 'function' ? matchMedia(NARROW_FRAME_QUERY) : undefined;
}

function subscribeNarrowFrame(listener: () => void): () => void {
  const query = narrowFrameQuery();
  query?.addEventListener('change', listener);
  return () => {
    query?.removeEventListener('change', listener);
  };
}

function isNarrowFrame(): boolean {
  return narrowFrameQuery()?.matches ?? false;
}

export function BotSettingsView({
  botSettings,
  sections,
  renderSlot,
  t,
}: BotSettingsViewProps): ReactElement | null {
  const state = useSyncExternalStore(botSettings.subscribe, botSettings.getSnapshot);
  const registered = useSyncExternalStore(sections.subscribe, sections.getSnapshot);
  const narrow = useSyncExternalStore(subscribeNarrowFrame, isNarrowFrame, () => false);
  const [pickerOpen, setPickerOpen] = useState(false);
  if (!state.open) return null;
  const rows = [...registered].sort((a, b) => a.order - b.order);
  const active =
    rows.find((row) => row.id === state.sectionId) ??
    rows.find((row) => row.id === BOT_SETTINGS_DEFAULT_SECTION) ??
    rows[0];
  const close = (): void => {
    setPickerOpen(false);
    botSettings.close();
  };
  return (
    <Modal open headless onClose={close} title={t('settings.nav')} className="bh-bot-settings">
      {narrow ? null : (
        <nav className="bh-bot-settings-nav" aria-label={t('botSettings.nav')}>
          <div className="bh-bot-settings-nav-title">{t('settings.nav')}</div>
          <div className="bh-bot-settings-nav-list">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                className="bh-bot-settings-nav-cell"
                aria-current={row.id === active?.id ? 'page' : undefined}
                data-modal-autofocus={row.id === active?.id ? '' : undefined}
                onClick={() => {
                  botSettings.select(row.id);
                }}
              >
                <span className="bh-bot-settings-nav-label">{row.label}</span>
              </button>
            ))}
          </div>
        </nav>
      )}
      <div className="bh-bot-settings-content" data-narrow={narrow ? '' : undefined}>
        <div className="bh-bot-settings-header">
          {narrow ? (
            <Menu
              open={pickerOpen}
              portal
              align="start"
              items={rows.map((row) => ({ id: row.id, label: row.label }))}
              selectedId={active?.id}
              onSelect={(id) => {
                setPickerOpen(false);
                botSettings.select(id);
              }}
              onClose={() => {
                setPickerOpen(false);
              }}
              anchor={
                <button
                  type="button"
                  className="bh-settings-selector bh-bot-settings-picker"
                  aria-label={t('botSettings.picker', { section: active?.label ?? '' })}
                  aria-haspopup="menu"
                  aria-expanded={pickerOpen}
                  data-modal-autofocus=""
                  onClick={() => {
                    setPickerOpen((value) => !value);
                  }}
                >
                  {active?.label}
                  <IconChevronDownOutlineRegular className="bh-settings-chevron" />
                </button>
              }
            />
          ) : (
            <h2 className="bh-bot-settings-title">{active?.label}</h2>
          )}
          <button
            type="button"
            className="bh-bot-settings-close"
            aria-label={t('common.close')}
            onClick={close}
          >
            <IconCloseOutlineRegular size={14} />
          </button>
        </div>
        <div className="bh-bot-settings-options">
          {active === undefined
            ? null
            : (renderSlot(SECTION_SLOT, { close }, { only: active.id }) as unknown as ReactNode)}
        </div>
      </div>
    </Modal>
  );
}

interface SectionLedger {
  slots: {
    entries(key: string): readonly {
      options: { id?: string; order?: number; label?: string | (() => string) };
    }[];
    getVersion(key: string): number;
    subscribe(key: string, listener: () => void): () => void;
  };
  locale: {
    getSnapshot(): { revision: number };
    subscribe(listener: () => void): () => void;
  };
}

export function botSettingsSectionSource(ctx: SectionLedger): BotSettingsSectionSource {
  let version = -1;
  let revision = -1;
  let rows: readonly BotSettingsSectionRow[] = [];
  return {
    getSnapshot: () => {
      const nextVersion = ctx.slots.getVersion(SECTION_SLOT);
      const nextRevision = ctx.locale.getSnapshot().revision;
      if (nextVersion !== version || nextRevision !== revision) {
        version = nextVersion;
        revision = nextRevision;
        rows = ctx.slots.entries(SECTION_SLOT).map(({ options }) => ({
          id: options.id ?? '',
          order: options.order ?? 0,
          label: typeof options.label === 'function' ? options.label() : (options.label ?? ''),
        }));
      }
      return rows;
    },
    subscribe: (listener) => {
      const offLedger = ctx.slots.subscribe(SECTION_SLOT, listener);
      const offLocale = ctx.locale.subscribe(listener);
      return () => {
        offLedger();
        offLocale();
      };
    },
  };
}
