import { useRef, useState, type ReactElement } from 'react';

import {
  Button,
  IconCheckOutline16,
  IconEditOutline16,
  IconTrashOutline16,
  type MenuEntry,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage } from './bridge.js';
import { ungroupedLabel } from './labels.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';
import type { RosterSection } from './roster.js';

/** Narrow translate seat consumed by pure menu builders (the slot `t` seat is a superset). */
export type BotMenuTranslate = BotHarnessTranslate;

/** Caller class that paints the delete confirm's outline button in the error colour. */
export const DANGER_ACTION_CLASS = 'bh-danger-action';

/** The global message-list menu: sort modes plus roster management actions. */
export function globalSortMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { type: 'separator', id: 'roster-separator' },
    { id: 'hidden', label: t('hidden.manage') },
  ];
}

/** One section's menu: sort, positional actions, rename, then safe section removal. */
export function sectionMenuItems(
  t: BotMenuTranslate,
  options: { canMoveUp?: boolean; canMoveDown?: boolean } = {},
): readonly MenuEntry[] {
  const { canMoveUp = true, canMoveDown = true } = options;
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { id: 'inherit', label: t('sort.inherit') },
    { type: 'separator', id: 'section-separator' },
    { id: 'move-up', label: t('section.moveUp'), disabled: !canMoveUp },
    { id: 'move-down', label: t('section.moveDown'), disabled: !canMoveDown },
    { type: 'separator', id: 'section-action-separator' },
    { id: 'rename', label: t('section.rename'), icon: <IconEditOutline16 /> },
    { id: 'delete', label: t('section.delete'), icon: <IconTrashOutline16 />, danger: true },
  ];
}

/**
 * Menu id for the 未分组 move target. Section ids are host-generated UUIDs,
 * so this sentinel can never collide with one.
 */
export const UNGROUPED_MOVE_TARGET = 'ungrouped';

/** Menu id that opens section creation and moves this channel into it. */
export const NEW_SECTION_MOVE_TARGET = 'new-section';
/** Submenu label with the trailing check the current location carries. */
function checkedTargetLabel(text: string): ReactElement {
  return (
    <span className="bh-move-checked">
      <span className="bh-move-checked-text">{text}</span>
      <IconCheckOutline16 />
    </span>
  );
}

/**
 * A channel row's context menu: one `移动到` submenu listing every section
 * plus 未分组. The primitives' submenu rows have no selection slot of their
 * own, so the trailing check for the channel's current scope rides the label.
 * @param t - Locale seat for the menu heading.
 * @param sections - Sections in display order.
 * @param currentSectionId - Scope the channel lives in; `undefined` = 未分组.
 * @returns The single submenu-parent entry.
 */
export function channelMoveMenuItems(
  t: BotMenuTranslate,
  sections: readonly RosterSection[],
  currentSectionId: string | undefined,
): readonly MenuEntry[] {
  const target = (id: string, name: string, current: boolean): MenuItem => ({
    id,
    label: current ? checkedTargetLabel(name) : name,
  });
  return [
    {
      id: 'move',
      label: t('move.menu.label'),
      submenu: [
        target(NEW_SECTION_MOVE_TARGET, t('move.newSection'), false),
        ...sections.map((section) =>
          target(section.id, section.name, section.id === currentSectionId),
        ),
        target(UNGROUPED_MOVE_TARGET, ungroupedLabel(t), currentSectionId === undefined),
      ],
    },
  ];
}

/** Modal body input: autofocus/select, IME-safe Enter submit, blank-aware disabled state. */
function NameField({
  label,
  placeholder,
  value,
  disabled,
  onChange,
  onSubmit,
}: {
  label: string;
  placeholder: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}): ReactElement {
  const composing = useRef(false);
  return (
    <NameInput
      autoFocus
      aria-label={label}
      placeholder={placeholder}
      value={value}
      onFocus={(event) => {
        event.currentTarget.select();
      }}
      onChange={(event) => {
        onChange(event.currentTarget.value);
      }}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' || composing.current) return;
        event.preventDefault();
        if (!disabled) onSubmit();
      }}
    />
  );
}

export interface SectionRenameModalProps {
  section: RosterSection;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onRename: (name: string) => void;
}

/** Native Modal+input rename; Enter submits, Escape/mask/cancel close without a change. */
export function SectionRenameModal({
  section,
  t,
  onCancel,
  onRename,
}: SectionRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(section.name);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('common.close')}
      title={t('section.rename.title')}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={blank}
            onClick={() => {
              if (!blank) onRename(trimmed);
            }}
          >
            {t('common.rename')}
          </Button>
        </>
      }
    >
      <NameField
        label={t('section.name.label')}
        placeholder={t('section.name.placeholder')}
        value={draft}
        disabled={blank}
        onChange={setDraft}
        onSubmit={() => {
          if (!blank) onRename(trimmed);
        }}
      />
    </Modal>
  );
}

export interface ChannelRenameModalProps {
  name: string;
  bot: boolean;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onRename: (name: string) => void;
}

/** One rename surface for group Channels and PersonaBot-backed DM Channels. */
export function ChannelRenameModal({
  name,
  bot,
  t,
  onCancel,
  onRename,
}: ChannelRenameModalProps): ReactElement {
  const [draft, setDraft] = useState(name);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  const label = bot ? t('bot.name.label') : t('channel.name.label');
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('common.close')}
      title={bot ? t('bot.rename.title') : t('channel.rename.title')}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={blank}
            onClick={() => {
              if (!blank) onRename(trimmed);
            }}
          >
            {t('common.rename')}
          </Button>
        </>
      }
    >
      <NameField
        label={label}
        placeholder={label}
        value={draft}
        disabled={blank}
        onChange={setDraft}
        onSubmit={() => {
          if (!blank) onRename(trimmed);
        }}
      />
    </Modal>
  );
}

export interface SectionDeleteModalProps {
  section: RosterSection;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onDelete: () => void;
}

/** Native destructive confirm: outline button in the error colour, focus parked on cancel. */
export function SectionDeleteModal({
  section,
  t,
  onCancel,
  onDelete,
}: SectionDeleteModalProps): ReactElement {
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('common.close')}
      title={t('section.delete.title')}
      description={t('section.delete.description', { name: section.name })}
      footer={
        <>
          <Button variant="outline" autoFocus onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="outline" className={DANGER_ACTION_CLASS} onClick={onDelete}>
            {t('common.delete')}
          </Button>
        </>
      }
    />
  );
}

export interface CreateSectionModalProps {
  t: BotHarnessTranslate;
  onCancel: () => void;
  onCreate: (name: string) => void;
}

/** Native Modal+input creation for a Channel section. */
export function CreateSectionModal({
  t,
  onCancel,
  onCreate,
}: CreateSectionModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('common.close')}
      title={t('section.create.title')}
      description={t('section.create.description')}
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            disabled={blank}
            onClick={() => {
              if (!blank) onCreate(trimmed);
            }}
          >
            {t('common.create')}
          </Button>
        </>
      }
    >
      <NameField
        label={t('section.name.label')}
        placeholder={t('section.name.placeholder')}
        value={draft}
        disabled={blank}
        onChange={setDraft}
        onSubmit={() => {
          if (!blank) onCreate(trimmed);
        }}
      />
    </Modal>
  );
}

export interface CreateChannelModalProps {
  /** Section the new Channel is assigned to; absent creates an ungrouped Channel. */
  sectionName?: string | undefined;
  t: BotHarnessTranslate;
  onCancel: () => void;
  /** Resolve to close the dialog; reject to show the error in place. */
  onCreate: (name: string) => Promise<void>;
}

/** Native Modal+input creation for a Channel, optionally scoped to a section. */
export function CreateChannelModal({
  sectionName,
  t,
  onCancel,
  onCreate,
}: CreateChannelModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  const submit = (): void => {
    if (blank || creating) return;
    setCreating(true);
    setError(undefined);
    void onCreate(trimmed).then(
      () => {
        setCreating(false);
      },
      (cause: unknown) => {
        setError(errorMessage(cause));
        setCreating(false);
      },
    );
  };
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel={t('common.close')}
      title={
        sectionName === undefined
          ? t('channel.create.title')
          : t('channel.create.inSection', { name: sectionName })
      }
      description={t('channel.create.description')}
      footer={
        <>
          <Button variant="outline" disabled={creating} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={blank || creating} onClick={submit}>
            {t('common.create')}
          </Button>
        </>
      }
    >
      <NameField
        label={t('channel.name.label')}
        placeholder={t('channel.name.placeholder')}
        value={draft}
        disabled={blank || creating}
        onChange={setDraft}
        onSubmit={submit}
      />
      {error !== undefined ? (
        <div className="bh-modal-error" role="alert">
          {t('create.failed', { error })}
        </div>
      ) : null}
    </Modal>
  );
}
