import { useRef, useState, type ReactElement } from 'react';

import {
  Button,
  IconEditOutline16,
  IconTrashOutline16,
  type MenuEntry,
} from '@deepseek-ai/dsh-client-ui-primitives';

import { errorMessage } from './bridge.js';
import type { BotHarnessKey } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';
import type { ChannelSectionConfig } from './roster-config.js';

/** Narrow translate seat consumed by pure menu builders (the slot `t` seat is a superset). */
export type BotMenuTranslate = (key: BotHarnessKey) => string;

/** Caller class that paints the delete confirm's outline button in the error colour. */
export const DANGER_ACTION_CLASS = 'bh-danger-action';

/** The global default menu of the message-list header: heading plus the two concrete modes. */
export function globalSortMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
  ];
}

/** One section's menu, in native order: sort heading/modes, then rename, then danger delete. */
export function sectionMenuItems(t: BotMenuTranslate): readonly MenuEntry[] {
  return [
    { type: 'label', id: 'sort-label', text: t('sort.menu.label') },
    { id: 'updated', label: t('sort.updated') },
    { id: 'manual', label: t('sort.manual') },
    { id: 'inherit', label: t('sort.inherit') },
    { type: 'separator', id: 'section-separator' },
    { id: 'rename', label: t('section.rename'), icon: <IconEditOutline16 /> },
    { id: 'delete', label: t('section.delete'), icon: <IconTrashOutline16 />, danger: true },
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
  section: ChannelSectionConfig;
  onCancel: () => void;
  onRename: (name: string) => void;
}

/** Native Modal+input rename; Enter submits, Escape/mask/cancel close without a change. */
export function SectionRenameModal({
  section,
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
      closeLabel="关闭"
      title="重命名频道分组"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={blank}
            onClick={() => {
              if (!blank) onRename(trimmed);
            }}
          >
            重命名
          </Button>
        </>
      }
    >
      <NameField
        label="分组名称"
        placeholder="分组名称"
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
  section: ChannelSectionConfig;
  onCancel: () => void;
  onDelete: () => void;
}

/** Native destructive confirm: outline button in the error colour, focus parked on cancel. */
export function SectionDeleteModal({
  section,
  onCancel,
  onDelete,
}: SectionDeleteModalProps): ReactElement {
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel="关闭"
      title="删除频道分组"
      description={`将把“${section.name}”从名册中移除。其中的频道会回到未分组，不会被删除。`}
      footer={
        <>
          <Button variant="outline" autoFocus onClick={onCancel}>
            取消
          </Button>
          <Button variant="outline" className={DANGER_ACTION_CLASS} onClick={onDelete}>
            删除
          </Button>
        </>
      }
    />
  );
}

export interface CreateSectionModalProps {
  onCancel: () => void;
  onCreate: (name: string) => void;
}

/** Native Modal+input creation for a Channel section. */
export function CreateSectionModal({ onCancel, onCreate }: CreateSectionModalProps): ReactElement {
  const [draft, setDraft] = useState('');
  const trimmed = draft.trim();
  const blank = trimmed.length === 0;
  return (
    <Modal
      open
      onClose={onCancel}
      closeLabel="关闭"
      title="创建频道分组"
      description="新频道分组只影响本机名册的分组显示。"
      footer={
        <>
          <Button variant="outline" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            disabled={blank}
            onClick={() => {
              if (!blank) onCreate(trimmed);
            }}
          >
            创建
          </Button>
        </>
      }
    >
      <NameField
        label="分组名称"
        placeholder="分组名称"
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
  onCancel: () => void;
  /** Resolve to close the dialog; reject to show the error in place. */
  onCreate: (name: string) => Promise<void>;
}

/** Native Modal+input creation for a Channel, optionally scoped to a section. */
export function CreateChannelModal({
  sectionName,
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
      closeLabel="关闭"
      title={sectionName === undefined ? '创建频道' : `在「${sectionName}」中创建频道`}
      description="先建一个本地频道；BOT 参与和消息投递随 v1.1 到来。"
      footer={
        <>
          <Button variant="outline" disabled={creating} onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" disabled={blank || creating} onClick={submit}>
            创建
          </Button>
        </>
      }
    >
      <NameField
        label="频道名称"
        placeholder="频道名称"
        value={draft}
        disabled={blank || creating}
        onChange={setDraft}
        onSubmit={submit}
      />
      {error !== undefined ? (
        <div className="bh-modal-error" role="alert">
          创建失败：{error}
        </div>
      ) : null}
    </Modal>
  );
}
