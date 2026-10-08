import { useId, useState, type ReactElement } from 'react';

import {
  Button,
  IconCloseOutlineRegular,
  SegmentedControl,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage, type CreatedBot } from './bridge.js';
import { zhTranslate, type BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';
import { PersonaBotAvatar } from './avatar.js';

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
      case 'git-not-found':
        return t('bot.create.error.gitMissing');
      case 'invalid-git-url':
        return t('bot.create.error.gitUrl');
      case 'git-clone-failed':
        return t('bot.create.error.clone');
      case 'git-clone-timeout':
        return t('bot.create.error.cloneTimeout');
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
  source = 'empty',
  sectionId,
  sectionName,
  t = zhTranslate,
  onCancel,
  onCreated,
}: {
  actions: BridgeActions;
  source?: 'empty' | 'git';
  sectionId?: string;
  sectionName?: string;
  t?: BotHarnessTranslate | undefined;
  onCancel: () => void;
  onCreated: () => void;
}): ReactElement {
  const displayNameId = useId();
  const gitUrlId = useId();
  const roleId = useId();
  const descriptionId = useId();
  const personaId = useId();
  const personaPresetId = useId();
  const [displayName, setDisplayName] = useState('');
  const [personaPreset, setPersonaPreset] = useState<'blank' | 'colleague' | 'roleplay'>('blank');
  const [personaDrafts, setPersonaDrafts] = useState(() => ({
    blank: '',
    colleague: t('bot.create.persona.colleague.seed'),
    roleplay: t('bot.create.persona.roleplay.seed'),
  }));
  const [gitUrl, setGitUrl] = useState('');
  const [roleDraft, setRoleDraft] = useState('');
  const [description, setDescription] = useState('');
  const [roles, setRoles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [cause, setCause] = useState<unknown | undefined>(undefined);
  const [fallback, setFallback] = useState<CreatedBot | undefined>(undefined);
  const invalid =
    displayName.trim().length === 0 || (source === 'git' && gitUrl.trim().length === 0);

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
    setCause(undefined);
    void actions
      .createBot(
        {
          displayName: displayName.trim(),
          ...(source === 'git'
            ? { gitUrl: gitUrl.trim() }
            : { persona: personaDrafts[personaPreset] }),
          roles: submittedRoles,
          ...(submittedDescription.length === 0 ? {} : { description: submittedDescription }),
        },
        sectionId,
      )
      .then(
        (created) => {
          setCreating(false);
          if (created.httpsFallback === undefined) onCreated();
          else setFallback(created);
        },
        (rejection: unknown) => {
          setCause(rejection);
          setCreating(false);
        },
      );
  };

  if (fallback?.httpsFallback !== undefined) {
    const { from, to, reason, detail } = fallback.httpsFallback;
    const done = (): void => {
      void actions.openCreatedBot(fallback, sectionId).finally(onCreated);
    };
    return (
      <Modal
        open
        onClose={done}
        closeLabel={t('common.close')}
        title={t('bot.create.httpsFallback.title')}
        footer={
          <Button variant="primary" onClick={done} data-https-fallback-done>
            {t('bot.create.httpsFallback.done')}
          </Button>
        }
      >
        <div className="bh-personabot-form" data-https-fallback>
          <span>{t('bot.create.httpsFallback.body')}</span>
          <pre className="bh-https-fallback-code">
            <code>{from}</code>
          </pre>
          <span className="bh-https-fallback-caption" data-https-fallback-reason={reason}>
            {t(`bot.create.httpsFallback.reason.${reason}`)}
            {detail === undefined ? null : (
              <span className="bh-https-fallback-detail">
                {t('bot.create.httpsFallback.detail', { detail })}
              </span>
            )}
          </span>
          <span>{t('bot.create.httpsFallback.now')}</span>
          <pre className="bh-https-fallback-code">
            <code>{to}</code>
          </pre>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open
      onClose={() => {
        if (!creating) onCancel();
      }}
      closeLabel={t('common.close')}
      title={
        sectionName === undefined
          ? t(source === 'git' ? 'bot.create.gitTitle' : 'bot.create.title')
          : t(source === 'git' ? 'bot.create.gitInSection' : 'bot.create.inSection', {
              name: sectionName,
            })
      }
      description={t('bot.create.description')}
      footer={
        <>
          <Button variant="outline" disabled={creating} onClick={onCancel}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" disabled={invalid || creating} onClick={submit}>
            {creating
              ? t(source === 'git' ? 'bot.create.importing' : 'bot.create.creating')
              : t('common.create')}
          </Button>
        </>
      }
    >
      <div className="bh-personabot-form">
        {source === 'git' ? (
          <Field
            id={gitUrlId}
            label={t('bot.create.gitUrl.label')}
            hint={t('bot.create.gitUrl.hint')}
          >
            <NameInput
              id={gitUrlId}
              type="text"
              autoCapitalize="none"
              autoComplete="off"
              spellCheck={false}
              value={gitUrl}
              disabled={creating}
              placeholder={t('bot.create.gitUrl.placeholder')}
              onChange={(event) => setGitUrl(event.currentTarget.value)}
            />
          </Field>
        ) : null}
        <Field id={displayNameId} label={t('bot.create.name.label')}>
          <div className="bh-personabot-name-row">
            <span data-create-avatar-preview>
              <PersonaBotAvatar
                personaBotId=""
                name={displayName.trim() || t('bot.create.name.placeholder')}
                size={44}
                indicator={false}
                t={t}
              />
            </span>
            <NameInput
              id={displayNameId}
              autoFocus
              value={displayName}
              disabled={creating}
              placeholder={t('bot.create.name.placeholder')}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </div>
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
                      <IconCloseOutlineRegular size={12} />
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
        {source === 'empty' ? (
          <>
            <SegmentedControl
              id={personaPresetId}
              label={t('bot.create.persona.preset')}
              value={personaPreset}
              options={[
                { value: 'blank', label: t('bot.create.persona.blank') },
                { value: 'colleague', label: t('bot.create.persona.colleague') },
                { value: 'roleplay', label: t('bot.create.persona.roleplay') },
              ]}
              disabled={creating}
              onChange={setPersonaPreset}
            />
            <Field
              id={personaId}
              label={t('bot.create.persona.label')}
              hint={t('bot.create.persona.hint')}
            >
              <textarea
                id={personaId}
                className="bh-name-input bh-personabot-persona"
                rows={6}
                value={personaDrafts[personaPreset]}
                disabled={creating}
                placeholder={t('bot.create.persona.placeholder')}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setPersonaDrafts((current) => ({ ...current, [personaPreset]: value }));
                }}
              />
            </Field>
          </>
        ) : null}
        {cause === undefined ? null : (
          <div className="bh-modal-error" role="alert">
            {t('create.failed', { error: personaBotCreateError(cause, t) })}
          </div>
        )}
      </div>
    </Modal>
  );
}
