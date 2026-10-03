import {
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
} from 'react';
import { Modal, Switch, Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

import { LOCALE_NS, en, zh, type BrowserTranslate } from './locale.js';
import { ProfileCombobox } from './profile-combobox.js';
import { registerBrowserSettings } from './settings.js';
import { styles } from './styles.js';

const ENTRY_ID = 'botharness-browser';
const OBSERVATION_ENDPOINT = '/api/browser/observation';
const TAKEOVER_ENDPOINT = '/api/browser/takeover';
const OPEN_ENDPOINT = '/api/browser/open';
const STOP_ENDPOINT = '/api/browser/stop';

import { AccessPowerIcon } from './access-power-icon.js';

export const name = 'botharness-browser-client';

export const inject = ['channelSidebar', 'connection', 'locale'];

export interface BrowserClientContext {
  readonly locale: {
    bind(namespace: string): BrowserTranslate;
    register(namespace: string, dictionaries: { zh: unknown; en: unknown }): () => void;
  };
  inject(names: readonly string[], callback: (ctx: BrowserClientContext) => void): void;
  effect(callback: () => () => void, name: string): void;
}

interface ChannelSidebarEntryProps {
  readonly botSlug?: string;
  readonly t: BrowserTranslate;
  readonly expanded?: boolean;
  readonly setExpanded?: (expanded: boolean) => void;
  readonly setExpandable?: (expandable: boolean) => void;
}

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly order: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
    readonly headerAction?: ComponentType<ChannelSidebarEntryProps>;
  }): () => void;
}

interface ConnectionRpcLike {
  call(
    path: string,
    method: string,
    options?: { args?: unknown },
  ): Promise<{ ok: boolean; value?: unknown; error?: { message?: string } }>;
}

let connectionRpc: ConnectionRpcLike | undefined;

interface BotInfoView {
  readonly displayName: string | undefined;
  readonly browserAccess: boolean | undefined;
  readonly browserProfile: string | undefined;
  readonly profiles: readonly string[];
}

interface BrowserTabView {
  readonly targetId: string;
  readonly url: string;
  readonly title: string;
  readonly current: boolean;
}

interface BrowserObservation {
  readonly target?: 'local' | 'container';
  readonly viewerUrl?: string | null;
  readonly running: boolean;
  readonly frame: string | null;
  readonly focused: string | null;
  readonly takeover: boolean;
  readonly tabs: readonly BrowserTabView[];
  readonly profiles?: readonly string[];
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `HTTP ${String(response.status)}`);
  }
  return body;
}

interface ReadableStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

function createBotInfoStore(
  botSlug: string | undefined,
): ReadableStore<BotInfoView> & { refresh(): void; setAccess(enabled: boolean): void } {
  let info: BotInfoView = {
    displayName: undefined,
    browserAccess: undefined,
    browserProfile: undefined,
    profiles: [],
  };
  const listeners = new Set<() => void>();
  let started = false;
  const load = (): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined) return;
    void rpc
      .call('/api', 'botharness/list', { args: {} })
      .then((result) => {
        if (!result.ok) return;
        const value = result.value as {
          bots?: readonly {
            slug?: unknown;
            displayName?: unknown;
            browserAccess?: unknown;
            browserProfile?: unknown;
          }[];
        };
        const bots = value.bots ?? [];
        const match = bots.find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        const profiles = [
          ...new Set(
            bots
              .map((bot) => (typeof bot.browserProfile === 'string' ? bot.browserProfile : ''))
              .filter((name) => name !== ''),
          ),
        ].sort();
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          browserAccess: match.browserAccess === true,
          browserProfile:
            typeof match.browserProfile === 'string' && match.browserProfile !== ''
              ? match.browserProfile
              : undefined,
          profiles,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
    setAccess(enabled) {
      info = { ...info, browserAccess: enabled };
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      if (!started) {
        started = true;
        load();
      }
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => info,
    refresh: load,
  };
}

interface ObservationStore {
  subscribe(listener: () => void): () => void;
  getSnapshot(): BrowserObservation | undefined;
  setTab(targetId: string | undefined): void;
  refresh(): void;
}

function observationUrl(botSlug: string | undefined, tabId: string | undefined): string {
  const base = `${OBSERVATION_ENDPOINT}?slug=${encodeURIComponent(botSlug ?? '')}`;
  return tabId === undefined || tabId === '' ? base : `${base}&tab=${encodeURIComponent(tabId)}`;
}

function createObservationStore(botSlug: string | undefined): ObservationStore {
  let value: BrowserObservation | undefined;
  let tab: string | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let refreshing = false;
  let refreshAgain = false;
  const listeners = new Set<() => void>();
  const refresh = async (): Promise<void> => {
    if (refreshing) {
      refreshAgain = true;
      return;
    }
    refreshing = true;
    const requestedTab = tab;
    try {
      const next = await requestJson<BrowserObservation>(observationUrl(botSlug, requestedTab));
      if (tab === requestedTab) value = next;
    } catch {
      if (tab === requestedTab) value = undefined;
    } finally {
      refreshing = false;
    }
    for (const listener of listeners) listener();
    if (refreshAgain && listeners.size > 0) {
      refreshAgain = false;
      void refresh();
    }
  };
  return {
    subscribe(listener) {
      listeners.add(listener);
      if (listeners.size === 1) {
        void refresh();
        timer = setInterval(() => void refresh(), 1500);
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer !== undefined) {
          clearInterval(timer);
          timer = undefined;
        }
      };
    },
    getSnapshot: () => value,
    setTab(targetId) {
      tab = targetId;
      void refresh();
    },
    refresh: () => void refresh(),
  };
}

function BrowserHeaderAction({
  botSlug,
  t,
  setExpandable,
  setExpanded,
}: ChannelSidebarEntryProps): ReactElement {
  const [store] = useState(() => createBotInfoStore(botSlug));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState(false);
  const subscribe = (listener: () => void): (() => void) => {
    const sync = (): void => {
      const access = store.getSnapshot().browserAccess === true;
      setExpandable?.(access);
    };
    const unsubscribe = store.subscribe(() => {
      sync();
      listener();
    });
    sync();
    return unsubscribe;
  };
  const info = useSyncExternalStore(subscribe, store.getSnapshot);
  const accessOn = info.browserAccess === true;

  const onToggle = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    void rpc
      .call('/api', 'botharness/browserAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setError(true);
          return;
        }
        const value = result.value as { bot?: { browserAccess?: unknown } };
        const applied = value.bot?.browserAccess === true;
        store.setAccess(applied);
        setExpandable?.(applied);
        setExpanded?.(applied);
      })
      .catch(() => {
        setError(true);
      })
      .finally(() => {
        inFlight.current = false;
        setBusy(false);
      });
  };

  const label = t(accessOn ? 'entry.access.disable' : 'entry.access.enable');
  return (
    <span className="bh-browser-access-control">
      <Tooltip
        label={error ? t('entry.access.failed') + ': ' + label : label}
        side="bottom"
        delayMs={500}
      >
        <button
          type="button"
          className={`bh-browser-access-power${error ? ' bh-access-failed' : ''}`}
          aria-label={label}
          aria-pressed={accessOn}
          aria-busy={busy}
          disabled={
            busy ||
            botSlug === undefined ||
            connectionRpc === undefined ||
            info.browserAccess === undefined
          }
          onClick={() => onToggle(!accessOn)}
        >
          <AccessPowerIcon />
        </button>
      </Tooltip>
      {error ? (
        <span className="bh-browser-access-error" role="alert" title={t('entry.access.failed')}>
          {t('entry.access.failureHint')}
        </span>
      ) : null}
    </span>
  );
}

const buttonStyle = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
} as const;

function BrowserBody({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  const [store] = useState(() => createObservationStore(botSlug));
  const [infoStore] = useState(() => createBotInfoStore(botSlug));
  const observation = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const info = useSyncExternalStore(infoStore.subscribe, infoStore.getSnapshot);
  const [follow, setFollow] = useState(true);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const errorId = useId();
  const [profileInvalid, setProfileInvalid] = useState(false);
  const [profileOverride, setProfileOverride] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [viewer, setViewer] = useState<string | undefined>();
  const [interaction, setInteraction] = useState(false);

  const tabs = observation?.tabs ?? [];
  const focused = observation?.focused ?? null;
  const currentTab = tabs.find((tab) => tab.current);
  const orderedTabs =
    currentTab === undefined ? tabs : [currentTab, ...tabs.filter((tab) => !tab.current)];
  const paused = observation?.takeover === true;

  const invoke = (endpoint: string, body: Record<string, unknown> = {}): void => {
    if (busy || botSlug === undefined) return;
    setBusy(true);
    setProfileInvalid(false);
    setError(undefined);
    void requestJson<{ ok: boolean; viewerUrl?: string | null }>(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: botSlug, ...body }),
    })
      .then((result) => {
        if (
          endpoint === OPEN_ENDPOINT &&
          result.viewerUrl !== undefined &&
          result.viewerUrl !== null
        ) {
          setViewer(result.viewerUrl);
          setInteraction(false);
        }
        if (endpoint === STOP_ENDPOINT) {
          setViewer(undefined);
          setInteraction(false);
        }
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        setBusy(false);
        store.refresh();
      });
  };

  const onFollow = (next: boolean): void => {
    setFollow(next);
    if (next) {
      setPreview(undefined);
      store.setTab(undefined);
    } else {
      const selected = focused ?? preview;
      setPreview(selected);
      store.setTab(selected);
    }
  };

  const onSelectTab = (targetId: string): void => {
    setFollow(false);
    setPreview(targetId);
    store.setTab(targetId);
  };

  const onPause = (): void => {
    invoke(TAKEOVER_ENDPOINT, { active: !paused });
  };

  const currentProfile = profileOverride ?? info.browserProfile ?? '';

  const saveProfile = (name: string): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || busy) return;
    const trimmed = name.trim();
    const next = trimmed === 'default' ? '' : trimmed;
    if (next === currentProfile) {
      setProfileInvalid(false);
      setError(undefined);
      return;
    }
    setBusy(true);
    setProfileInvalid(false);
    setError(undefined);
    void rpc
      .call('/api', 'botharness/browserProfileSet', { args: { slug: botSlug, profile: next } })
      .then((result) => {
        if (!result.ok) {
          setProfileInvalid(true);
          setError(result.error?.message ?? t('entry.profile.failed'));
          return;
        }
        const value = result.value as { bot?: { browserProfile?: unknown } };
        setProfileOverride(
          typeof value.bot?.browserProfile === 'string' ? value.bot.browserProfile : '',
        );
        setPreview(undefined);
        store.setTab(undefined);
        infoStore.refresh();
      })
      .catch((cause: unknown) => {
        setProfileInvalid(true);
        setError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => {
        setBusy(false);
        store.refresh();
      });
  };

  return (
    <div className="bh-browser-body" style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.8 }}>{t('entry.profile.label')}</span>
        <ProfileCombobox
          value={currentProfile}
          profiles={[...info.profiles, ...(observation?.profiles ?? [])]}
          disabled={busy || botSlug === undefined}
          invalid={profileInvalid}
          errorId={errorId}
          onSelect={saveProfile}
          t={t}
        />
      </div>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ opacity: 0.8 }}>{t('entry.view.follow')}</span>
        <Switch
          checked={follow}
          onChange={onFollow}
          label={t('entry.view.follow')}
          disabled={botSlug === undefined}
        />
      </div>
      {observation?.frame === null || observation?.frame === undefined ? (
        <div style={{ opacity: 0.6 }}>{t('entry.view.noFrame')}</div>
      ) : (
        <img
          src={observation.frame}
          alt={t('entry.label')}
          style={{ width: '100%', borderRadius: 6, border: '1px solid currentColor' }}
        />
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} disabled={busy} onClick={onPause}>
          {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={busy}
          onClick={() =>
            invoke(OPEN_ENDPOINT, follow || preview === undefined ? {} : { tab: preview })
          }
        >
          {t(busy ? 'entry.view.opening' : 'entry.view.open')}
        </button>
        {observation?.running === true ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={busy}
            onClick={() => invoke(STOP_ENDPOINT)}
          >
            {t('entry.view.stop')}
          </button>
        ) : null}
      </div>
      {viewer === undefined ||
      observation?.target !== 'container' ||
      observation.viewerUrl !== viewer ? null : (
        <Modal
          open
          title={t('entry.view.container')}
          closeLabel={t('entry.view.close')}
          className="bh-browser-viewer"
          onClose={() => {
            setViewer(undefined);
            setInteraction(false);
          }}
        >
          <div className="bh-browser-viewer-controls">
            <button type="button" style={buttonStyle} disabled={busy} onClick={onPause}>
              {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
            </button>
            <span>{t('entry.view.interaction')}</span>
            <Switch
              checked={interaction && paused}
              label={t('entry.view.interaction')}
              onChange={(next) => {
                if (!next) {
                  setInteraction(false);
                  return;
                }
                if (busy || botSlug === undefined) return;
                setBusy(true);
                setError(undefined);
                void requestJson<{ takeover: boolean }>(TAKEOVER_ENDPOINT, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ slug: botSlug, active: true }),
                })
                  .then((result) => setInteraction(result.takeover))
                  .catch((cause: unknown) => setError(String(cause)))
                  .finally(() => {
                    setBusy(false);
                    store.refresh();
                  });
              }}
              disabled={busy}
            />
            <button
              type="button"
              style={buttonStyle}
              disabled={busy}
              onClick={() => invoke(STOP_ENDPOINT)}
            >
              {t('entry.view.stop')}
            </button>
          </div>
          <iframe
            key={interaction && paused ? 'interactive' : 'readonly'}
            src={viewer}
            title={t('entry.view.container')}
            tabIndex={interaction && paused ? 0 : -1}
            style={{
              width: '100%',
              height: 'min(70vh, 768px)',
              border: 0,
              pointerEvents: interaction && paused ? 'auto' : 'none',
            }}
          />
        </Modal>
      )}
      {tabs.length === 0 ? (
        <div style={{ opacity: 0.6 }}>{t('entry.view.noTabs')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {orderedTabs.map((tab) => (
            <button
              key={tab.targetId}
              type="button"
              className="bh-browser-tab"
              aria-current={tab.current ? true : undefined}
              aria-pressed={tab.targetId === focused}
              title={tab.url}
              onClick={() => onSelectTab(tab.targetId)}
            >
              <span className="bh-browser-tab-title">{tab.title === '' ? tab.url : tab.title}</span>
              {tab.title === '' ? null : <span className="bh-browser-tab-url">{tab.url}</span>}
            </button>
          ))}
        </div>
      )}
      {error !== undefined ? (
        <div id={errorId} role="alert" className="bh-browser-error">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function createBrowserBody(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserBodyView(props: Omit<ChannelSidebarEntryProps, 't'>): ReactElement {
    return <BrowserBody {...props} t={t} />;
  };
}

function createBrowserHeader(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserHeaderView(props: Omit<ChannelSidebarEntryProps, 't'>): ReactElement {
    return <BrowserHeaderAction key={props.botSlug} {...props} t={t} />;
  };
}

export function apply(ctx: BrowserClientContext): void {
  const t = ctx.locale.bind(LOCALE_NS);
  registerBrowserSettings(ctx, t);
  ctx.effect(() => {
    const sheet = document.createElement('style');
    sheet.textContent = styles;
    document.head.append(sheet);
    return () => sheet.remove();
  }, 'botharness-browser: styles');
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness-browser: dictionaries');
  ctx.inject(['channelSidebar', 'connection'], (sidebarCtx) => {
    const registry = (sidebarCtx as unknown as { channelSidebar?: ChannelSidebarRegistryLike })
      .channelSidebar;
    connectionRpc = (sidebarCtx as unknown as { connection?: { rpc?: ConnectionRpcLike } })
      .connection?.rpc;
    if (registry === undefined) return;
    ctx.effect(
      () =>
        registry.register({
          id: ENTRY_ID,
          icon: 'globe',
          label: t('entry.label'),
          order: 41,
          scope: 'personabot',
          component: createBrowserBody(t),
          headerAction: createBrowserHeader(t),
        }),
      'botharness-browser: channel sidebar entry',
    );
  });
}
