import { useEffect, useState, type ReactElement } from 'react';
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
        <button type="button" onClick={onClose}>
          {t('memory.backToChat')}
        </button>
        <div>
          <strong>{t('memory.diff')}</strong>
          <span title={sha}>{sha.slice(0, 12)}</span>
        </div>
      </div>
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
