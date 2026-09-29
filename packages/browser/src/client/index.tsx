import { useState, useSyncExternalStore, type ComponentType, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

import { LOCALE_NS, en, zh, type BrowserTranslate } from './locale.js';

const ENTRY_ID = 'botharness-browser';
const STATUS_ENDPOINT = '/api/browser/status';
const OBSERVATION_ENDPOINT = '/api/browser/observation';
const TAKEOVER_ENDPOINT = '/api/browser/takeover';
const OPEN_ENDPOINT = '/api/browser/open';
const STOP_ENDPOINT = '/api/browser/stop';

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
}

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly order: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
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
}

interface BrowserStatus {
  readonly running: boolean;
  readonly url: string | null;
  readonly binary: string | null;
}

interface BrowserView {
  readonly running: boolean;
  readonly frame: string | null;
  readonly takeover: boolean;
  readonly tabs: number;
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
  let info: BotInfoView = { displayName: undefined, browserAccess: undefined };
  const listeners = new Set<() => void>();
  const load = (): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined) return;
    void rpc
      .call('/api', 'botharness/list', { args: {} })
      .then((result) => {
        if (!result.ok) return;
        const value = result.value as {
          bots?: readonly { slug?: unknown; displayName?: unknown; browserAccess?: unknown }[];
        };
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          browserAccess: typeof match.browserAccess === 'boolean' ? match.browserAccess : undefined,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
    subscribe(listener) {
      if (listeners.size === 0) load();
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => info,
  };
}

interface PollingStore<T> extends ReadableStore<T | undefined> {
  refresh(): void;
}

function createPollingStore<T>(url: string, intervalMs: number): PollingStore<T> {
  let value: T | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  const refresh = async (): Promise<void> => {
    try {
      value = await requestJson<T>(url);
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
        timer = setInterval(() => void refresh(), intervalMs);
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
    refresh: () => void refresh(),
  };
}

function viewEndpoint(botSlug: string | undefined): string {
  return `${OBSERVATION_ENDPOINT}?slug=${encodeURIComponent(botSlug ?? '')}`;
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

function BrowserEntryView({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  const [botInfoStore] = useState(() => createBotInfoStore(botSlug));
  const [statusStore] = useState(() => createPollingStore<BrowserStatus>(STATUS_ENDPOINT, 3000));
  const [viewStore] = useState(() => createPollingStore<BrowserView>(viewEndpoint(botSlug), 1500));
  const botInfo = useSyncExternalStore(botInfoStore.subscribe, botInfoStore.getSnapshot);
  const status = useSyncExternalStore(statusStore.subscribe, statusStore.getSnapshot);
  const view = useSyncExternalStore(viewStore.subscribe, viewStore.getSnapshot);
  const [accessOverride, setAccessOverride] = useState<boolean | undefined>(undefined);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [takeoverBusy, setTakeoverBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const accessOn = accessOverride ?? botInfo.browserAccess === true;
  const running = status?.running === true || view?.running === true;
  const takeover = view?.takeover === true;

  const onToggleAccess = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || accessBusy) return;
    const previous = accessOn;
    setAccessError(undefined);
    setAccessOverride(next);
    setAccessBusy(true);
    void rpc
      .call('/api', 'botharness/browserAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setAccessOverride(previous);
          setAccessError(result.error?.message ?? t('entry.access.failed'));
          return;
        }
        const value = result.value as { bot?: { browserAccess?: unknown } };
        setAccessOverride(value.bot?.browserAccess === true);
      })
      .catch((cause: unknown) => {
        setAccessOverride(previous);
        setAccessError(cause instanceof Error ? cause.message : String(cause));
      })
      .finally(() => setAccessBusy(false));
  };

  const invoke = (endpoint: string): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void requestJson<{ ok: boolean }>(endpoint, { method: 'POST' })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        setBusy(false);
        statusStore.refresh();
        viewStore.refresh();
      });
  };

  const onToggleTakeover = (): void => {
    if (takeoverBusy || botSlug === undefined) return;
    const next = view?.takeover !== true;
    setTakeoverBusy(true);
    setError(undefined);
    void requestJson<{ ok: boolean; takeover: boolean }>(TAKEOVER_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ slug: botSlug, active: next }),
    })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => {
        setTakeoverBusy(false);
        viewStore.refresh();
      });
  };

  return (
    <div style={{ display: 'grid', gap: 8, fontSize: 12.5 }}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
      >
        <span style={{ opacity: 0.85 }}>{t('entry.access.title')}</span>
        <Switch
          checked={accessOn}
          disabled={accessBusy || botSlug === undefined}
          onChange={onToggleAccess}
          label={t('entry.access.title')}
        />
      </div>
      <div style={{ opacity: 0.7 }}>{t('entry.access.description')}</div>
      {accessError !== undefined ? <div>{accessError}</div> : null}
      <div style={{ opacity: 0.8 }}>
        {running
          ? `${t('entry.status.running')}${status?.url === null || status?.url === undefined ? '' : ` · ${t('entry.status.url', { url: status.url })}`}`
          : t('entry.status.stopped')}
      </div>
      {status?.binary === null || status?.binary === undefined ? null : (
        <div style={{ opacity: 0.6, wordBreak: 'break-all' }}>
          {t('entry.binary', { path: status.binary })}
        </div>
      )}
      {view?.frame === null || view?.frame === undefined ? (
        <div style={{ opacity: 0.6 }}>{t('entry.view.noFrame')}</div>
      ) : (
        <img
          src={view.frame}
          alt={t('entry.view.title')}
          style={{ width: '100%', borderRadius: 6, border: '1px solid currentColor' }}
        />
      )}
      {view === undefined ? null : (
        <div style={{ opacity: 0.7 }}>{t('entry.view.tabs', { count: view.tabs })}</div>
      )}
      {takeover ? <div>{t('entry.view.taken')}</div> : null}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={busy}
          onClick={() => invoke(OPEN_ENDPOINT)}
        >
          {t(busy ? 'entry.opening' : 'entry.open')}
        </button>
        {running ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={busy}
            onClick={() => invoke(STOP_ENDPOINT)}
          >
            {t(busy ? 'entry.stopping' : 'entry.stop')}
          </button>
        ) : null}
        {running ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={takeoverBusy}
            onClick={onToggleTakeover}
          >
            {t(takeover ? 'entry.view.release' : 'entry.view.takeover')}
          </button>
        ) : null}
      </div>
      {error !== undefined ? <div>{error}</div> : null}
      <div style={{ opacity: 0.6 }}>{t('entry.hint')}</div>
    </div>
  );
}

function createBrowserEntry(t: BrowserTranslate): ComponentType<ChannelSidebarEntryProps> {
  return function BrowserEntry(props: Omit<ChannelSidebarEntryProps, 't'>): ReactElement {
    return <BrowserEntryView {...props} t={t} />;
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
          component: createBrowserEntry(t),
        }),
      'botharness-browser: channel sidebar entry',
    );
  });
}
