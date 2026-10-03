import {
  RemoteViewer,
  type ViewerLifecycleEvent,
} from '../../../client/src/client/remote-viewer/index.js';
import { BH } from '../../../client/src/client/remote-viewer/tokens.js';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
} from 'react';
import { isExitReport } from './viewer-state.js';
import { reportViewerEvent, viewerEventText } from './viewer-events.js';
import {
  LOCALE_NS,
  PHASE_LABEL,
  en,
  zh,
  type ComputerKey,
  type ComputerTranslate,
} from './locale.js';
import { Tooltip } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-client-ui-settings/client';

import { COMPUTER_SETTINGS_NAMESPACE, type ComputerSettings } from '../settings.js';
import type { ComputerStorage } from '../provider.js';
import {
  ComputerSettingsPrefs,
  ComputerSettingsRows,
  createComputerSettingsFace,
  type ComputerSettingsScope,
} from './settings-rows.js';
import { LocalComputerStatus } from './local-computer.js';
import { useMountedResource } from './mounted-resource.js';

import { AccessPowerIcon } from './access-power-icon.js';

const ACCESS_STYLE = `
.bh-computer-access-control { position: relative; display: flex; align-items: center; }
.bh-computer-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: ${BH.radiusMd}; background: transparent;
  color: ${BH.labelSecondary}; cursor: pointer;
}
.bh-computer-access-power:hover { background: ${BH.hoverFill}; }
.bh-computer-access-power[aria-pressed='true'] { color: ${BH.businessPrimary}; background: ${BH.hoverFill}; }
.bh-computer-access-power:focus-visible { outline: 2px solid ${BH.businessPrimary}; outline-offset: 2px; }
.bh-computer-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-computer-access-power.bh-access-failed { color: ${BH.errorPrimary}; }
.bh-computer-access-error { order: -1; padding: 0 4px; color: ${BH.errorPrimary}; font-size: 11px; line-height: 16px; white-space: nowrap; }

`;

export const name = 'botharness-computer-client';

export const inject = ['slots', 'channelSidebar', 'connection', 'locale'];

const STATUS_ENDPOINT = '/api/computer/status';
const START_ENDPOINT = '/api/computer/start';
const STOP_ENDPOINT = '/api/computer/stop';
const VIEWER_SRC = '/botharness-computer/viewer/';
const APPROVED_KEY = 'botharness-computer-start-approved';
const ENTRY_ID = 'botharness-computer';

type ComputerState = 'absent' | 'stopped' | 'running' | 'failed';
type ComputerPhase =
  | 'idle'
  | 'pulling'
  | 'starting'
  | 'running'
  | 'stopping'
  | 'exporting'
  | 'importing'
  | 'failed';

interface ComputerProgress {
  readonly percent?: number;
  readonly text?: string;
  readonly updatedAt?: number;
}

interface ComputerStatusPayload {
  readonly target?: 'local' | 'container';
  resolution?: string;
  readonly provider: string | null;
  readonly probe: { readonly available: boolean; readonly detail?: string };
  readonly exportDir?: string;
  readonly status: {
    readonly state: ComputerState;
    readonly phase?: ComputerPhase;
    readonly detail?: string;
    readonly progress?: ComputerProgress;
    readonly storage?: ComputerStorage;
  };
}

interface ChannelSidebarEntryProps {
  readonly scope: 'channel' | 'personabot';
  readonly channelId: string;
  readonly botSlug: string | undefined;
  readonly actions: unknown;
  readonly setExpanded?: (expanded: boolean) => void;
  readonly setExpandable?: (expandable: boolean) => void;
}

interface ConnectionRpcLike {
  call(
    channel: string,
    endpoint: string,
    payload: unknown,
    signal?: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: unknown }
    | { readonly ok: false; readonly error: { readonly message?: string } }
  >;
}

let connectionRpc: ConnectionRpcLike | undefined;

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly icon?: string;
    readonly order?: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
    readonly headerAction?: ComponentType<ChannelSidebarEntryProps>;
  }): () => void;
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
  return (await response.json()) as T;
}

const SETUP_GUIDANCE_KEY: ComputerKey = 'entry.setup';

const SHARED_NOTE_KEY: ComputerKey = 'entry.shared';

const AUTHORIZATION_POINTS: readonly ComputerKey[] = [
  'entry.authorize.probe',
  'entry.authorize.volume',
  'entry.authorize.pull',
  'entry.authorize.bind',
];

const noteStyle: CSSProperties = { opacity: 0.7, fontSize: 12, whiteSpace: 'pre-wrap' };
const buttonStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: `1px solid ${BH.borderL3}`,
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
};
const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  border: `1px solid ${BH.buttonPrimaryFill}`,
  background: BH.buttonPrimaryFill,
  color: BH.labelPrimaryForeground,
};
const terminalStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  opacity: 0.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function designOf(resolution: string | undefined): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/u.exec(resolution ?? '');
  if (match === null) return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  return { width: Number(match[1]), height: Number(match[2]) };
}

export interface RecentLogRow {
  readonly id: number;
  readonly ts: number;
  readonly plugin: string;
  readonly owner: string;
  readonly kind: string;
  readonly detail: string;
}

export function RecentLogsList({
  entries,
}: {
  readonly entries: readonly RecentLogRow[];
}): ReactElement {
  return (
    <div style={terminalStyle}>
      {entries.map((entry) => (
        <div key={entry.id}>
          {new Date(entry.ts).toLocaleTimeString()} [{entry.kind}] {entry.detail}
        </div>
      ))}
    </div>
  );
}

export function RecentLogs({ t }: { readonly t: ComputerTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly RecentLogRow[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const loadResource = useMountedResource<HTMLSpanElement>(() => {
    const controller = new AbortController();
    requestJson<{ entries: RecentLogRow[] }>('/api/computer/logs?limit=10', {
      signal: controller.signal,
    })
      .then((result) => {
        if (!controller.signal.aborted) setEntries(result.entries);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <div>
      {open && entries === undefined && !failed ? <span hidden ref={loadResource} /> : null}
      <button type="button" onClick={() => setOpen(!open)} style={buttonStyle}>
        {t('entry.recentLogs')}
      </button>
      {open ? (
        failed ? (
          <div style={noteStyle}>{t('entry.recentLogs.failed')}</div>
        ) : entries === undefined ? (
          <div style={noteStyle}>…</div>
        ) : entries.length === 0 ? (
          <div style={noteStyle}>{t('entry.recentLogs.empty')}</div>
        ) : (
          <RecentLogsList entries={entries} />
        )
      ) : null}
    </div>
  );
}

export {
  ScreenIndicator,
  StreamOverlay,
  ViewerTitleBar,
} from '../../../client/src/client/remote-viewer/index.js';

function RunningCard({
  t,
  botSlug,
  busy,
  stopping,
  resolution,
  onStop,
}: {
  readonly t: ComputerTranslate;
  readonly botSlug: string | undefined;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly resolution?: string;
  readonly onStop: () => void;
}): ReactElement {
  const onEvent = useCallback((event: ViewerLifecycleEvent) => {
    void reportViewerEvent(undefined, viewerEventText(event));
  }, []);
  return (
    <RemoteViewer
      t={t}
      title={t('entry.screen.title', { name: botSlug ?? 'PersonaBot' })}
      src={VIEWER_SRC}
      design={designOf(resolution)}
      busy={busy}
      stopping={stopping}
      onStop={onStop}
      footer={<RecentLogs t={t} />}
      onEvent={onEvent}
    />
  );
}

export interface ComputerEntryViewProps {
  readonly t: ComputerTranslate;
  readonly state: ComputerState;
  readonly phase?: ComputerPhase;
  readonly detail?: string;
  readonly progress?: ComputerProgress;
  readonly runtimeAvailable: boolean;
  readonly confirming: boolean;
  readonly busy: boolean;
  readonly elapsed: number;
  readonly nowTs: number;
  readonly error?: string;
  readonly botSlug?: string;
  readonly storage?: ComputerStorage;
  readonly resolution?: string;
  readonly onStart: () => void;
  readonly onConfirmStart: () => void;
  readonly onStop: () => void;
  readonly onApprove: (remember: boolean) => void;
  readonly onCancel: () => void;
}

export function ComputerEntryView(props: ComputerEntryViewProps): ReactElement {
  const {
    t,
    state,
    phase,
    detail,
    progress,
    runtimeAvailable,
    confirming,
    busy,
    elapsed,
    nowTs,
    error,
    botSlug,
    storage,
    resolution,
    onStart,
    onConfirmStart,
    onStop,
    onApprove,
    onCancel,
  } = props;

  if (!runtimeAvailable) {
    return <div style={noteStyle}>{t(SETUP_GUIDANCE_KEY)}</div>;
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div style={{ opacity: 0.8 }}>{t('entry.authorizeIntro')}</div>
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6, opacity: 0.85 }}>
          {AUTHORIZATION_POINTS.map((point) => (
            <li key={point}>{t(point)}</li>
          ))}
        </ul>
        {storage === undefined ? null : (
          <div style={{ opacity: 0.85 }}>
            {t('entry.authorize.storage', { target: storage.target })}
            {storage.ignoredReason === undefined ? '' : `（${storage.ignoredReason}）`}
          </div>
        )}
        {storage?.migrationHint === undefined ? null : (
          <div style={{ opacity: 0.85 }}>{storage.migrationHint}</div>
        )}
        {storage?.kind === 'bind' ? (
          <div style={{ opacity: 0.85 }}>{t('entry.authorize.storageBindRisk')}</div>
        ) : null}
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.85 }}>
          <input type="checkbox" onChange={(event) => onApprove(event.target.checked)} />
          {t('entry.remember')}
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={buttonStyle} onClick={onCancel}>
            {t('entry.cancel')}
          </button>
          <button type="button" style={primaryButtonStyle} onClick={onConfirmStart}>
            {t('entry.authorize')}
          </button>
        </div>
      </div>
    );
  }

  const inProgress =
    phase === 'pulling' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'exporting' ||
    phase === 'importing';

  if (state === 'running') {
    return (
      <RunningCard
        t={t}
        botSlug={botSlug}
        busy={busy}
        stopping={phase === 'stopping'}
        {...(resolution === undefined ? {} : { resolution })}
        onStop={onStop}
      />
    );
  }

  if (inProgress) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div>{t(PHASE_LABEL[phase] ?? 'entry.phase.working')}…</div>
        <div
          style={{
            position: 'relative',
            overflow: 'hidden',
            height: 6,
            borderRadius: 3,
            background: BH.borderL4,
          }}
        >
          <div
            style={
              progress?.percent === undefined
                ? {
                    position: 'absolute',
                    inset: 0,
                    background: BH.businessPrimary,
                  }
                : {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${String(progress.percent)}%`,
                    background: BH.businessPrimary,
                  }
            }
          />
        </div>
        <div style={terminalStyle}>{progress?.text ?? detail ?? t('entry.wait')}</div>
        <div style={{ opacity: 0.5 }}>
          {t('entry.elapsed', { seconds: elapsed })}
          {progress?.updatedAt === undefined
            ? ''
            : ` · ${t('entry.updated', {
                seconds: Math.max(0, Math.round((nowTs - progress.updatedAt) / 1000)),
              })}`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={noteStyle}>
        {error ?? (isExitReport(detail) ? undefined : detail) ?? t(SHARED_NOTE_KEY)}
      </div>
      <button type="button" style={primaryButtonStyle} disabled={busy} onClick={onStart}>
        {busy ? t('entry.starting') : t('entry.start')}
      </button>
    </div>
  );
}

export function createComputerEntry(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement {
  return function ComputerEntryWithLocale(props: ChannelSidebarEntryProps): ReactElement {
    return <ComputerEntry {...props} t={t} />;
  };
}

interface BotInfo {
  readonly displayName: string | undefined;
  readonly computerAccess: boolean | undefined;
}

interface ReadableStore<T> {
  subscribe(listener: () => void): () => void;
  getSnapshot(): T;
}

function createBotInfoStore(
  botSlug: string | undefined,
): ReadableStore<BotInfo> & { setAccess(enabled: boolean): void } {
  let info: BotInfo = { displayName: undefined, computerAccess: undefined };
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
          bots?: readonly { slug?: unknown; displayName?: unknown; computerAccess?: unknown }[];
        };
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (match === undefined) return;
        info = {
          displayName:
            typeof match.displayName === 'string' && match.displayName.length > 0
              ? match.displayName
              : undefined,
          computerAccess: match.computerAccess === true,
        };
        for (const listener of listeners) listener();
      })
      .catch(() => undefined);
  };
  return {
    setAccess(enabled) {
      info = { ...info, computerAccess: enabled };
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
  };
}

function useBotInfo(botSlug: string | undefined): BotInfo {
  const [store] = useState(() => createBotInfoStore(botSlug));
  const info = useSyncExternalStore(store.subscribe, store.getSnapshot);
  return { displayName: info.displayName ?? botSlug, computerAccess: info.computerAccess };
}

function ComputerHeaderAction({
  botSlug,
  t,
  setExpandable,
  setExpanded,
}: ChannelSidebarEntryProps & { t: ComputerTranslate }): ReactElement {
  const [store] = useState(() => createBotInfoStore(botSlug));
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState(false);
  const subscribe = (listener: () => void): (() => void) => {
    const sync = (): void => {
      const access = store.getSnapshot().computerAccess === true;
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
  const accessOn = info.computerAccess === true;

  const onToggle = (next: boolean): void => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(false);
    void rpc
      .call('/api', 'botharness/computerAccessSet', { args: { slug: botSlug, enabled: next } })
      .then((result) => {
        if (!result.ok) {
          setError(true);
          return;
        }
        const value = result.value as { bot?: { computerAccess?: unknown } };
        const applied = value.bot?.computerAccess === true;
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
    <span className="bh-computer-access-control">
      <Tooltip
        label={error ? t('entry.access.failed') + ': ' + label : label}
        side="bottom"
        delayMs={500}
      >
        <button
          type="button"
          className={`bh-computer-access-power${error ? ' bh-access-failed' : ''}`}
          aria-label={label}
          aria-pressed={accessOn}
          aria-busy={busy}
          disabled={
            busy ||
            botSlug === undefined ||
            connectionRpc === undefined ||
            info.computerAccess === undefined
          }
          onClick={() => onToggle(!accessOn)}
        >
          <AccessPowerIcon />
        </button>
      </Tooltip>
      {error ? (
        <span className="bh-computer-access-error" role="alert" title={t('entry.access.failed')}>
          {t('entry.access.failureHint')}
        </span>
      ) : null}
    </span>
  );
}

export function createComputerHeader(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement {
  return function ComputerHeaderWithLocale(props: ChannelSidebarEntryProps): ReactElement {
    return <ComputerHeaderAction key={props.botSlug} {...props} t={t} />;
  };
}

function ComputerEntry({
  botSlug,
  t,
}: ChannelSidebarEntryProps & { t: ComputerTranslate }): ReactElement {
  const { displayName } = useBotInfo(botSlug);
  const [payload, setPayload] = useState<ComputerStatusPayload | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(
    () => globalThis.sessionStorage?.getItem(APPROVED_KEY) === '1',
  );
  const [elapsed, setElapsed] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const next = await requestJson<ComputerStatusPayload>(
        STATUS_ENDPOINT,
        signal === undefined ? undefined : { signal },
      );
      if (signal?.aborted) return;
      setPayload(next);
      setError(undefined);
    } catch (cause) {
      if (!signal?.aborted) setError(String(cause));
    }
  }, []);

  const statusResource = useMountedResource<HTMLDivElement>(() => {
    const controller = new AbortController();
    let pending = false;
    const poll = async (): Promise<void> => {
      if (pending || controller.signal.aborted) return;
      pending = true;
      try {
        await refresh(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
      } finally {
        pending = false;
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), 3000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [refresh]);

  const phase = payload?.status.phase;
  const inProgress =
    phase === 'pulling' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'exporting' ||
    phase === 'importing';

  const progressResource = useMountedResource<HTMLSpanElement>(() => {
    const startedAt = Date.now();
    setElapsed(0);
    const timer = setInterval(() => {
      setNowTs(Date.now());
      setElapsed(Math.round((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

  const act = useCallback(
    async (endpoint: string) => {
      setBusy(true);
      try {
        await requestJson(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            authorize: true,
            ...(endpoint === START_ENDPOINT && typeof navigator !== 'undefined'
              ? { language: navigator.language }
              : {}),
          }),
        });
        await refresh();
      } catch (cause) {
        setError(String(cause));
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  const onStart = useCallback(() => {
    if (!approved) {
      setConfirming(true);
      return;
    }
    void act(START_ENDPOINT);
  }, [act, approved]);

  const onConfirmStart = useCallback(() => {
    setConfirming(false);
    void act(START_ENDPOINT);
  }, [act]);

  const onApprove = useCallback((remember: boolean) => {
    if (remember) {
      globalThis.sessionStorage?.setItem(APPROVED_KEY, '1');
      setApproved(true);
    }
  }, []);

  return (
    <div ref={statusResource} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {inProgress ? <span hidden ref={progressResource} /> : null}
      {payload?.target === 'local' ? (
        <LocalComputerStatus t={t} />
      ) : (
        <ComputerEntryView
          t={t}
          state={payload?.status.state ?? 'absent'}
          {...(phase === undefined ? {} : { phase })}
          {...(payload?.status.detail === undefined ? {} : { detail: payload.status.detail })}
          {...(payload?.status.progress === undefined ? {} : { progress: payload.status.progress })}
          runtimeAvailable={payload?.probe.available ?? true}
          confirming={confirming}
          busy={busy}
          elapsed={elapsed}
          nowTs={nowTs}
          {...(error === undefined ? {} : { error })}
          {...(displayName === undefined ? {} : { botSlug: displayName })}
          {...(payload?.status.storage === undefined ? {} : { storage: payload.status.storage })}
          {...(payload?.resolution === undefined ? {} : { resolution: payload.resolution })}
          onStart={onStart}
          onConfirmStart={onConfirmStart}
          onStop={() => void act(STOP_ENDPOINT)}
          onApprove={onApprove}
          onCancel={() => setConfirming(false)}
        />
      )}
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  const settingsPrefs = new ComputerSettingsPrefs();
  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<ComputerSettings>(
      COMPUTER_SETTINGS_NAMESPACE,
    ) as unknown as ComputerSettingsScope;
    const release = settingsPrefs.attach(scope);
    return () => {
      release();
    };
  });
  ctx.inject(['uiWorkspace', 'slots'], (workspaceCtx) => {
    const workspace = (
      workspaceCtx as unknown as { uiWorkspace?: { pickDirectory?: () => Promise<string | null> } }
    ).uiWorkspace;
    const face = createComputerSettingsFace({
      prefs: settingsPrefs,
      pickDirectory: workspace?.pickDirectory?.bind(workspace),
    });
    workspaceCtx.slots.inject('botharness.settings.item', () =>
      workspaceCtx.slots.register(
        {
          name: 'botharness.settings.item',
          id: 'computer',
          order: 10,
          locale: LOCALE_NS,
          inject: () => face,
        },
        ComputerSettingsRows,
      ),
    );
  });
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const style = document.createElement('style');
    style.setAttribute('data-botharness-computer', 'client');
    style.textContent = ACCESS_STYLE;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, 'botharness-computer: client styles');
  const t = ctx.locale.bind(LOCALE_NS);
  ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh, en }), 'botharness-computer: dictionaries');
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
          icon: 'monitor',
          label: t('entry.label'),
          order: 40,
          scope: 'personabot',
          component: createComputerEntry(t),
          headerAction: createComputerHeader(t),
        }),
      'botharness-computer: channel sidebar entry',
    );
  });
}
