import {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type RefObject,
} from 'react';
import {
  dotStateFor,
  isExitReport,
  nextExpanded,
  statusKeyFor,
  stopKey,
  type FramePhase,
} from './viewer-state.js';
import {
  LOSS_REMOUNT_AFTER,
  nextStreamTracker,
  sampleSurface,
  shouldAutoReload,
  shouldRemountLoss,
  type StreamTracker,
} from './frame-liveness.js';
import { reportViewerEvent, viewerEventText } from './viewer-events.js';
import {
  LOCALE_NS,
  PHASE_LABEL,
  en,
  zh,
  type ComputerKey,
  type ComputerTranslate,
} from './locale.js';
import {
  Button,
  IconFullscreenOutlineRegular,
  Pill,
  StateDot,
} from '@deepseek-ai/dsh-client-ui-primitives';
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
    readonly storage?: ComputerStorage;
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

/* @bh-computer-aliases:start — the bundle's only literal colours. Each entry
   reads a DSH token; entries that need one carry an audited light-theme
   fallback measured against @deepseek-ai/dsh-client-ui-theme (pinned
   0.1.5-rc.2). Components must use these names, never inline hex or bare
   var(--dsw-*). Enforced by client-tokens.test.ts. */
const BH = {
  labelPrimary: 'var(--dsw-alias-label-primary, #0f1115)',
  labelPrimaryForeground: 'var(--dsw-alias-label-primary-foreground, #ffffff)',
  borderL2: 'var(--dsw-alias-border-l2, #0000001a)',
  borderL3: 'var(--dsw-alias-border-l3, #0000001f)',
  borderL4: 'var(--dsw-alias-border-l4, #00000029)',
  bgBase: 'var(--dsw-alias-bg-base, #ffffff)',
  buttonPrimaryFill: 'var(--dsw-alias-button-primary-fill, #0f1115)',
  buttonElevatedFill: 'var(--dsw-alias-button-elevated-fill, transparent)',
  businessPrimary: 'var(--dsw-alias-state-business-primary, #4176e6)',
  hoverScrim: 'color-mix(in srgb, var(--dsw-alias-bg-base) 35%, transparent)',
} as const;
/* @bh-computer-aliases:end */

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

/* @bh-video-surface:start — intentional fixed colours for the video surface.
   The letterbox behind the scaled stream and the spinner drawn on top of it
   are content-adjacent: they stay black/white in both host themes so the
   picture never sits on a light plate. Every themed chrome colour must read a
   --dsw token; enforced by client-tokens.test.ts. */
const VIDEO_SURFACE = {
  background: '#000000',
  spinnerTrack: 'rgba(255, 255, 255, 0.18)',
  spinnerArc: '#ffffff',
  onVideo: '#ffffff',
} as const;
/* @bh-video-surface:end */

/** Logical viewport the viewer renders at; the wrapper scales it to fit. */
const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

const SPIN_STYLE = `
@keyframes bc-spin { to { transform: rotate(360deg); } }
`;

/**
 * Follows the single viewer iframe for the whole Running lifetime: each tick
 * samples the document (canvas size, Selkies busy line, pixel signature) and
 * projects the overlay phase. `epoch` bumps (reconnect) reset the tracker so
 * the new document starts back at "connecting". The card stays mounted across
 * docked/fullscreen toggles, so one tracker instance never resets on open.
 */
function useStreamPhase(iframeRef: RefObject<HTMLIFrameElement>, epoch: number): FramePhase {
  const [phase, setPhase] = useState<FramePhase>('connecting');

  useEffect(() => {
    setPhase('connecting');
    let cancelled = false;
    let tracker: StreamTracker = { misses: 0, busyStreak: 0, quiet: 0 };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      if (cancelled) return;
      let doc: Document | null = null;
      try {
        doc = iframeRef.current?.contentDocument ?? null;
      } catch {
        doc = null;
      }
      const next = nextStreamTracker(tracker, sampleSurface(doc));
      tracker = next.tracker;
      setPhase(next.phase);
      timer = setTimeout(check, 1000);
    };
    timer = setTimeout(check, 300);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [iframeRef, epoch]);

  return phase;
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
        background: VIDEO_SURFACE.background,
        color: VIDEO_SURFACE.onVideo,
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
            stroke={VIDEO_SURFACE.spinnerTrack}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={VIDEO_SURFACE.spinnerArc}
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

/** Explicit "no picture" state once connecting has gone on too long. */
function ScreenEmpty({
  t,
  onRetry,
}: {
  readonly t: ComputerTranslate;
  readonly onRetry: () => void;
}): ReactElement {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: VIDEO_SURFACE.background,
        color: VIDEO_SURFACE.onVideo,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 12.5, opacity: 0.75 }}>{t('entry.noScreen')}</span>
        <Button variant="toolbar" size="sm" onClick={onRetry}>
          {t('entry.reconnect')}
        </Button>
      </div>
    </div>
  );
}

export interface StreamOverlayProps {
  readonly phase: FramePhase;
  readonly reconnecting: boolean;
  /** The hover pill only exists on the docked card; fullscreen passes false. */
  readonly hovered: boolean;
  readonly t: ComputerTranslate;
  readonly onRetry: () => void;
  readonly onOpen: () => void;
}

/**
 * The single overlay selector for the stream surface: the connecting notice,
 * the empty state with retry, the hover Open pill once live, nothing
 * otherwise. Exported for component tests proving the overlay-vs-pill
 * binding (a connecting stream never offers the pill).
 */
export function StreamOverlay(props: StreamOverlayProps): ReactElement | null {
  const { phase, reconnecting, hovered, t, onRetry, onOpen } = props;
  if (phase === 'connecting') {
    return <ScreenIndicator label={t(statusKeyFor(phase, reconnecting))} />;
  }
  if (phase === 'empty') {
    return <ScreenEmpty t={t} onRetry={onRetry} />;
  }
  if (!hovered) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'grid',
        placeItems: 'center',
        background: BH.hoverScrim,
        borderRadius: 8,
      }}
    >
      <Pill
        onClick={onOpen}
        style={{
          background: BH.businessPrimary,
          color: BH.labelPrimaryForeground,
          height: 28,
          padding: '0 12px',
          fontSize: 13,
          gap: 6,
        }}
      >
        <IconFullscreenOutlineRegular size={14} />
        {t('entry.openFullscreen')}
      </Pill>
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
              border: `1px solid ${BH.borderL3}`,
              borderRadius: 8,
            }
          : { height: '100%' }),
        overflow: 'hidden',
        background: VIDEO_SURFACE.background,
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
/** One operational-log row as the read API returns it. */
export interface RecentLogRow {
  readonly id: number;
  readonly ts: number;
  readonly plugin: string;
  readonly owner: string;
  readonly kind: string;
  readonly detail: string;
}

/** Pure newest-first list; the container supplies rows and the empty state. */
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

/**
 * Collapsed "recent activity" section under the resting card chrome.
 * Fetches once on first expand; a closed section costs no requests.
 */
export function RecentLogs({ t }: { readonly t: ComputerTranslate }): ReactElement {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<readonly RecentLogRow[] | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!open || entries !== undefined || failed) return () => {};
    let cancelled = false;
    requestJson<{ entries: RecentLogRow[] }>('/api/computer/logs?limit=10')
      .then((result) => {
        if (!cancelled) setEntries(result.entries);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, entries, failed]);
  return (
    <div>
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

export interface ViewerTitleBarProps {
  readonly t: ComputerTranslate;
  readonly title: string;
  readonly phase: FramePhase;
  readonly reconnecting: boolean;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
  readonly onCollapse: () => void;
}

/** The shared stop control (title bar + resting card), one definition. */
function StopButton({
  t,
  busy,
  stopping,
  onStop,
}: {
  readonly t: ComputerTranslate;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ReactElement {
  return (
    <Button variant="ghost" size="sm" disabled={busy || stopping} onClick={onStop}>
      {busy || stopping ? t('entry.stopping') : t('entry.stop')}
    </Button>
  );
}

/**
 * The fullscreen viewer's title bar: Bot name + stream status on the left,
 * the stop control and collapse on the right. Exported for component tests.
 */
export function ViewerTitleBar(props: ViewerTitleBarProps): ReactElement {
  const { t, title, phase, reconnecting, busy, stopping, onStop, onCollapse } = props;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 44,
        flex: '0 0 auto',
        padding: '0 8px 0 14px',
        borderBottom: `1px solid ${BH.borderL2}`,
        color: BH.labelPrimary,
        background: BH.bgBase,
      }}
    >
      <StateDot state={dotStateFor(phase)} />
      <strong style={{ fontSize: 13, fontWeight: 600 }}>{title}</strong>
      <span style={{ fontSize: 12, opacity: 0.65 }}>{t(statusKeyFor(phase, reconnecting))}</span>
      <span style={{ flex: 1 }} />
      <StopButton t={t} busy={busy} stopping={stopping} onStop={onStop} />
      <Button
        variant="ghost"
        size="sm"
        onClick={onCollapse}
        aria-label={t('entry.collapseFullscreen')}
        title={t('entry.collapseFullscreen')}
      >
        <CollapseIcon />
      </Button>
    </div>
  );
}

/**
 * Running state: an AgentScreen-style card built around ONE viewer iframe. The
 * shell keeps the same element mounted and only toggles its geometry — docked
 * in the sidebar or fixed fullscreen — so opening the viewer never re-mounts
 * the stream, never re-handshakes its WebSocket, and never resets "connecting".
 * Docked, a hover mask offers the blue Open pill; expanded, the same frame
 * fills the viewport under the title bar (the toolbar collapse button returns
 * to the card, page scroll locked). Sustained silence becomes an explicit
 * empty state with a retry.
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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const wasReady = useRef(false);
  const autoReloads = useRef(0);
  const lossStreak = useRef(0);
  const prevPhase = useRef<FramePhase | undefined>(undefined);
  const prevExpanded = useRef(false);
  const title = t('entry.screen.title', { name: botSlug ?? 'PersonaBot' });

  const phase = useStreamPhase(frameRef, reloadKey);
  const live = phase === 'live';

  const reconnect = (): void => {
    void reportViewerEvent(undefined, viewerEventText({ type: 'manual-retry' }));
    setReconnecting(true);
    setReloadKey((key) => key + 1);
  };

  // Narrate lifecycle transitions into developer diagnostics (transitions
  // only, never per-tick polls) so later debugging replays the card's story.
  useEffect(() => {
    void reportViewerEvent(undefined, viewerEventText({ type: 'mount' }));
  }, []);

  useEffect(() => {
    const fromPhase = prevPhase.current;
    prevPhase.current = phase;
    if (fromPhase !== undefined && fromPhase !== phase) {
      void reportViewerEvent(
        undefined,
        viewerEventText({ type: 'phase', from: fromPhase, to: phase }),
      );
    }
    const wasExpanded = prevExpanded.current;
    prevExpanded.current = expanded;
    if (wasExpanded !== expanded) {
      void reportViewerEvent(undefined, viewerEventText({ type: 'overlay', open: expanded }));
    }
  }, [phase, expanded]);

  // A stream that disappears after being live remounts the viewer — but only
  // once the loss persists, so a single missed tick (GC pause, slow frame)
  // never restarts the whole SPA mid-negotiation.
  useEffect(() => {
    if (live) {
      wasReady.current = true;
      autoReloads.current = 0;
      lossStreak.current = 0;
      setReconnecting(false);
      return;
    }
    if (!wasReady.current) return;
    lossStreak.current += 1;
    if (!shouldRemountLoss(lossStreak.current)) return;
    wasReady.current = false;
    lossStreak.current = 0;
    void reportViewerEvent(
      undefined,
      viewerEventText({ type: 'loss-remount', streak: LOSS_REMOUNT_AFTER }),
    );
    setReconnecting(true);
    setReloadKey((key) => key + 1);
  }, [live]);

  // A document that never went live most likely failed its first load while
  // the server was still booting — remount a bounded number of times, then
  // leave the manual retry.
  useEffect(() => {
    if (!shouldAutoReload(phase, wasReady.current, autoReloads.current)) return;
    autoReloads.current += 1;
    void reportViewerEvent(
      undefined,
      viewerEventText({ type: 'auto-reload', attempt: autoReloads.current }),
    );
    setReloadKey((key) => key + 1);
  }, [phase]);

  useEffect(() => {
    if (!expanded) return () => {};
    const onKey = (event: KeyboardEvent): void => {
      // Fullscreen exits through the toolbar collapse button only (no Escape
      // shortcut): keep Tab inside the viewer instead of letting focus walk
      // into the shell behind the overlay.
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

  const statusText = t(statusKeyFor(phase, reconnecting));
  const openable = phase === 'live' && !expanded;

  // Shared connecting/empty notice; the resting card falls through to the
  // hover mask only once the stream is actually live.
  const overlay = (
    <StreamOverlay
      phase={phase}
      reconnecting={reconnecting}
      hovered={expanded ? false : hovered}
      t={t}
      onRetry={reconnect}
      onOpen={() => setExpanded(nextExpanded('open'))}
    />
  );

  // The shell keeps its children keyed so toggling docked ↔ fullscreen only
  // mounts/unmounts the title bar and the card chrome — the frame (and its
  // iframe) stays at key "viewer-frame" in both layouts and never remounts.
  const stopLabel = t(stopKey(busy, stopping));
  const rowButton = (disabled: boolean): CSSProperties => ({
    flex: 1,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    padding: '0 10px',
    borderRadius: 14,
    border: `1px solid ${BH.borderL3}`,
    background: BH.buttonElevatedFill,
    color: BH.labelPrimary,
    fontSize: 12,
    ...(disabled ? { opacity: 0.4, cursor: 'not-allowed' } : { cursor: 'pointer' }),
  });

  return (
    <div
      ref={dialogRef}
      role={expanded ? 'dialog' : undefined}
      aria-modal={expanded ? true : undefined}
      aria-label={expanded ? title : undefined}
      tabIndex={expanded ? -1 : undefined}
      style={
        expanded
          ? {
              position: 'fixed',
              inset: 0,
              zIndex: 100,
              display: 'flex',
              flexDirection: 'column',
              background: BH.bgBase,
              color: BH.labelPrimary,
            }
          : { display: 'flex', flexDirection: 'column', gap: 8 }
      }
    >
      {expanded ? (
        <ViewerTitleBar
          key="viewer-titlebar"
          t={t}
          title={title}
          phase={phase}
          reconnecting={reconnecting}
          busy={busy}
          stopping={stopping}
          onStop={onStop}
          onCollapse={() => setExpanded(nextExpanded('collapse'))}
        />
      ) : null}
      <div
        key="viewer-frame"
        role={openable ? 'button' : undefined}
        tabIndex={openable ? 0 : undefined}
        aria-label={openable ? t('entry.openFullscreen') : statusText}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (openable) setExpanded(nextExpanded('open'));
        }}
        onKeyDown={(event) => {
          if (!openable) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          setExpanded(nextExpanded('open'));
        }}
        style={
          expanded
            ? { position: 'relative', flex: 1, minHeight: 0 }
            : { position: 'relative', cursor: openable ? 'pointer' : 'default' }
        }
      >
        <ScaledFrame
          key={reloadKey}
          title={title}
          interactive={expanded}
          fit={expanded ? 'contain' : 'width'}
          iframeRef={frameRef}
        />
        {overlay}
      </div>
      {expanded ? null : (
        <Fragment key="viewer-chrome">
          <div
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: BH.labelPrimary,
              opacity: 0.9,
              textAlign: 'center',
            }}
          >
            {title}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              disabled={busy || stopping}
              onClick={onStop}
              style={rowButton(busy || stopping)}
            >
              {stopLabel}
            </button>
            <button
              type="button"
              onClick={reconnect}
              title={t('entry.reconnect')}
              style={rowButton(false)}
            >
              {t('entry.reconnect')}
            </button>
          </div>
          <RecentLogs t={t} />
        </Fragment>
      )}
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
  readonly storage?: ComputerStorage;
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
    storage,
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
      {...(payload?.status.storage === undefined ? {} : { storage: payload.status.storage })}
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
  ctx.inject(['configForms'], (settingsCtx) => {
    const scope = settingsCtx.configForms.get<ComputerSettings>(COMPUTER_SETTINGS_NAMESPACE) as unknown as ComputerSettingsScope;
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
