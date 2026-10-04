import { useId, useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { isAssignmentConcurrencyLimit } from '../bot-mode-settings.js';
import { useMountedResource } from './mounted-resource.js';
import type { BotHarnessKey } from './locale.js';

export function AssignmentConcurrencySetting({
  t,
  limit,
  writable,
  save,
}: {
  t: (key: BotHarnessKey) => string;
  limit: number;
  writable: boolean;
  save: (limit: number) => Promise<boolean>;
}): ReactElement {
  const id = useId();
  const [draft, setDraft] = useState<string>();
  const input = draft ?? String(limit);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<BotHarnessKey>();
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const mount = useMountedResource<HTMLFormElement>(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const submit = async (): Promise<void> => {
    if (pending.current || !writable) return;
    const value = Number(input.trim());
    if (!isAssignmentConcurrencyLimit(value)) {
      setError('assignmentLimit.invalid');
      return;
    }
    pending.current = true;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const accepted = await save(value);
      if (mounted.current) {
        if (accepted) {
          setDraft(undefined);
          setSaved(true);
        } else setError('assignmentLimit.failed');
      }
    } catch {
      if (mounted.current) setError('assignmentLimit.failed');
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <form
      className="bh-settings-row bh-assignment-limit-row"
      ref={mount}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="bh-settings-row-text">
        <label className="bh-settings-row-title" htmlFor={id}>
          {t('assignmentLimit.title')}
        </label>
        <div className="bh-settings-row-desc" id={`${id}-description`}>
          {t('assignmentLimit.description')}
        </div>
        {error && (
          <div className="bh-assignment-limit-error" id={`${id}-error`} role="alert">
            {t(error)}
          </div>
        )}
        {saved && (
          <div className="bh-settings-row-desc" role="status">
            {t('assignmentLimit.saved')}
          </div>
        )}
      </div>
      <div className="bh-assignment-limit-controls">
        <Input
          id={id}
          type="number"
          min={1}
          max={32}
          step={1}
          value={input}
          disabled={busy || !writable}
          aria-describedby={`${id}-description${error ? ` ${id}-error` : ''}`}
          aria-invalid={error ? true : undefined}
          onChange={(event) => {
            setDraft(event.target.value);
            setError(undefined);
            setSaved(false);
          }}
        />
        <Button
          type="submit"
          size="sm"
          variant="primary"
          disabled={busy || !writable || input === String(limit)}
        >
          {t(busy ? 'assignmentLimit.saving' : 'assignmentLimit.save')}
        </Button>
      </div>
    </form>
  );
}
