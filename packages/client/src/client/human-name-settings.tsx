import { useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';
import {
  loadHumanIdentity,
  setHumanDefaultName,
  type BridgeCall,
  type LocalHumanIdentity,
} from './bridge.js';
import type { ClientStore } from './store.js';
import { useMountedResource } from './mounted-resource.js';

export type HumanNameSettingsProps = PropsLocale<'botharness'> &
  InjectFace<{
    call: BridgeCall;
    store: ClientStore;
    onSaved(): Promise<void>;
  }>;

export function HumanNameSettings({
  call,
  store,
  onSaved,
  t,
}: HumanNameSettingsProps): ReactElement {
  const [identity, setIdentity] = useState<LocalHumanIdentity>();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = useRef(false);
  const submitting = useRef(false);
  const request = useRef(0);
  const mounted = useRef(false);
  const mount = useMountedResource<HTMLDivElement>(() => {
    mounted.current = true;
    const controller = new AbortController();
    const refresh = async (): Promise<void> => {
      if (submitting.current) return;
      const version = ++request.current;
      try {
        const value = await loadHumanIdentity(call, controller.signal);
        if (controller.signal.aborted || version !== request.current) return;
        setIdentity(value);
        if (!dirty.current) setDraft(value.defaultDisplayName ?? '');
        setError(false);
      } catch {
        if (!controller.signal.aborted && version === request.current) setError(true);
      }
    };
    void refresh();
    let source: EventSource | undefined;
    let channels = store.getSnapshot().channels;
    const sync = (): void => {
      const snapshot = store.getSnapshot();
      if (snapshot.mode === 'bot') {
        source?.close();
        source = undefined;
      } else if (source === undefined && typeof EventSource !== 'undefined') {
        source = new EventSource('/api/botharness/stream?scope=roster');
        source.addEventListener('roster/changed', () => void refresh());
        source.onopen = () => void refresh();
      }
      if (channels !== snapshot.channels) {
        channels = snapshot.channels;
        void refresh();
      }
    };
    const unsubscribe = store.subscribe(sync);
    sync();
    return () => {
      mounted.current = false;
      controller.abort();
      unsubscribe();
      source?.close();
    };
  }, [call, store]);
  const save = async (name: string | null): Promise<void> => {
    if (submitting.current) return;
    submitting.current = true;
    request.current += 1;
    setBusy(true);
    setError(false);
    setSaved(false);
    try {
      const value = await setHumanDefaultName(call, name);
      if (!mounted.current) return;
      setIdentity(value);
      setDraft(value.defaultDisplayName ?? '');
      dirty.current = false;
      setSaved(true);
      void onSaved().catch(() => undefined);
    } catch {
      if (mounted.current) setError(true);
    } finally {
      submitting.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  return (
    <div className="bh-human-name-setting" ref={mount}>
      <div className="bh-settings-row-text">
        <label className="bh-settings-row-title" htmlFor="bh-human-default-name">
          {t('humanName.title')}
        </label>
        <div className="bh-settings-row-desc">{t('humanName.description')}</div>
      </div>
      <div className="bh-human-name-controls">
        <Input
          id="bh-human-default-name"
          value={draft}
          placeholder={t('humanName.placeholder')}
          maxLength={128}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
            event.preventDefault();
            void save(draft.trim() || null);
          }}
          disabled={busy || identity === undefined}
          onChange={(event) => {
            dirty.current = true;
            setDraft(event.target.value);
            setSaved(false);
          }}
        />
        <Button
          type="button"
          className="bh-human-name-save"
          onClick={() => void save(draft.trim() || null)}
          variant="primary"
          disabled={
            busy || identity === undefined || draft.trim() === (identity.defaultDisplayName ?? '')
          }
        >
          {t('humanName.save')}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || identity === undefined || identity.defaultDisplayName === null}
          onClick={() => void save(null)}
        >
          {t('humanName.clear')}
        </Button>
      </div>
      {error ? (
        <p className="bh-error" role="alert">
          {t('humanName.error')}
        </p>
      ) : identity === undefined ? (
        <p className="bh-note" role="status">
          {t('humanName.loading')}
        </p>
      ) : saved ? (
        <p className="bh-note" role="status">
          {t('humanName.saved')}
        </p>
      ) : null}
    </div>
  );
}
