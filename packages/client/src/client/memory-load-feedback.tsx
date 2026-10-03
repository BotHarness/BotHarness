import type { ReactElement } from 'react';
import type { BotHarnessTranslate } from './locale.js';
export function MemoryLoadFeedback({
  error,
  loaded,
  pending,
  onRetry,
  t,
}: {
  error: string | undefined;
  loaded: boolean;
  pending: boolean;
  onRetry: () => void;
  t: BotHarnessTranslate;
}): ReactElement | null {
  if (error === undefined) return null;
  return (
    <div className="bh-note bh-memory-load-feedback" role="alert" aria-busy={pending} title={error}>
      <span>
        {t(loaded ? 'memory.updateFailed' : 'memory.loadFailed')}
        {loaded ? null : ': ' + error}
      </span>
      <button type="button" className="bh-memory-retry" disabled={pending} onClick={onRetry}>
        {t('memory.retry')}
      </button>
    </div>
  );
}
