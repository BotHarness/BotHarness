import { useEffect, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { MemoryWorkingChange, MemoryWorkingDiff } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

interface CommonProps {
  actions: BridgeActions;
  channelId: string;
  onClose: () => void;
  t: BotHarnessTranslate;
}

export function MemoryFileView({
  actions,
  channelId,
  path,
  onClose,
  t,
}: CommonProps & { path: string }): ReactElement {
  const [revision, setRevision] = useState(0);
  const [file, setFile] = useState<Awaited<ReturnType<BridgeActions['memoryFile']>>>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    setFile(undefined);
    setError(undefined);
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      void actions
        .memoryFile(channelId, path)
        .then(
          (next) => {
            if (active) {
              setFile(next);
              setError(next === undefined ? t('memory.fileMissing') : undefined);
            }
          },
          (failure: unknown) => {
            if (active) setError(failure instanceof Error ? failure.message : String(failure));
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, path, revision, t]);

  return (
    <div className="bh-memory-commit-view" role="region" aria-label={t('entry.memoryFiles')}>
      <div className="bh-memory-commit-header">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('memory.backToChat')}
        </Button>
        <strong>{path}</strong>
        <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
          {t('memory.refresh')}
        </Button>
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {file === undefined ? (
        error === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : null
      ) : file.binary ? (
        <div className="bh-note">{t('memory.binaryPreview')}</div>
      ) : (
        <pre className="bh-memory-commit-code">{file.body}</pre>
      )}
    </div>
  );
}

export function MemoryWorkingView({
  actions,
  channelId,
  change,
  onClose,
  t,
}: CommonProps & { change: MemoryWorkingChange }): ReactElement {
  const [revision, setRevision] = useState(0);
  const [detail, setDetail] = useState<MemoryWorkingDiff>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    setDetail(undefined);
    setError(undefined);
    const load = (): void => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(load, 15_000);
        return;
      }
      inFlight = true;
      void actions
        .memoryWorkingDiff(channelId, change.path, change.kind)
        .then(
          (next) => {
            if (active) {
              setDetail(next);
              setError(undefined);
            }
          },
          (failure: unknown) => {
            if (active) setError(failure instanceof Error ? failure.message : String(failure));
          },
        )
        .finally(() => {
          inFlight = false;
          if (active) timer = setTimeout(load, 15_000);
        });
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      load();
    };
    load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, change.path, change.kind, revision]);

  return (
    <div className="bh-memory-commit-view" role="region" aria-label={t('memory.workingDiff')}>
      <div className="bh-memory-commit-header">
        <Button variant="outline" size="sm" onClick={onClose}>
          {t('memory.backToChat')}
        </Button>
        <div>
          <strong>{t('memory.workingDiff')}</strong>
          <span>{change.path}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>
          {t('memory.refresh')}
        </Button>
      </div>
      <div className="bh-memory-commit-file">
        <span className="bh-memory-file-status">{detail?.status ?? change.status}</span>
        <span>
          {t(`memory.${change.kind}`)} · {change.path}
        </span>
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {detail === undefined ? (
        error === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : null
      ) : detail.binary ? (
        <div className="bh-note">{t('memory.binaryPreview')}</div>
      ) : (
        <div className="bh-memory-commit-code" aria-label={t('memory.workingDiff')}>
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
      )}
    </div>
  );
}
