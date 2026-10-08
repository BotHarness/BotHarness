import { useRef, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';
import { Combobox } from './combobox.js';
import { useMountedResource } from './mounted-resource.js';
import {
  ProviderAppSetup,
  type AppSetupAttempt,
  type AppSetupDescriptor,
} from './provider-app-setup.js';
import type { BotHarnessTranslate } from './locale.js';

export function CreateAppForm({
  client,
  botSlug,
  descriptors,
  t,
  onCreated,
  onBack,
}: {
  client: ProviderAppSetup;
  botSlug: string;
  descriptors: AppSetupDescriptor[];
  t: BotHarnessTranslate;
  onCreated(): Promise<void>;
  onBack(): void;
}): ReactElement {
  const [platform, setPlatform] = useState(
    client.descriptor(botSlug)?.platform ?? descriptors[0]?.platform ?? 'feishu',
  );
  const [domain, setDomain] = useState<'feishu' | 'lark'>('lark');
  const [attempt, setAttempt] = useState<AppSetupAttempt | undefined>(client.current(botSlug));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const active = useRef(false);
  const requestEpoch = useRef(0);
  const form = useRef<HTMLFormElement | null>(null);
  const mount = useMountedResource<HTMLFormElement>((node) => {
    active.current = true;
    form.current = node;
    if (client.current(botSlug)) {
      setBusy(true);
      void client
        .poll(botSlug)
        .then((value) => {
          if (active.current) setAttempt(value);
        })
        .catch(() => {
          if (active.current) {
            setError(true);
            if (!client.current(botSlug)) setAttempt(undefined);
          }
        })
        .finally(() => {
          if (active.current) setBusy(false);
        });
    }
    return () => {
      active.current = false;
    };
  }, []);
  const create = async () => {
    if (busy) return;
    const data = new FormData(form.current!);
    const epoch = ++requestEpoch.current;
    setBusy(true);
    setError(false);
    try {
      const descriptor = descriptors.find((entry) => entry.platform === platform);
      if (!descriptor) throw new Error('setup-unavailable');
      let value = client.current(botSlug) ?? (await client.start(botSlug, descriptor));
      if (value.state === 'credentials') {
        value = await client.credentials(botSlug, {
          appId: String(data.get('appId') ?? '').trim(),
          appSecret: String(data.get('appSecret') ?? '').trim(),
          domain,
        });
        form.current?.reset();
      }
      if (active.current && epoch === requestEpoch.current) {
        setAttempt(value);
        if (value.state === 'ready') await onCreated();
      }
    } catch {
      if (active.current && epoch === requestEpoch.current) setError(true);
    } finally {
      if (active.current && epoch === requestEpoch.current) setBusy(false);
    }
  };
  return (
    <form
      ref={mount}
      className="bh-sidebar-modal-form"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <Button type="button" variant="ghost" disabled={busy} onClick={onBack}>
        {t('appSetup.back')}
      </Button>
      <Combobox
        label={t('appSetup.platform')}
        toggleLabel={t('appSetup.platform')}
        value={platform}
        disabled={busy || !!attempt}
        onSelect={(value) => setPlatform(value as 'feishu' | 'weixin')}
        options={descriptors.map((entry) => ({
          value: entry.platform,
          label: entry.platform === 'feishu' ? 'Lark / 飞书' : t('appSetup.wechat'),
        }))}
        emptyLabel={t('identity.noApps')}
      />
      <p className="bh-note">{t('appSetup.resumeHint')}</p>
      {platform === 'feishu' && attempt?.state !== 'ready' ? (
        <>
          <Combobox
            label={t('appSetup.domain')}
            toggleLabel={t('appSetup.domain')}
            value={domain}
            disabled={busy}
            onSelect={(value) => setDomain(value as 'feishu' | 'lark')}
            options={[
              { value: 'lark', label: 'Lark' },
              { value: 'feishu', label: '飞书' },
            ]}
            emptyLabel={t('im.select')}
          />
          <label className="bh-im-field">
            <span>App ID</span>
            <Input name="appId" aria-label="App ID" disabled={busy} autoComplete="off" />
          </label>
          <label className="bh-im-field">
            <span>App Secret</span>
            <Input
              name="appSecret"
              aria-label="App Secret"
              type="password"
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <a href={t('identity.tutorial.larkUrl')} target="_blank" rel="noopener noreferrer">
            {t('appSetup.checklist')}
          </a>
        </>
      ) : null}
      {attempt?.state === 'ready' ? (
        <p role="status">
          {t('appSetup.created', { name: attempt.name ?? attempt.accountRef ?? '' })}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="bh-error">
          {t('appSetup.failed')}
        </p>
      ) : null}
      {attempt || busy ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            requestEpoch.current++;
            void client
              .cancel(botSlug)
              .then((value) => {
                if (value.state !== 'ready') client.forget(botSlug);
                if (active.current) {
                  setAttempt(value.state === 'ready' ? value : undefined);
                  setError(false);
                }
              })
              .catch(() => {
                if (active.current) {
                  setError(true);
                  if (!client.current(botSlug)) setAttempt(undefined);
                }
              })
              .finally(() => {
                if (active.current) setBusy(false);
              });
          }}
        >
          {t('appSetup.cancel')}
        </Button>
      ) : null}
      <Button type="submit" variant="primary" disabled={busy}>
        {t(busy ? 'identity.pending' : 'appSetup.createBind')}
      </Button>
    </form>
  );
}
