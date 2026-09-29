import {
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ComponentType,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

import { LOCALE_NS, en, zh, type BrowserTranslate } from './locale.js';

const ENTRY_ID = 'botharness-browser';
const OBSERVATION_ENDPOINT = '/api/browser/observation';
const TAKEOVER_ENDPOINT = '/api/browser/takeover';
const OPEN_ENDPOINT = '/api/browser/open';
const STOP_ENDPOINT = '/api/browser/stop';

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
}

interface BrowserTabView {
  readonly targetId: string;
  readonly url: string;
  readonly title: string;
  readonly current: boolean;
}

interface BrowserObservation {
  readonly running: boolean;
  readonly frame: string | null;
  readonly focused: string | null;
  readonly takeover: boolean;
  readonly tabs: readonly BrowserTabView[];
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

function createBotInfoStore(botSlug: string | undefined): ReadableStore<BotInfoView> {
  let info: BotInfoView = {
    displayName: undefined,
    browserAccess: undefined,
    browserProfile: undefined,
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
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          browserAccess: typeof match.browserAccess === 'boolean' ? match.browserAccess : undefined,
          browserProfile:
            typeof match.browserProfile === 'string' && match.browserProfile !== ''
              ? match.browserProfile
              : undefined,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
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
  const listeners = new Set<() => void>();
  const refresh = async (): Promise<void> => {
    try {
      value = await requestJson<BrowserObservation>(observationUrl(botSlug, tab));
    } catch {
      value = undefined;
    }
    for (const listener of listeners) listener();
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
  const [override, setOverride] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const subscribe = (listener: () => void): (() => void) => {
    const sync = (): void => {
      const access = override ?? store.getSnapshot().browserAccess === true;
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
  const accessOn = override ?? info.browserAccess === true;

  const onToggle = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || busy) return;
    const previous = accessOn;
    setOverride(next);
    setBusy(true);
    setExpandable?.(next);
    if (next) setExpanded?.(true);
    void rpc
      .call('/api', 'botharness/browserAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setOverride(previous);
          setExpandable?.(previous);
          return;
        }
        const value = result.value as { bot?: { browserAccess?: unknown } };
        const applied = value.bot?.browserAccess === true;
        setOverride(applied);
        setExpandable?.(applied);
      })
      .catch(() => {
        setOverride(previous);
        setExpandable?.(previous);
      })
      .finally(() => setBusy(false));
  };

  return (
    <Switch
      checked={accessOn}
      disabled={busy || botSlug === undefined}
      onChange={onToggle}
      label={t('entry.access.title')}
    />
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

const tabRowStyle = {
  display: 'block',
  width: '100%',
  textAlign: 'left',
  padding: '3px 6px',
  borderRadius: 4,
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
} as const;

function BrowserBody({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  const [store] = useState(() => createObservationStore(botSlug));
  const [infoStore] = useState(() => createBotInfoStore(botSlug));
  const observation = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const info = useSyncExternalStore(infoStore.subscribe, infoStore.getSnapshot);
  const [follow, setFollow] = useState(true);
  const [preview, setPreview] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<string | undefined>(undefined);
  const [profileOverride, setProfileOverride] = useState<string | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const tabs = observation?.tabs ?? [];
  const focused = observation?.focused ?? null;
  const focusedTab = tabs.find((tab) => tab.targetId === focused);
  const paused = observation?.takeover === true;

  const invoke = (endpoint: string, init?: RequestInit): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void requestJson<{ ok: boolean }>(endpoint, { method: 'POST', ...init })
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
      store.setTab(preview);
    }
  };

  const onSelectTab = (targetId: string): void => {
    setFollow(false);
    setPreview(targetId);
    store.setTab(targetId);
  };

  const onPause = (): void => {
    if (botSlug === undefined) return;
    invoke(TAKEOVER_ENDPOINT, {
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: botSlug, active: !paused }),
    });
  };

  const currentProfile = profileOverride ?? info.browserProfile ?? '';

  const saveProfile = (): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || draft === undefined) return;
    const next = draft.trim();
    setDraft(undefined);
    if (next === currentProfile) return;
    setError(undefined);
    void rpc
      .call('/api', 'botharness/browserProfileSet', { args: { slug: botSlug, profile: next } })
      .then((result) => {
        if (!result.ok) {
          setError(result.error?.message ?? t('entry.profile.failed'));
          return;
        }
        const value = result.value as { bot?: { browserProfile?: unknown } };
        setProfileOverride(
          typeof value.bot?.browserProfile === 'string' ? value.bot.browserProfile : '',
        );
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  };

  const onProfileChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
  };

  const onProfileKey = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') saveProfile();
  };

  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ opacity: 0.8 }}>{t('entry.profile.label')}</span>
        <input
          value={draft ?? currentProfile}
          placeholder={t('entry.profile.default')}
          disabled={botSlug === undefined}
          onChange={onProfileChange}
          onBlur={saveProfile}
          onKeyDown={onProfileKey}
          style={{
            flex: 1,
            minWidth: 0,
            padding: '2px 6px',
            borderRadius: 4,
            border: '1px solid currentColor',
            background: 'transparent',
            color: 'inherit',
            fontSize: 12,
          }}
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
      {paused ? <div style={{ opacity: 0.8 }}>{t('entry.view.paused')}</div> : null}
      {observation?.frame === null || observation?.frame === undefined ? (
        <div style={{ opacity: 0.6 }}>{t('entry.view.noFrame')}</div>
      ) : (
        <img
          src={observation.frame}
          alt={t('entry.label')}
          style={{ width: '100%', borderRadius: 6, border: '1px solid currentColor' }}
        />
      )}
      {focusedTab === undefined ? null : (
        <div style={{ opacity: 0.7, wordBreak: 'break-all' }}>
          {focusedTab.title === '' ? focusedTab.url : focusedTab.title}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={buttonStyle} disabled={busy} onClick={onPause}>
          {t(paused ? 'entry.view.resume' : 'entry.view.pause')}
        </button>
        <button
          type="button"
          style={buttonStyle}
          disabled={busy}
          onClick={() => invoke(OPEN_ENDPOINT)}
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
      {tabs.length === 0 ? (
        <div style={{ opacity: 0.6 }}>{t('entry.view.noTabs')}</div>
      ) : (
        <div style={{ display: 'grid', gap: 2 }}>
          {tabs.map((tab) => (
            <button
              key={tab.targetId}
              type="button"
              style={{
                ...tabRowStyle,
                opacity: tab.targetId === focused ? 1 : 0.75,
                fontWeight: tab.targetId === focused ? 600 : 400,
              }}
              title={tab.url}
              onClick={() => onSelectTab(tab.targetId)}
            >
              {tab.title === '' ? tab.url : tab.title}
            </button>
          ))}
        </div>
      )}
      {error !== undefined ? <div>{error}</div> : null}
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
    return <BrowserHeaderAction {...props} t={t} />;
  };
}

export function apply(ctx: BrowserClientContext): void {
  const t = ctx.locale.bind(LOCALE_NS);
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
