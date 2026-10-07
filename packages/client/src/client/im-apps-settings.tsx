import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { MessagingApp } from '../../../core/src/messaging/outbound.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { loadMessagingApps, type BridgeCall } from './bridge.js';
import { openImSettings } from './bot-settings-open.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientStore } from './store.js';

export type ImAppsSettingsProps = PropsRuntime<'botharness.settings.item'> &
  PropsLocale<'botharness'> &
  InjectFace<{
    call: BridgeCall;
    store: ClientStore;
    openBot(slug: string): Promise<void>;
  }>;

export function ImAppsSettings({ call, store, openBot, t }: ImAppsSettingsProps): ReactElement {
  const [apps, setApps] = useState<MessagingApp[]>();
  const [error, setError] = useState(false);
  const request = useRef(0);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const load = (): void => {
      const version = ++request.current;
      loadMessagingApps(call)
        .then((value) => {
          if (active && version === request.current) {
            setApps(value);
            setError(false);
          }
        })
        .catch(() => {
          if (active && version === request.current) setError(true);
        });
    };
    load();
    const unsubscribe = subscribeMessagingDefaults(load);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [call]);
  const botName = (slug: string) =>
    state.bots.find((bot) => bot.slug === slug)?.displayName ?? slug;
  const sorted = [...(apps ?? [])].sort(
    (a, b) =>
      externalPlatformLabel(a.platform, t).localeCompare(externalPlatformLabel(b.platform, t)) ||
      a.name.localeCompare(b.name),
  );
  return (
    <div ref={mount} className="bh-profile-section bh-im-apps">
      <strong>{t('imApps.title')}</strong>
      <p>{t('imApps.summary')}</p>
      {error ? (
        <p role="alert" className="bh-error">
          {t('imApps.failed')}
        </p>
      ) : null}
      {apps === undefined && !error ? <p className="bh-muted">{t('im.loading')}</p> : null}
      {apps !== undefined && !apps.length ? <p className="bh-muted">{t('imApps.empty')}</p> : null}
      {sorted.length ? (
        <table className="bh-im-apps-table">
          <thead>
            <tr>
              <th scope="col">{t('identity.app')}</th>
              <th scope="col">{t('identity.platform')}</th>
              <th scope="col">{t('identity.status')}</th>
              <th scope="col">{t('imApps.usedBy')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((app) => (
              <tr key={`${app.providerId}:${app.ref}`}>
                <td>{app.name}</td>
                <td>{externalPlatformLabel(app.platform, t)}</td>
                <td>
                  <Tag tone={app.connected ? 'success' : 'neutral'}>
                    {t(app.connected ? 'imApps.connected' : 'imApps.disconnected')}
                  </Tag>
                </td>
                <td>
                  {app.boundBotSlug ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="bh-im-apps-bot"
                      aria-label={t('imApps.openBot', { name: botName(app.boundBotSlug) })}
                      onClick={() => void openBot(app.boundBotSlug!)}
                    >
                      {botName(app.boundBotSlug)}
                    </Button>
                  ) : (
                    <span className="bh-muted">{t('imApps.unbound')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openImSettings(document, () => undefined)}
        >
          {t('imApps.manage')}
        </Button>
      </div>
    </div>
  );
}
