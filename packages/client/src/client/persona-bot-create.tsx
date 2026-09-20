import { useId, useState, type ReactElement } from 'react';

import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { BridgeCallError, errorMessage } from './bridge.js';
import { Modal } from './modal.js';
import { NameInput } from './name-input.js';

export function personaBotCreateError(error: unknown): string {
  if (error instanceof BridgeCallError) {
    switch (error.code) {
      case 'invalid-slug':
        return '标识只能包含小写英文字母、数字和单个连字符，最长 64 个字符。';
      case 'duplicate':
        return '这个标识已被使用。';
      case 'invalid-input':
        return '请检查名称、标识和 Persona 内容。';
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
    <label className="bh-personabot-field" htmlFor={id}>
      <span className="bh-personabot-label">{label}</span>
      {children}
      {hint === undefined ? null : <span className="bh-personabot-hint">{hint}</span>}
    </label>
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
  const slugId = useId();
  const personaId = useId();
  const [displayName, setDisplayName] = useState('');
  const [slug, setSlug] = useState('');
  const [persona, setPersona] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const invalid =
    displayName.trim().length === 0 || slug.trim().length === 0 || persona.trim().length === 0;

  const submit = (): void => {
    if (invalid || creating) return;
    setCreating(true);
    setError(undefined);
    void actions
      .createBot({
        displayName: displayName.trim(),
        slug: slug.trim(),
        persona,
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
      description="先定义一个本地身份和 Persona；创建不会启动 Session 或 Work。"
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
            placeholder="例如：研究助手"
            onChange={(event) => setDisplayName(event.currentTarget.value)}
          />
        </Field>
        <Field
          id={slugId}
          label="标识"
          hint="用于文件目录和引用：小写英文字母、数字和连字符，最长 64 个字符。"
        >
          <NameInput
            id={slugId}
            value={slug}
            disabled={creating}
            placeholder="research-assistant"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(event) => setSlug(event.currentTarget.value)}
          />
        </Field>
        <Field id={personaId} label="Persona" hint="描述它是谁、如何思考，以及应如何与你协作。">
          <textarea
            id={personaId}
            className="bh-personabot-textarea"
            value={persona}
            disabled={creating}
            placeholder="你是一名严谨的研究助手……"
            rows={6}
            onChange={(event) => setPersona(event.currentTarget.value)}
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
