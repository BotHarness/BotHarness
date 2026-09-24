import { useEffect, useState, type ReactElement } from 'react';

import type { MemoryAcceptedCommit, MemorySnapshot } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';

export function MemoryEntry({ actions, channelId, t }: ChannelSidebarEntryProps): ReactElement {
  const [refresh, setRefresh] = useState(0);
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [history, setHistory] = useState<MemoryAcceptedCommit[]>([]);
  const [path, setPath] = useState<string>();
  const [file, setFile] = useState<{ path: string; body: string; head: string }>();
  const [draft, setDraft] = useState('');
  const [sha, setSha] = useState<string>();
  const [diff, setDiff] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [confirmRepair, setConfirmRepair] = useState(false);
  const [repairArchive, setRepairArchive] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setError(undefined);
    setSnapshot(undefined);
    void Promise.all([actions.memorySnapshot(channelId), actions.memoryHistory(channelId)])
      .then(([next, commits]) => {
        if (!active) return;
        setSnapshot(next);
        setHistory(commits);
        setPath((current) =>
          current !== undefined && next.files.includes(current) ? current : next.files[0],
        );
      })
      .catch((failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      });
    return () => {
      active = false;
    };
  }, [actions, channelId, refresh]);

  useEffect(() => {
    let active = true;
    setFile(undefined);
    setDraft('');
    if (path !== undefined) {
      void actions
        .memoryFile(channelId, path)
        .then((next) => {
          if (!active) return;
          setFile(next);
          setDraft(next?.body ?? '');
        })
        .catch((failure: unknown) => {
          if (active) setError(failure instanceof Error ? failure.message : String(failure));
        });
    }
    return () => {
      active = false;
    };
  }, [actions, channelId, path, refresh]);

  useEffect(() => {
    let active = true;
    setDiff(undefined);
    if (sha !== undefined) {
      void actions
        .memoryDiff(channelId, sha)
        .then((next) => {
          if (active) setDiff(next);
        })
        .catch((failure: unknown) => {
          if (active) setError(failure instanceof Error ? failure.message : String(failure));
        });
    }
    return () => {
      active = false;
    };
  }, [actions, channelId, sha]);

  const save = async (): Promise<void> => {
    if (file === undefined || busy || draft === file.body) return;
    setBusy(true);
    setError(undefined);
    try {
      const commit = await actions.memorySave({
        channelId,
        path: file.path,
        body: draft,
        expectedHead: file.head,
        editId: crypto.randomUUID(),
      });
      setSha(commit.sha);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  const repair = async (): Promise<void> => {
    if (snapshot?.head === null || snapshot?.head === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRepair({
        channelId,
        expectedHead: snapshot.head,
        repairId: crypto.randomUUID(),
      });
      setRepairArchive(result.backupPath);
      setConfirmRepair(false);
      setRefresh((value) => value + 1);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bh-memory-entry">
      <div className="bh-memory-toolbar">
        <span>{t('memory.accepted')}</span>
        <button type="button" onClick={() => setRefresh((value) => value + 1)}>
          {t('memory.refresh')}
        </button>
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {snapshot === undefined ? (
        <div className="bh-note">{t('memory.loading')}</div>
      ) : (
        <>
          {snapshot.provisional ? (
            <div className="bh-note" role="status">
              {t('memory.provisional')}
              {confirmRepair ? (
                <div>
                  <p>{t('memory.repairConfirm')}</p>
                  <button type="button" disabled={busy} onClick={() => void repair()}>
                    {busy ? t('memory.repairing') : t('memory.repairCommit')}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmRepair(false)}>
                    {t('memory.repairCancel')}
                  </button>
                </div>
              ) : (
                <button type="button" disabled={busy} onClick={() => setConfirmRepair(true)}>
                  {t('memory.repair')}
                </button>
              )}
            </div>
          ) : null}
          {repairArchive === undefined ? null : (
            <div className="bh-note" role="status">
              {t('memory.repairDone')} {repairArchive}
            </div>
          )}
          {snapshot.files.length === 0 ? (
            <div className="bh-note">{t('memory.empty')}</div>
          ) : (
            <div className="bh-memory-files">
              {snapshot.files.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={
                    item === path ? 'bh-memory-row bh-memory-row-selected' : 'bh-memory-row'
                  }
                  aria-pressed={item === path}
                  onClick={() => setPath(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          {file === undefined ? null : (
            <div className="bh-memory-editor">
              <label htmlFor="bh-memory-editor-body">{file.path}</label>
              <textarea
                id="bh-memory-editor-body"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                spellCheck={false}
              />
              <button
                type="button"
                disabled={busy || draft === file.body || snapshot.provisional}
                onClick={() => void save()}
              >
                {busy ? t('memory.saving') : t('memory.save')}
              </button>
            </div>
          )}
          <div className="bh-memory-history">
            <strong>{t('memory.history')}</strong>
            {history.map((commit) => (
              <button
                type="button"
                key={commit.sha}
                className={
                  commit.sha === sha ? 'bh-memory-row bh-memory-row-selected' : 'bh-memory-row'
                }
                aria-pressed={commit.sha === sha}
                onClick={() => setSha(commit.sha)}
                title={commit.sha}
              >
                {commit.sha.slice(0, 7)} · {commit.actorKind} ·{' '}
                {new Date(commit.acceptedAt).toLocaleString()}
              </button>
            ))}
            {diff === undefined ? null : (
              <pre className="bh-memory-diff" aria-label={t('memory.diff')}>
                {diff}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}
