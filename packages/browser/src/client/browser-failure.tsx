import type { ReactElement } from 'react';

import {
  isBrowserFailureKind,
  type BrowserFailureKind,
  type BrowserInstallProgress,
} from '../failure-kinds.js';
import type { BrowserTranslate } from './locale.js';

export interface BrowserFailure {
  readonly message: string;
  readonly code?: string;
  readonly detail?: string;
}

export class BrowserApiError extends Error {
  readonly code?: string;
  readonly detail?: string;

  constructor(message: string, code?: string, detail?: string) {
    super(message);
    this.name = 'BrowserApiError';
    if (code !== undefined) this.code = code;
    if (detail !== undefined) this.detail = detail;
  }
}

export function readFailure(cause: unknown): BrowserFailure {
  if (cause instanceof BrowserApiError)
    return {
      message: cause.message,
      ...(cause.code === undefined ? {} : { code: cause.code }),
      ...(cause.detail === undefined ? {} : { detail: cause.detail }),
    };
  return { message: cause instanceof Error ? cause.message : String(cause) };
}

export function BrowserFailureNotice({
  failure,
  t,
}: {
  readonly failure: BrowserFailure;
  readonly t: BrowserTranslate;
}): ReactElement | null {
  if (!isBrowserFailureKind(failure.code)) return null;
  const kind: BrowserFailureKind = failure.code;
  return (
    <div role="alert" className="bh-browser-failure">
      <div className="bh-browser-failure-title">{t(`entry.fail.${kind}.title`)}</div>
      <div className="bh-browser-failure-fault">{t(`entry.fail.${kind}.fault`)}</div>
      <div className="bh-browser-failure-action">{t(`entry.fail.${kind}.action`)}</div>
      {failure.detail === undefined || failure.detail === '' ? null : (
        <details className="bh-browser-failure-details">
          <summary>{t('entry.fail.details')}</summary>
          <pre>{failure.detail}</pre>
        </details>
      )}
    </div>
  );
}

function formatMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function BrowserProvisionProgress({
  progress,
  t,
}: {
  readonly progress: BrowserInstallProgress;
  readonly t: BrowserTranslate;
}): ReactElement {
  if (progress.totalBytes <= 0)
    return (
      <div role="status" className="bh-browser-progress">
        {t('entry.provision.preparing')}
      </div>
    );
  const percent = Math.max(
    0,
    Math.min(99, Math.floor((progress.downloadedBytes / progress.totalBytes) * 100)),
  );
  return (
    <div role="status" className="bh-browser-progress">
      <progress
        className="bh-browser-progress-bar"
        max={progress.totalBytes}
        value={Math.min(progress.downloadedBytes, progress.totalBytes)}
      />
      <span>
        {t('entry.provision.downloading', {
          percent: String(percent),
          downloaded: formatMiB(progress.downloadedBytes),
          total: formatMiB(progress.totalBytes),
        })}
      </span>
    </div>
  );
}
