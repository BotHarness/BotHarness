import { useEffect, useState, type ReactElement } from 'react';
import type { MemorySnapshot } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { MemoryFileTree } from './memory-file-tree.js';

export function MemoryFilesEntry({
  actions,
  channelId,
  conversationRevision,
  onMemoryFileSelect,
  selectedMemoryFilePath,
  refreshRevision,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  const [snapshot, setSnapshot] = useState<MemorySnapshot>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let inFlight = false;
    const load = async (): Promise<void> => {
      if (!active || inFlight) return;
      if (document.visibilityState === 'hidden') {
        timer = setTimeout(() => void load(), 15_000);
        return;
      }
      inFlight = true;
      try {
        const next = await actions.memorySnapshot(channelId);
        if (active) {
          setSnapshot(next);
          setError(undefined);
        }
      } catch (failure) {
        if (active) setError(failure instanceof Error ? failure.message : String(failure));
      } finally {
        inFlight = false;
        if (active) timer = setTimeout(() => void load(), 15_000);
      }
    };
    const onVisible = (): void => {
      if (document.visibilityState !== 'visible') return;
      clearTimeout(timer);
      void load();
    };
    void load();
    window.addEventListener('focus', onVisible);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      clearTimeout(timer);
      window.removeEventListener('focus', onVisible);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [actions, channelId, conversationRevision, refreshRevision]);

  return (
    <div className="bh-memory-entry">
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
        <MemoryFileTree
          paths={snapshot.files}
          selectedPath={selectedMemoryFilePath}
          onSelect={onMemoryFileSelect}
          t={t}
        />
      )}
    </div>
  );
}
