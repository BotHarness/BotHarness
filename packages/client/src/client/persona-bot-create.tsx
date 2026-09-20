import { useId, useState, type ReactElement } from 'react';

import { Button, IconCloseOutline16, Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';

export function normalizeRoleBadges(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

export function personaBotCreateError(error: unknown): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'duplicate':
        return '系统未能分配唯一身份，请重试。';
      case 'invalid-input':
        return '请检查 BOT 名称、岗位或简介。';
      case 'unavailable':
        return '无法连接 Host，请稍后重试。';
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
  onCancel,
  onCreated,
}: {
  actions: BridgeActions;
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
      .createBot({
        displayName: displayName.trim(),
        roles: submittedRoles,
        ...(submittedDescription.length === 0 ? {} : { description: submittedDescription }),
      })
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
      closeLabel="关闭"
      title="创建 PersonaBot"
      description="名称用于列表和 @；内部身份由系统生成。岗位和简介均可留空。"
      footer={
        <>
          <Button variant="outline" disabled={creating} onClick={onCancel}>
            取消
          </Button>
          <Button variant="primary" disabled={invalid || creating} onClick={submit}>
            {creating ? '创建中' : '创建'}
          </Button>
        </>
      }
    >
      <div className="bh-personabot-form">
        <Field id={displayNameId} label="名称">
          <NameInput
            id={displayNameId}
            autoFocus
            value={displayName}
            disabled={creating}
            placeholder="例如：小研"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </Field>
        <Field
          id={roleId}
          label="岗位 / 职位（可选）"
          hint="输入后按 Enter 或逗号添加；可添加多个徽章。"
        >
          <div className="bh-role-editor">
            {roles.length === 0 ? null : (
              <div className="bh-role-editor-badges" aria-label="已添加的岗位">
                {roles.map((role) => (
                  <span className="bh-role-edit-badge" key={role}>
                    <Tag tone="neutral">{role}</Tag>
                    <button
                      type="button"
                      aria-label={`移除岗位 ${role}`}
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
              placeholder="例如：研究员"
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
          label="简介（可选）"
          hint="简短介绍这个 BOT 的信息、擅长领域或主要职责。"
        >
          <NameInput
            id={descriptionId}
            value={description}
            disabled={creating}
            placeholder="例如：负责代码审查与质量把关"
            onChange={(event) => setDescription(event.currentTarget.value)}
          />
        </Field>
        {error === undefined ? null : (
          <div className="bh-modal-error" role="alert">
            创建失败：{error}
          </div>
        )}
      </div>
    </Modal>
  );
}
