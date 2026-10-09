import { useRef, useState, type ReactElement } from 'react';

import {
  Button,
  IconCheckOutlineRegular,
  IconEditOutlineRegular,
  IconTrashOutlineRegular,
  type MenuEntry,
  type MenuItem,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage } from './bridge.js';
import { ungroupedLabel } from './labels.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';
import type { RosterSection } from './roster.js';

export type BotMenuTranslate = BotHarnessTranslate;

export const DANGER_ACTION_CLASS = 'bh-danger-action';

export function globalSortMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { type: 'separator', id: 'roster-separator' },
    { id: 'hidden', label: t('hidden.manage') },
    { id: 'channel-history', label: t('purge.history') },
  ];
}

export function pinnedSortMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'pinned-sort-label', text: t('pin.sort') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { id: 'inherit', label: t('sort.inherit') },
  ];
}

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
    { id: 'rename', label: t('section.rename'), icon: <IconEditOutlineRegular /> },
    { id: 'delete', label: t('section.delete'), icon: <IconTrashOutlineRegular />, danger: true },
  ];
}

export const UNGROUPED_MOVE_TARGET = 'ungrouped';

export const NEW_SECTION_MOVE_TARGET = 'new-section';
function checkedTargetLabel(text: string): ReactElement {
  return (
    <span className="bh-move-checked">
      <span className="bh-move-checked-text">{text}</span>
      <IconCheckOutlineRegular />
    </span>
  );
}

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
  sectionName?: string | undefined;
  t: BotHarnessTranslate;
  onCancel: () => void;
  onCreate: (name: string) => Promise<void>;
}

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
