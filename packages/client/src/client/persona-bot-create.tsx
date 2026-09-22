import { useId, useState, type ReactElement } from 'react';

import { Button, IconCloseOutline16, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';

export function normalizeRoleBadges(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function personaBotCreateError(
  error: unknown,
  t: BotHarnessTranslate = zhTranslate,
): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'duplicate':
        return t('bot.create.error.identity');
      case 'invalid-input':
        return t('bot.create.error.invalid');
      case 'unavailable':
        return t('bot.create.error.connection');
    }
  }
  return errorMessage(error);
}

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactElement;
}): ReactElement {
  return (
    <div className="bh-personabot-field">
      <label className="bh-personabot-label" htmlFor={id}>
        {label}
      </label>
      {children}
      {hint === undefined ? null : <span className="bh-personabot-hint">{hint}</span>}
    </div>
  );
}

export function CreatePersonaBotModal({
  actions,
  sectionId,
  sectionName,
  t = zhTranslate,
  onCancel,
  onCreated,
}: {
  actions: BridgeActions;
  sectionId?: string;
  sectionName?: string;
  t?: BotHarnessTranslate | undefined;
  onCancel: () => void;
  onCreated: () => void;
}): ReactElement {
  const displayNameId = useId();
  const roleId = useId();
  const descriptionId = useId();
  const [displayName, setDisplayName] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const invalid = displayName.trim().length === 0;

  const rolesWithDraft = (): string[] =>
    normalizeRoleBadges([...roles, ...roleDraft.split(/[,，]/u)]);

  const commitRoleDraft = (): void => {
    setRoles(rolesWithDraft());
    setRoleDraft('');
  };

  const submit = (): void => {
    if (invalid || creating) return;
    const submittedRoles = rolesWithDraft();
    const submittedDescription = description.trim();
    setRoles(submittedRoles);
    setRoleDraft('');
    setCreating(true);
    setError(undefined);
    void actions
      .createBot(
        {
          displayName: displayName.trim(),
          roles: submittedRoles,
          ...(submittedDescription.length === 0 ? {} : { description: submittedDescription }),
        },
        sectionId,
      )
      .then(
        () => {
          setCreating(false);
          onCreated();
        },
        (cause: unknown) => {
          setError(personaBotCreateError(cause));
          setCreating(false);
        },
      );
  };

  return (
    <Modal
      open
      onClose={() => {
        if (!creating) onCancel();
      }}
      closeLabel={t('common.close')}
      title={
        sectionName === undefined
          ? t('bot.create.title')
          : t('bot.create.inSection', { name: sectionName })
      }
      description={t('bot.create.description')}
      footer={
        <>
          <Button variant="outline" disabled={creating} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={invalid || creating} onClick={submit}>
            {creating ? t('bot.create.creating') : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="bh-personabot-form">
        <Field id={displayNameId} label={t('bot.create.name.label')}>
          <NameInput
            id={displayNameId}
            autoFocus
            value={displayName}
            disabled={creating}
            placeholder={t('bot.create.name.placeholder')}
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </Field>
        <Field id={roleId} label={t('bot.create.roles.label')} hint={t('bot.create.roles.hint')}>
          <div className="bh-role-editor">
            {roles.length === 0 ? null : (
              <div className="bh-role-editor-badges" aria-label={t('bot.create.roles.list')}>
                {roles.map((role) => (
                  <span className="bh-role-edit-badge" key={role}>
                    <Tag tone="neutral">{role}</Tag>
                    <button
                      type="button"
                      aria-label={t('bot.create.roles.remove', { role })}
                      disabled={creating}
                      onClick={() => setRoles((current) => current.filter((item) => item !== role))}
                    >
                      <IconCloseOutline16 size={12} />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <NameInput
              id={roleId}
              value={roleDraft}
              disabled={creating}
              placeholder={t('bot.create.roles.placeholder')}
              onBlur={commitRoleDraft}
              onChange={(event) => setRoleDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
                  event.preventDefault();
                  commitRoleDraft();
                } else if (event.key === 'Backspace' && roleDraft.length === 0) {
                  setRoles((current) => current.slice(0, -1));
                }
              }}
            />
          </div>
        </Field>
        <Field
          id={descriptionId}
          label={t('bot.create.about.label')}
          hint={t('bot.create.about.hint')}
        >
          <NameInput
            id={descriptionId}
            value={description}
            disabled={creating}
            placeholder={t('bot.create.about.placeholder')}
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </Field>
        {error === undefined ? null : (
          <div className="bh-modal-error" role="alert">
            {t('create.failed', { error })}
          </div>
        )}
      </div>
    </Modal>
  );
}
