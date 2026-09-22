import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import {
  LOCALE_NS,
  PHASE_LABEL,
  en,
  zh,
  type ComputerKey,
  type ComputerTranslate,
} from './locale.js';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client';

import { COMPUTER_SETTINGS_NAMESPACE, type ComputerSettings } from '../settings.js';
import {
  ComputerSettingsPrefs,
  ComputerSettingsRows,
  createComputerSettingsFace,
  type ComputerSettingsScope,
} from './settings-rows.js';

export const name = 'botharness-computer-client';

/**
 * The Channel sidebar registry is a client-side service provided by
 * `@botharness/client`; the entry types are duplicated structurally so this
 * bundle stays self-contained (importing that package at runtime would inline
 * its client code into ours).
 */
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
  readonly provider: string | null;
  readonly probe: { readonly available: boolean; readonly detail?: string };
  readonly exportDir?: string;
  readonly status: {
    readonly state: ComputerState;
    readonly phase?: ComputerPhase;
    readonly detail?: string;
    readonly progress?: ComputerProgress;
  };
}

interface ChannelSidebarEntryProps {
  readonly scope: 'channel' | 'personabot';
  readonly channelId: string;
  readonly botSlug: string | undefined;
  readonly actions: unknown;
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

/** Captured from the client connection service so entries can read PersonaBot names. */
let connectionRpc: ConnectionRpcLike | undefined;

interface ChannelSidebarRegistryLike {
  register(entry: {
    readonly id: string;
    readonly label: string;
    readonly order?: number;
    readonly scope: 'channel' | 'personabot';
    readonly component: ComponentType<ChannelSidebarEntryProps>;
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
  border: '1px solid var(--dsh-border, #3a3a3a)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: 12,
};
const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--dsh-accent, #4d6bfe)',
  background: 'var(--dsh-accent, #4d6bfe)',
  color: '#fff',
};
const terminalStyle: CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 11,
  opacity: 0.7,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-all',
};

/** Logical viewport the viewer renders at; the wrapper scales it to fit. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

const SPIN_STYLE = `
@keyframes bc-spin { to { transform: rotate(360deg); } }
`;

/**
 * Watches the same-origin viewer document: reports when its stream surface is
 * live and, after a loss (e.g. the Selkies session was closed from its own UI),
 * reports the loss again so the caller can reconnect.
 */
function useFrameReady(iframeRef: RefObject<HTMLIFrameElement>, active: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return () => {};
    }
    let cancelled = false;
    let misses = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      if (cancelled) return;
      let live = false;
      try {
        const doc = iframeRef.current?.contentDocument ?? null;
        const surface = doc?.getElementById('videoCanvas') as
          | HTMLVideoElement
          | HTMLCanvasElement
          | null;
        if (surface !== null) {
          const width = surface instanceof HTMLVideoElement ? surface.videoWidth : surface.width;
          live = width > 0;
        }
      } catch {
        live = false;
      }
      if (live) {
        misses = 0;
        setReady(true);
      } else {
        misses += 1;
        if (misses >= 3) setReady(false);
      }
      timer = setTimeout(check, 1000);
    };
    timer = setTimeout(check, 300);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [iframeRef, active]);

  return ready;
}

/** Centered spinner over black; the shared connecting/retrying indicator. */
export function ScreenIndicator({ label = '连接中' }: { readonly label?: string }): ReactElement {
  const size = 26;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: '#000',
        color: '#fff',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
        <svg
          width={size}
          height={size}
          style={{ animation: 'bc-spin 1.1s linear infinite' }}
          aria-hidden="true"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.18)"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#fff"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${String(circumference * 0.28)} ${String(circumference * 0.72)}`}
          />
        </svg>
        <span style={{ fontSize: 12.5, opacity: 0.7 }}>{label}</span>
      </div>
    </div>
  );
}

interface ScaledFrameProps {
  readonly title: string;
  /** Interactive frames forward input; the inline card keeps a hover mask. */
  readonly interactive: boolean;
  /** `width` keeps a fixed aspect card; `contain` fits the whole box (fullscreen). */
  readonly fit?: 'width' | 'contain';
  readonly iframeRef?: RefObject<HTMLIFrameElement>;
}

/** Fixed-aspect card (or fullscreen surface) that scales the viewer to fit. */
function ScaledFrame({
  title,
  interactive,
  fit = 'width',
  iframeRef,
}: ScaledFrameProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT });

  useEffect(() => {
    const element = ref.current;
    if (element === null) return () => {};
    const update = (): void => setBox({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const scale =
    fit === 'contain'
      ? Math.min(box.width / DESIGN_WIDTH, box.height / DESIGN_HEIGHT)
      : box.width / DESIGN_WIDTH;
  const offsetX = fit === 'contain' ? Math.max(0, (box.width - DESIGN_WIDTH * scale) / 2) : 0;
  const offsetY = fit === 'contain' ? Math.max(0, (box.height - DESIGN_HEIGHT * scale) / 2) : 0;

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        ...(fit === 'width'
          ? {
              aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
              border: '1px solid var(--dsh-border, #3a3a3a)',
              borderRadius: 8,
            }
          : { height: '100%' }),
        overflow: 'hidden',
        background: '#000',
      }}
    >
      <iframe
        ref={iframeRef}
        title={title}
        src={VIEWER_SRC}
        tabIndex={interactive ? 0 : -1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: DESIGN_WIDTH,
          height: DESIGN_HEIGHT,
          border: 'none',
          transform: `translate(${String(offsetX)}px, ${String(offsetY)}px) scale(${String(scale)})`,
          transformOrigin: 'top left',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
    </div>
  );
}

/** minimize-2: two arrows converging, used to collapse the fullscreen viewer. */
function CollapseIcon(): ReactElement {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

/**
 * Running state: an AgentScreen-style resting card. While the stream connects
 * (or reconnects) it shows the shared indicator; once live, a hover mask blocks
 * input and offers 「打开」, which expands to the fullscreen viewer. Only one
 * viewer iframe is mounted at a time.
 */
function RunningCard({
  t,
  botSlug,
  busy,
  stopping,
  onStop,
}: {
  readonly t: ComputerTranslate;
  readonly botSlug: string | undefined;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ReactElement {
  const inlineRef = useRef<HTMLIFrameElement>(null);
  const fullRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const wasReady = useRef(false);
  const title = t('entry.screen.title', { name: botSlug ?? 'PersonaBot' });

  const inlineReady = useFrameReady(inlineRef, !expanded);
  const fullReady = useFrameReady(fullRef, expanded);
  const ready = expanded ? fullReady : inlineReady;

  // Switching which frame is active is not a stream loss: reset the tracker so
  // the newly active frame's first mount is not read as a reconnect.
  useEffect(() => {
    wasReady.current = false;
    setReconnecting(false);
  }, [expanded]);

  // A stream that disappears after being live (closed session, dropped socket)
  // remounts the viewer so it reconnects on its own.
  useEffect(() => {
    if (ready) {
      wasReady.current = true;
      setReconnecting(false);
      return;
    }
    if (wasReady.current) {
      wasReady.current = false;
      setReconnecting(true);
      setReloadKey((key) => key + 1);
    }
  }, [ready]);

  useEffect(() => {
    if (!expanded) return () => {};
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setExpanded(false);
        return;
      }
      // The viewer is a modal: keep Tab inside it instead of letting focus
      // walk into the shell behind the overlay.
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (dialog === null) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button, [href], iframe, [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.tabIndex !== -1);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      const active = document.activeElement;
      if (event.shiftKey && (active === first || active === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  const indicatorLabel = reconnecting ? t('entry.reconnecting') : t('entry.connecting');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        role={ready && !expanded ? 'button' : undefined}
        tabIndex={ready && !expanded ? 0 : undefined}
        aria-label={ready ? t('entry.openFullscreen') : indicatorLabel}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (ready && !expanded) setExpanded(true);
        }}
        onKeyDown={(event) => {
          if (!ready || expanded) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setExpanded(true);
        }}
        style={{ position: 'relative', cursor: ready && !expanded ? 'pointer' : 'default' }}
      >
        {expanded ? (
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
              display: 'grid',
              placeItems: 'center',
              border: '1px solid var(--dsh-border, #3a3a3a)',
              borderRadius: 8,
              background: '#000',
              color: '#fff',
              fontSize: 12.5,
              opacity: 0.8,
            }}
          >
            {t('entry.fullscreenOpened')}
          </div>
        ) : (
          <>
            <ScaledFrame key={reloadKey} title={title} interactive={false} iframeRef={inlineRef} />
            {!inlineReady ? (
              <ScreenIndicator label={indicatorLabel} />
            ) : hovered ? (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(17,19,24,0.18)',
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 12px',
                    borderRadius: 999,
                    background: 'var(--dsh-accent, #4d6bfe)',
                    color: '#fff',
                    fontSize: 12.5,
                    fontWeight: 500,
                  }}
                >
                  ⤢ {t('entry.openFullscreen')}
                </span>
              </div>
            ) : null}
          </>
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>{title}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" style={buttonStyle} disabled={busy || stopping} onClick={onStop}>
          {busy || stopping ? t('entry.stopping') : t('entry.stop')}
        </button>
        <button
          type="button"
          style={buttonStyle}
          onClick={() => {
            setReconnecting(true);
            setReloadKey((key) => key + 1);
          }}
          title={t('entry.reconnect')}
        >
          {t('entry.reconnect')}
        </button>
      </div>

      {expanded
        ? createPortal(
            <div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={title}
              tabIndex={-1}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                background: '#000',
                color: '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  height: 44,
                  flex: '0 0 auto',
                  padding: '0 8px 0 14px',
                  borderBottom: '1px solid var(--dsh-border, #2c2c2c)',
                }}
              >
                <strong style={{ fontSize: 13, fontWeight: 600 }}>{title}</strong>
                <span style={{ flex: 1 }} />
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  aria-label={t('entry.collapseFullscreen')}
                  title={t('entry.collapseFullscreen')}
                  style={{ ...buttonStyle, display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <CollapseIcon />
                </button>
              </div>
              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <ScaledFrame
                  key={reloadKey}
                  title={title}
                  interactive
                  fit="contain"
                  iframeRef={fullRef}
                />
                {!fullReady ? <ScreenIndicator label={indicatorLabel} /> : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
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
  readonly onStart: () => void;
  readonly onConfirmStart: () => void;
  readonly onStop: () => void;
  readonly onApprove: (remember: boolean) => void;
  readonly onCancel: () => void;
}

/** Pure three-state view; the container component supplies data and handlers. */
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
            background: 'rgba(127,127,127,0.25)',
          }}
        >
          <div
            style={
              progress?.percent === undefined
                ? { position: 'absolute', inset: 0, background: 'var(--dsh-accent, #4d6bfe)' }
                : {
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    bottom: 0,
                    width: `${String(progress.percent)}%`,
                    background: 'var(--dsh-accent, #4d6bfe)',
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
      <div style={noteStyle}>{error ?? detail ?? t(SHARED_NOTE_KEY)}</div>
      <button type="button" style={primaryButtonStyle} disabled={busy} onClick={onStart}>
        {busy ? t('entry.starting') : t('entry.start')}
      </button>
    </div>
  );
}

/** Bind the entry to the Computer's locale namespace once per registration. */
export function createComputerEntry(
  t: ComputerTranslate,
): (props: ChannelSidebarEntryProps) => ReactElement {
  return function ComputerEntryWithLocale(props: ChannelSidebarEntryProps): ReactElement {
    return <ComputerEntry {...props} t={t} />;
  };
}

/** Resolves the PersonaBot's display name through the BotHarness bridge. */
function useBotDisplayName(botSlug: string | undefined): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    const rpc = connectionRpc;
    if (rpc === undefined || botSlug === undefined) return () => {};
    let cancelled = false;
    void rpc
      .call('/api', 'botharness/list', { args: {} })
      .then((result) => {
        if (cancelled || !result.ok) return;
        const value = result.value as {
          bots?: readonly { slug?: unknown; displayName?: unknown }[];
        };
        const match = (value.bots ?? []).find((bot) => bot.slug === botSlug);
        if (typeof match?.displayName === 'string' && match.displayName.length > 0) {
          setName(match.displayName);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [botSlug]);

  return name ?? botSlug;
}

/** The Computer entry: Setup → Ready → Running, rendered inside the Channel sidebar. */
function ComputerEntry({
  botSlug,
  t,
}: ChannelSidebarEntryProps & { t: ComputerTranslate }): ReactElement {
  const displayName = useBotDisplayName(botSlug);
  const [payload, setPayload] = useState<ComputerStatusPayload | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(
    () => globalThis.sessionStorage?.getItem(APPROVED_KEY) === '1',
  );
  const [busySince, setBusySince] = useState<number | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);
  const [nowTs, setNowTs] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      setPayload(await requestJson<ComputerStatusPayload>(STATUS_ENDPOINT));
      setError(undefined);
    } catch (cause) {
      setError(String(cause));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  const phase = payload?.status.phase;
  const inProgress =
    phase === 'pulling' ||
    phase === 'starting' ||
    phase === 'stopping' ||
    phase === 'exporting' ||
    phase === 'importing';

  useEffect(() => {
    if (!inProgress) {
      setBusySince(undefined);
      setElapsed(0);
      return;
    }
    setBusySince((current) => current ?? Date.now());
    const timer = setInterval(() => {
      setNowTs(Date.now());
      setBusySince((current) => {
        if (current !== undefined) setElapsed(Math.round((Date.now() - current) / 1000));
        return current;
      });
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
      onStart={onStart}
      onConfirmStart={onConfirmStart}
      onStop={() => void act(STOP_ENDPOINT)}
      onApprove={onApprove}
      onCancel={() => setConfirming(false)}
    />
  );
}

export function apply(ctx: ClientContext): void {
  const settingsPrefs = new ComputerSettingsPrefs();
  ctx.inject(['settingsScope'], (settingsCtx) => {
    const scope = settingsCtx.settingsScope.bind<ComputerSettings>({
      namespace: COMPUTER_SETTINGS_NAMESPACE,
    }) as unknown as ComputerSettingsScope;
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
      pickDirectory: workspace?.pickDirectory,
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
    style.textContent = SPIN_STYLE;
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
          label: t('entry.label'),
          order: 40,
          scope: 'personabot',
          component: createComputerEntry(t),
        }),
      'botharness-computer: channel sidebar entry',
    );
  });
}
