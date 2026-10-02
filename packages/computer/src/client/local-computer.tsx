import { useCallback, useState, type ReactElement } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ComputerTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';

export const LOCAL_COMPUTER_COLORS = {
  error: 'var(--dsw-alias-state-error-primary)',
  secondary: 'var(--dsw-alias-label-secondary)',
} as const;

interface LocalStatus {
  target?: string;
  probe?: { available?: boolean; detail?: string };
  status?: { state?: string; phase?: string; detail?: string };
}

export function LocalComputerStatus({ t }: { t: ComputerTranslate }): ReactElement {
  const [payload, setPayload] = useState<LocalStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch('/api/computer/status', {
      credentials: 'same-origin',
      ...(signal === undefined ? {} : { signal }),
    });
    if (!response.ok) throw new Error(`Computer status: HTTP ${String(response.status)}`);
    const next = (await response.json()) as LocalStatus;
    if (!signal?.aborted) {
      setPayload(next);
      setError(undefined);
    }
  }, []);
  const resource = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      } catch (error) {
        if (!controller.signal.aborted) setError(String(error));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 2000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);
  const preparing = busy || payload?.status?.phase === 'starting';
  const failure = error ?? payload?.status?.detail ?? payload?.probe?.detail;
  const check = (): void => {
    setBusy(true);
    setError(undefined);
    void fetch('/api/computer/start', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ authorize: true, target: 'local' }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(await response.text());
        await refresh();
      })
      .catch((error: unknown) => setError(String(error)))
      .finally(() => setBusy(false));
  };
  return (
    <div ref={resource} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div>
        {t(
          payload?.status?.state === 'running'
            ? 'local.granted'
            : preparing
              ? 'local.checking'
              : 'local.title',
        )}
      </div>
      <div style={{ color: LOCAL_COMPUTER_COLORS.secondary, fontSize: 12 }}>
        {t('local.description')}
      </div>
      {failure === undefined ? null : (
        <div role="alert" style={{ color: LOCAL_COMPUTER_COLORS.error, fontSize: 12 }}>
          {failure}
        </div>
      )}
      <Button size="sm" disabled={preparing || payload?.probe?.available === false} onClick={check}>
        {t(preparing ? 'local.checking' : 'local.check')}
      </Button>
    </div>
  );
}
