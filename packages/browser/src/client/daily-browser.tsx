import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { DailyView } from '../daily.js';
import type { BrowserTranslate } from './locale.js';

export function DailyBrowserControl({
  slug,
  view,
  enabled,
  paused,
  t,
  refresh,
}: {
  readonly slug: string | undefined;
  readonly view: DailyView | null;
  readonly enabled: boolean;
  readonly paused: boolean;
  readonly t: BrowserTranslate;
  readonly refresh: () => void;
}): ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mounted = useRef(false);
  const resource = useCallback((node: HTMLDivElement | null): void => {
    mounted.current = node !== null;
  }, []);
  const invoke = (action: 'connect' | 'grant' | 'return' | 'pause'): void => {
    if (busy || slug === undefined) return;
    setBusy(true);
    setError(undefined);
    void fetch(action === 'pause' ? '/api/browser/takeover' : `/api/browser/daily/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug, ...(action === 'pause' ? { active: !paused } : {}) }),
    })
      .then(async (response) => {
        const body = (await response.json()) as { ok: boolean; error?: string };
        if (!response.ok || !body.ok) throw new Error(body.error ?? t('entry.error'));
      })
      .catch((cause: unknown) => {
        if (mounted.current) setError(cause instanceof Error ? cause.message : t('entry.error'));
      })
      .finally(() => {
        if (mounted.current) {
          setBusy(false);
          refresh();
        }
      });
  };
  return (
    <div ref={resource} className="bh-browser-body bh-browser-borrow">
      <strong>{t('settings.daily-control')}</strong>
      <a
        className="bh-browser-daily-install"
        href="https://chromewebstore.google.com/detail/playwright-extension/mmlmfjhmonkocbjadbfplnigmagldckm"
        target="_blank"
        rel="noreferrer"
      >
        {t('entry.daily.install')}
      </a>
      {view === null || view.state === 'error' ? (
        <Button size="sm" disabled={!enabled || busy} onClick={() => invoke('connect')}>
          {t('entry.daily.connect')}
        </Button>
      ) : (
        <>
          <span role="status">
            {t(
              view.state === 'connecting'
                ? 'entry.daily.select'
                : view.state === 'confirm'
                  ? 'entry.daily.confirm'
                  : 'entry.daily.controlled',
            )}
          </span>
          {view.url === '' ? null : (
            <>
              <strong className="bh-browser-borrow-title">{view.title || view.url}</strong>
              <span className="bh-browser-borrow-url">{view.url}</span>
            </>
          )}
          {view.state === 'confirm' ? (
            <Button size="sm" disabled={!enabled || busy} onClick={() => invoke('grant')}>
              {t('entry.daily.allow')}
            </Button>
          ) : null}
          {view.state === 'controlled' ? (
            <Button size="sm" disabled={busy} onClick={() => invoke('pause')}>
              {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
            </Button>
          ) : null}
          <Button size="sm" disabled={busy} onClick={() => invoke('return')}>
            {t(view.state === 'connecting' ? 'entry.borrow.cancel' : 'entry.borrow.return')}
          </Button>
        </>
      )}
      {view?.error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {view.error}
        </div>
      )}
      {error === undefined ? null : (
        <div role="alert" className="bh-browser-error">
          {error}
        </div>
      )}
    </div>
  );
}
