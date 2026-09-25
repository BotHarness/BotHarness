import { useEffect, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { MemoryGitCommitDiff } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

export function MemoryCommitView({
  actions,
  channelId,
  sha,
  onClose,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  sha: string;
  onClose: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [detail, setDetail] = useState<MemoryGitCommitDiff>();
  const [error, setError] = useState<string>();
  const [continueOpen, setContinueOpen] = useState(false);
  const [branch, setBranch] = useState('');
  const [sending, setSending] = useState(false);

  const requestContinue = async (): Promise<void> => {
    if (sending || branch.trim() === '') return;
    setSending(true);
    setError(undefined);
    try {
      const sent = await actions.send(
        t('memory.continuePrompt', { sha, branch: JSON.stringify(branch.trim()) }),
      );
      if (!sent) throw new Error(t('memory.branchRequestFailed'));
      onClose();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setSending(false);
    }
  };
  useEffect(() => {
    let active = true;
    setDetail(undefined);
    setError(undefined);
    void actions
      .memoryGitCommitDiff(channelId, sha)
      .then((next) => {
        if (active) setDetail(next);
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      active = false;
    };
  }, [actions, channelId, sha]);

  return (
    <div className="bh-memory-commit-view" role="region" aria-label={t('memory.diff')}>
      <div className="bh-memory-commit-header">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('memory.backToChat')}
        </Button>
        <div>
          <strong>{t('memory.diff')}</strong>
          <span title={sha}>{sha.slice(0, 12)}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="bh-memory-continue-open"
          onClick={() => {
            setBranch('memory-' + sha.slice(0, 7));
            setContinueOpen((current) => !current);
          }}
        >
          {t('memory.continueHere')}
        </Button>
      </div>
      {continueOpen ? (
        <form
          className="bh-memory-continue-form"
          onSubmit={(event) => {
            event.preventDefault();
            void requestContinue();
          }}
        >
          <label htmlFor="bh-memory-new-branch">{t('memory.newBranch')}</label>
          <Input
            id="bh-memory-new-branch"
            autoFocus
            value={branch}
            onChange={(event) => setBranch(event.currentTarget.value)}
          />
          <Button
            variant="primary"
            size="sm"
            type="submit"
            disabled={sending || branch.trim() === ''}
          >
            {t('memory.createAndSwitch')}
          </Button>
        </form>
      ) : null}
      {error !== undefined ? (
        <div className="bh-error" role="alert">
          {error}
        </div>
      ) : null}
      {detail === undefined ? (
        <div className="bh-note">{t('memory.loading')}</div>
      ) : (
        <>
          <div className="bh-memory-commit-files">
            <strong>
              {t('memory.changedFiles')} · {detail.files.length}
            </strong>
            {detail.files.map((file, index) => (
              <div key={file.path + index} className="bh-memory-commit-file">
                <span className="bh-memory-file-status">{file.status}</span>
                <span>{file.path}</span>
              </div>
            ))}
          </div>
          <div className="bh-memory-commit-code" aria-label={t('memory.diff')}>
            {detail.diff.split('\n').map((line, index) => (
              <div
                key={index}
                className={
                  line.startsWith('+') && !line.startsWith('+++')
                    ? 'bh-memory-diff-add'
                    : line.startsWith('-') && !line.startsWith('---')
                      ? 'bh-memory-diff-remove'
                      : line.startsWith('diff --git') || line.startsWith('@@')
                        ? 'bh-memory-diff-header'
                        : ''
                }
              >
                {line || ' '}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
