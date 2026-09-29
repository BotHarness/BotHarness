/**
 * Browser entry for the Channel sidebar: the Browser Access switch, the Bot
 * Browser status, and the Human's Open/Stop actions. The entry is our own
 * surface over the authenticated Host routes the browser plugin serves
 * (ADR-0089); it never talks to the browser directly.
 * @module @botharness/browser/client
 */

import { useCallback, useEffect, useState, type ComponentType, type ReactElement } from 'react';
import { Switch } from '@deepseek-ai/dsh-client-ui-primitives';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

import { LOCALE_NS, en, zh, type BrowserTranslate } from './locale.js';

const ENTRY_ID = 'botharness-browser';
const STATUS_ENDPOINT = '/api/browser/status';
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

/** Structural mirror of `@botharness/ui`'s Channel sidebar registry seam. */
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

interface BotInfo {
  displayName: string | undefined;
  browserAccess: boolean | undefined;
}

/** Resolves the PersonaBot's Browser Access through the BotHarness bridge. */
function useBotInfo(botSlug: string | undefined): BotInfo {
  const [info, setInfo] = useState<BotInfo>({
    displayName: undefined,
    browserAccess: undefined,
  });

  useEffect(() => {
    setInfo({ displayName: undefined, browserAccess: undefined });
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined) return () => {};
    let cancelled = false;
    void rpc
      .call('/api', 'botharness/list', { args: {} })
      .then((result) => {
        if (cancelled || !result.ok) return;
        const value = result.value as {
          bots?: readonly { slug?: unknown; displayName?: unknown; browserAccess?: unknown }[];
        };
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        setInfo({
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          browserAccess: typeof match.browserAccess === 'boolean' ? match.browserAccess : undefined,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botSlug]);

  return { displayName: info.displayName ?? botSlug, browserAccess: info.browserAccess };
}

interface BrowserStatus {
  readonly running: boolean;
  readonly url: string | null;
  readonly binary: string | null;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...init });
  const body = (await response.json()) as T & { ok?: boolean; error?: string };
  if (!response.ok || body.ok === false) {
    throw new Error(body.error ?? `HTTP ${String(response.status)}`);
  }
  return body;
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
  const { browserAccess } = useBotInfo(botSlug);
  const [accessOverride, setAccessOverride] = useState<boolean | undefined>(undefined);
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<BrowserStatus | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const accessOn = accessOverride ?? browserAccess === true;

  const onToggleAccess = useCallback(
    (next: boolean) => {
      const rpc = connectionRpc;
      if (rpc === undefined || botSlug === undefined || accessBusy) return;
      const previous = accessOverride ?? browserAccess === true;
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
    },
    [accessBusy, accessOverride, botSlug, browserAccess, t],
  );

  const refresh = useCallback(async () => {
    try {
      setStatus(await requestJson<BrowserStatus>(STATUS_ENDPOINT));
    } catch {
      setStatus(undefined);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const invoke = useCallback(
    (endpoint: string) => {
      if (busy) return;
      setBusy(true);
      setError(undefined);
      void requestJson<{ ok: boolean }>(endpoint, { method: 'POST' })
        .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => {
          setBusy(false);
          void refresh();
        });
    },
    [busy, refresh],
  );

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
        {status?.running === true
          ? `${t('entry.status.running')}${status.url === null ? '' : ` · ${t('entry.status.url', { url: status.url })}`}`
          : t('entry.status.stopped')}
      </div>
      {status?.binary === null || status?.binary === undefined ? null : (
        <div style={{ opacity: 0.6, wordBreak: 'break-all' }}>
          {t('entry.binary', { path: status.binary })}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          style={buttonStyle}
          disabled={busy}
          onClick={() => invoke(OPEN_ENDPOINT)}
        >
          {t(busy ? 'entry.opening' : 'entry.open')}
        </button>
        {status?.running === true ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={busy}
            onClick={() => invoke(STOP_ENDPOINT)}
          >
            {t(busy ? 'entry.stopping' : 'entry.stop')}
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
