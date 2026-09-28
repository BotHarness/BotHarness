import { useEffect, useState, type ReactElement } from 'react';
import type { MemorySnapshot } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';

/** Current checked-out files; content opens in the Channel body. */
export function MemoryFilesEntry({
  actions,
  channelId,
  conversationRevision,
  onMemoryFileSelect,
  selectedMemoryFilePath,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    setSnapshot(undefined);
    setError(undefined);
    void actions.memorySnapshot(channelId).then(
      (next) => {
        if (active) setSnapshot(next);
      },
      (failure: unknown) => {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      },
    );
    return () => {
      active = false;
    };
  }, [actions, channelId, conversationRevision, revision]);

  return (
    <div className="bh-memory-entry">
      <div className="bh-memory-toolbar">
        <button type="button" onClick={() => setRevision((value) => value + 1)}>
          {t('memory.refresh')}
        </button>
      </div>
      {error === undefined ? null : (
        <div className="bh-error" role="alert">
          {error}
        </div>
      )}
      {snapshot === undefined ? (
        error === undefined ? (
          <div className="bh-note">{t('memory.loading')}</div>
        ) : null
      ) : snapshot.files.length === 0 ? (
        <div className="bh-note">{t('memory.empty')}</div>
      ) : (
        <div className="bh-memory-files">
          {snapshot.files.map((path) => (
            <button
              key={path}
              type="button"
              className={
                path === selectedMemoryFilePath
                  ? 'bh-memory-row bh-memory-row-selected'
                  : 'bh-memory-row'
              }
              aria-pressed={path === selectedMemoryFilePath}
              onClick={() => onMemoryFileSelect?.(path)}
            >
              {path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
