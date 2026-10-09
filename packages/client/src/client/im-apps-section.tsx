import { useState, useSyncExternalStore, type ReactElement } from 'react';

import { Button, closeTopModal, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots';

import { BOT_SETTINGS_SECTIONS, type BotSettings } from './bot-settings.js';
import { openExternalBindingSettings } from './bot-settings-open.js';
import { externalPlatformLabel } from './bridge-source-label.js';
import { loadMessagingApps, type BridgeCall, type MessagingApp } from './bridge.js';
import { useMountedResource } from './mounted-resource.js';
import type { ClientStore } from './store.js';

export type ImAppsNotice = 'settings-unavailable';

export interface ImAppsFace {
  load(): Promise<MessagingApp[]>;
  manage(): void;
  takeNotice(): ImAppsNotice | undefined;
}

export function createImApps({
  call,
  botSettings,
  openDshSettings = (returned, unavailable) =>
    openExternalBindingSettings(document, returned, () => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null)
        closeTopModal(document);
      unavailable();
    }),
}: {
  call: BridgeCall;
  botSettings: Pick<BotSettings, 'open' | 'close'>;
  openDshSettings?: (returned: () => void, unavailable: () => void) => () => void;
}): ImAppsFace {
  let notice: ImAppsNotice | undefined;
  let stop: (() => void) | undefined;
  return {
    load: () => loadMessagingApps(call),
    manage: () => {
      stop?.();
      botSettings.close();
      stop = openDshSettings(
        () => {
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
        () => {
          notice = 'settings-unavailable';
          botSettings.open(BOT_SETTINGS_SECTIONS.imApps);
        },
      );
    },
    takeNotice: () => {
      const taken = notice;
      notice = undefined;
      return taken;
    },
  };
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; apps: MessagingApp[] };

export function ImAppsSection({
  imApps,
  store,
  t,
}: PropsLocale<'botharness'> &
  InjectFace<{ imApps: ImAppsFace; store: ClientStore }>): ReactElement {
  const bots = useSyncExternalStore(store.subscribe, () => store.getSnapshot().bots);
  const [notice] = useState(() => imApps.takeNotice());
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    imApps.load().then(
      (apps) => {
        if (active) setLoaded({ status: 'ready', apps });
      },
      () => {
        if (active) setLoaded({ status: 'failed' });
      },
    );
    return () => {
      active = false;
    };
  }, [imApps]);
  const botName = (slug: string): string =>
    bots.find((bot) => bot.slug === slug)?.displayName ?? t('imApps.removedBot');
  return (
    <div ref={mount} className="bh-settings-rows">
      <div className="bh-settings-row">
        <div className="bh-settings-row-text">
          <div className="bh-settings-row-desc">{t('imApps.description')}</div>
          {notice === 'settings-unavailable' ? (
            <div className="bh-settings-row-desc" role="status">
              {t('imApps.settingsUnavailable')}
            </div>
          ) : null}
        </div>
        <Button variant="outline" size="sm" onClick={imApps.manage}>
          {t('imApps.manage')}
        </Button>
      </div>
      {loaded.status === 'loading' ? null : loaded.status === 'failed' ? (
        <div className="bh-settings-row" role="status">
          <div className="bh-settings-row-desc">{t('imApps.loadFailed')}</div>
        </div>
      ) : loaded.apps.length === 0 ? (
        <div className="bh-settings-row">
          <div className="bh-settings-row-desc">{t('imApps.empty')}</div>
        </div>
      ) : (
        loaded.apps.map((app) => (
          <div key={`${app.providerId}:${app.ref}`} className="bh-settings-row bh-im-apps-row">
            <div className="bh-settings-row-text">
              <div className="bh-settings-row-title">{app.name}</div>
              <div className="bh-settings-row-desc">
                {externalPlatformLabel(app.platform, t)} ·{' '}
                {t(app.connected ? 'imApps.connected' : 'imApps.disconnected')}
              </div>
            </div>
            {app.boundBotSlug === undefined ? (
              <Tag>{t('imApps.unbound')}</Tag>
            ) : (
              <span className="bh-im-apps-bot">{botName(app.boundBotSlug)}</span>
            )}
          </div>
        ))
      )}
    </div>
  );
}
