import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type { MemoryRecoveryCheckpoint } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

type RecoverySnapshot = { checkpoints: MemoryRecoveryCheckpoint[]; error?: string };

const stores = new WeakMap<BridgeActions, Map<string, ReturnType<typeof createRecoveryStore>>>();

function createRecoveryStore(actions: BridgeActions, channelId: string) {
  let snapshot: RecoverySnapshot = { checkpoints: [] };
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let loading = false;
  const publish = (next: RecoverySnapshot): void => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const load = (): void => {
    if (loading || listeners.size === 0 || document.visibilityState === 'hidden') return;
    loading = true;
    void actions
      .memoryRecoveryHistory(channelId)
      .then(
        (checkpoints) => publish({ checkpoints }),
        (failure: unknown) =>
          publish({
            checkpoints: snapshot.checkpoints,
            error: failure instanceof Error ? failure.message : String(failure),
          }),
      )
      .finally(() => {
        loading = false;
        if (listeners.size > 0) timer = setTimeout(load, 20_000);
      });
  };
  const onVisible = (): void => {
    if (document.visibilityState !== 'visible') return;
    clearTimeout(timer);
    load();
  };
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      if (listeners.size === 1) {
        load();
        window.addEventListener('focus', onVisible);
        document.addEventListener('visibilitychange', onVisible);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          clearTimeout(timer);
          window.removeEventListener('focus', onVisible);
          document.removeEventListener('visibilitychange', onVisible);
        }
      };
    },
    reload(): void {
      clearTimeout(timer);
      load();
    },
  };
}

function recoveryStore(
  actions: BridgeActions,
  channelId: string,
  refreshRevision: number | undefined,
) {
  let channels = stores.get(actions);
  if (channels === undefined) {
    channels = new Map();
    stores.set(actions, channels);
  }
  const key = `${channelId}:${refreshRevision ?? 0}`;
  let store = channels.get(key);
  if (store === undefined) {
    store = createRecoveryStore(actions, channelId);
    channels.set(key, store);
    if (channels.size > 30) channels.delete(channels.keys().next().value!);
  }
  return store;
}

export function MemoryRecovery({
  actions,
  channelId,
  refreshRevision,
  onRestored,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  refreshRevision: number | undefined;
  onRestored: () => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const source = recoveryStore(actions, channelId, refreshRevision);
  const { checkpoints, error: loadError } = useSyncExternalStore(
    source.subscribe,
    source.getSnapshot,
    source.getSnapshot,
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [archivePath, setArchivePath] = useState<string>();

  const current = checkpoints[0];
  const selected = checkpoints.find((point) => point.id === selectedId);
  const restore = async (): Promise<void> => {
    if (selected === undefined || current === undefined || busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const result = await actions.memoryRestore({
        channelId,
        checkpointId: selected.id,
        expectedCurrentId: current.id,
      });
      setArchivePath(result.archivePath);
      setSelectedId(undefined);
      setConfirming(false);
      source.reload();
      onRestored();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
      setConfirming(false);
      source.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="bh-memory-recovery">
      <summary>{t('memory.recovery.title')}</summary>
      <p className="bh-memory-recovery-help">{t('memory.recovery.help')}</p>
      {(error ?? loadError) === undefined ? null : (
        <div className="bh-error" role="alert">
          {error ?? loadError}
        </div>
      )}
      {archivePath === undefined ? null : (
        <details className="bh-note bh-memory-recovery-archive" role="status">
          <summary>{t('memory.recovery.done')}</summary>
          <code>{archivePath}</code>
        </details>
      )}
      <div className="bh-memory-recovery-list" role="list" aria-label={t('memory.recovery.title')}>
        {checkpoints.map((point, index) => (
          <button
            type="button"
            role="listitem"
            key={point.id}
            data-checkpoint-id={point.id}
            className="bh-memory-recovery-row"
            aria-pressed={point.id === selectedId}
            onClick={() => {
              setSelectedId(point.id);
              setConfirming(false);
            }}
          >
            <span className="bh-memory-recovery-main">
              <span>
                {point.branch} · {point.head.slice(0, 7)}
              </span>
              {index === 0 ? (
                <span className="bh-memory-ref">{t('memory.recovery.current')}</span>
              ) : null}
            </span>
            <span className="bh-memory-recovery-meta">
              {new Date(point.capturedAt).toLocaleString()} ·{' '}
              {t(`memory.recovery.origin.${point.origin}`)}
            </span>
          </button>
        ))}
      </div>
      {selected === undefined ? null : (
        <div className="bh-memory-recovery-selection">
          <div>
            {t('memory.recovery.cause')}: {t(`memory.recovery.cause.${selected.causeKind}`)}
          </div>
          {selected.id === current?.id ? null : confirming ? (
            <div className="bh-memory-recovery-confirm">
              <p>
                {t('memory.recovery.confirm', {
                  branch: selected.branch,
                  sha: selected.head.slice(0, 7),
                })}
              </p>
              <Button variant="outline" size="sm" disabled={busy} onClick={() => void restore()}>
                {busy ? t('memory.recovery.restoring') : t('memory.recovery.restore')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => setConfirming(false)}
              >
                {t('memory.repairCancel')}
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setConfirming(true)}>
              {t('memory.recovery.choose')}
            </Button>
          )}
        </div>
      )}
    </details>
  );
}
