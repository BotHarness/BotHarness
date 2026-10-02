import {
  Fragment,
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ComponentType,
  type ReactElement,
  type RefCallback,
} from 'react';
import {
  dotStateFor,
  isExitReport,
  nextExpanded,
  smoothPhase,
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
  Tooltip,
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
import { LocalComputerStatus } from './local-computer.js';
import { useMountedResource } from './mounted-resource.js';

import { AccessPowerIcon } from './access-power-icon.js';

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

const VIDEO_SURFACE = {
  background: '#000000',
  spinnerTrack: 'rgba(255, 255, 255, 0.18)',
  spinnerArc: '#ffffff',
  onVideo: '#ffffff',
} as const;

const DESIGN_WIDTH = 1280;
const DESIGN_HEIGHT = 800;

function designOf(resolution: string | undefined): { width: number; height: number } {
  const match = /^(\d{2,5})x(\d{2,5})$/u.exec(resolution ?? '');
  if (match === null) return { width: DESIGN_WIDTH, height: DESIGN_HEIGHT };
  return { width: Number(match[1]), height: Number(match[2]) };
}

const SPIN_STYLE = `
.bh-computer-access-control { position: relative; display: flex; align-items: center; }
.bh-computer-access-power {
  display: flex; align-items: center; justify-content: center; width: 28px; height: 28px;
  padding: 0; border: 0; border-radius: var(--dsw-radius-md); background: transparent;
  color: var(--dsw-alias-label-secondary); cursor: pointer;
}
.bh-computer-access-power:hover { background: var(--dsw-alias-interactive-bg-hover); }
.bh-computer-access-power[aria-pressed='true'] { color: var(--dsw-alias-state-business-primary); background: var(--dsw-alias-interactive-bg-hover); }
.bh-computer-access-power:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: 2px; }
.bh-computer-access-power:disabled { opacity: 0.5; cursor: default; }
.bh-computer-access-power.bh-access-failed { color: var(--dsw-alias-state-error-primary); }
.bh-computer-access-error { order: -1; padding: 0 4px; color: var(--dsw-alias-state-error-primary); font-size: 11px; line-height: 16px; white-space: nowrap; }

@keyframes bc-spin { to { transform: rotate(360deg); } }
`;

function useStreamPhase(onSample: (phase: FramePhase) => void): RefCallback<HTMLIFrameElement> {
  return useMountedResource<HTMLIFrameElement>(
    (iframe) => {
      let active = true;
      let tracker: StreamTracker = { misses: 0, busyStreak: 0, quiet: 0 };
      let timer: ReturnType<typeof setTimeout> | undefined;
      const check = (): void => {
        if (!active) return;
        let doc: Document | null = null;
        try {
          doc = iframe.contentDocument;
        } catch {
          doc = null;
        }
        const next = nextStreamTracker(tracker, sampleSurface(doc));
        tracker = next.tracker;
        onSample(next.phase);
        timer = setTimeout(check, 1000);
      };
      timer = setTimeout(check, 300);
      return () => {
        active = false;
        if (timer !== undefined) clearTimeout(timer);
      };
    },
    [onSample],
  );
}

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
  readonly hovered: boolean;
  readonly t: ComputerTranslate;
  readonly onRetry: () => void;
  readonly onOpen: () => void;
}

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
  readonly design: { width: number; height: number };
  readonly interactive: boolean;
  readonly fit?: 'width' | 'contain';
  readonly iframeRef?: RefCallback<HTMLIFrameElement>;
}

function ScaledFrame({
  title,
  design,
  interactive,
  fit = 'width',
  iframeRef,
}: ScaledFrameProps): ReactElement {
  const DESIGN_WIDTH = design.width;
  const DESIGN_HEIGHT = design.height;
  const [box, setBox] = useState({ width: DESIGN_WIDTH, height: DESIGN_HEIGHT });
  const resizeResource = useMountedResource<HTMLDivElement>((element) => {
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
      ref={resizeResource}
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
  readonly interactive: boolean;
  readonly onToggleInteractive: () => void;
  readonly onStop: () => void;
  readonly onCollapse: () => void;
}

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

export function ViewerTitleBar(props: ViewerTitleBarProps): ReactElement {
  const {
    t,
    title,
    phase,
    reconnecting,
    busy,
    stopping,
    interactive,
    onToggleInteractive,
    onStop,
    onCollapse,
  } = props;
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
      {interactive ? null : (
        <span style={{ fontSize: 12, opacity: 0.65 }}>{t('entry.watchOnly')}</span>
      )}
      <span style={{ flex: 1 }} />
      <Button
        variant={interactive ? 'ghost' : 'primary'}
        size="sm"
        aria-pressed={interactive}
        onClick={onToggleInteractive}
        title={t(interactive ? 'entry.interactive.disable' : 'entry.interactive.enable')}
      >
        {t(interactive ? 'entry.interactive.disable' : 'entry.interactive.enable')}
      </Button>
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
  const entryRef = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [inputEnabled, setInputEnabled] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [reconnecting, setReconnecting] = useState(false);
  const wasReady = useRef(false);
  const autoReloads = useRef(0);
  const lossStreak = useRef(0);
  const phaseRef = useRef<FramePhase>('connecting');
  const title = t('entry.screen.title', { name: botSlug ?? 'PersonaBot' });
  const design = designOf(resolution);

  const [smooth, setSmooth] = useState<{ phase: FramePhase; streak: number }>({
    phase: 'connecting',
    streak: 0,
  });
  const resetFrame = useCallback(() => {
    phaseRef.current = 'connecting';
    setSmooth({ phase: 'connecting', streak: 0 });
    setReloadKey((key) => key + 1);
  }, []);
  const onSample = useCallback(
    (nextPhase: FramePhase): void => {
      const fromPhase = phaseRef.current;
      if (fromPhase !== nextPhase) {
        phaseRef.current = nextPhase;
        setSmooth((current) => smoothPhase(current.phase, nextPhase, current.streak));
        void reportViewerEvent(
          undefined,
          viewerEventText({ type: 'phase', from: fromPhase, to: nextPhase }),
        );
      }
      if (nextPhase === 'live') {
        wasReady.current = true;
        autoReloads.current = 0;
        lossStreak.current = 0;
        setReconnecting(false);
        return;
      }
      if (wasReady.current) {
        lossStreak.current += 1;
        if (shouldRemountLoss(lossStreak.current)) {
          wasReady.current = false;
          lossStreak.current = 0;
          void reportViewerEvent(
            undefined,
            viewerEventText({ type: 'loss-remount', streak: LOSS_REMOUNT_AFTER }),
          );
          setReconnecting(true);
          resetFrame();
          return;
        }
      }
      if (
        fromPhase !== nextPhase &&
        shouldAutoReload(nextPhase, wasReady.current, autoReloads.current)
      ) {
        autoReloads.current += 1;
        void reportViewerEvent(
          undefined,
          viewerEventText({ type: 'auto-reload', attempt: autoReloads.current }),
        );
        resetFrame();
      }
    },
    [resetFrame],
  );
  const streamRef = useStreamPhase(onSample);
  const phase = smooth.phase;

  const reconnect = (): void => {
    void reportViewerEvent(undefined, viewerEventText({ type: 'manual-retry' }));
    setReconnecting(true);
    autoReloads.current = 0;
    lossStreak.current = 0;
    wasReady.current = false;
    resetFrame();
  };
  const openViewer = (): void => {
    setExpanded(nextExpanded('open'));
    void reportViewerEvent(undefined, viewerEventText({ type: 'overlay', open: true }));
  };
  const collapseViewer = (): void => {
    setInputEnabled(false);
    setExpanded(nextExpanded('collapse'));
    void reportViewerEvent(undefined, viewerEventText({ type: 'overlay', open: false }));
    requestAnimationFrame(() => entryRef.current?.focus());
  };
  const dialogResource = useMountedResource<HTMLDivElement>(
    (dialog) => {
      if (!mounted.current) {
        mounted.current = true;
        void reportViewerEvent(undefined, viewerEventText({ type: 'mount' }));
      }
      if (!expanded) return;
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Tab') return;
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
      const previousOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      dialog.focus();
      return () => {
        document.removeEventListener('keydown', onKey);
        document.body.style.overflow = previousOverflow;
      };
    },
    [expanded],
  );

  const statusText = t(statusKeyFor(phase, reconnecting));
  const openable = phase === 'live' && !expanded;

  const overlay = (
    <StreamOverlay
      phase={phase}
      reconnecting={reconnecting}
      hovered={expanded ? false : hovered}
      t={t}
      onRetry={reconnect}
      onOpen={openViewer}
    />
  );

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
      ref={dialogResource}
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
          interactive={inputEnabled}
          onToggleInteractive={() => setInputEnabled((current) => !current)}
          onStop={onStop}
          onCollapse={collapseViewer}
        />
      ) : null}
      <div
        key="viewer-frame"
        ref={entryRef}
        role={openable ? 'button' : undefined}
        tabIndex={openable ? 0 : undefined}
        aria-label={openable ? t('entry.openFullscreen') : statusText}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (openable) openViewer();
        }}
        onKeyDown={(event) => {
          if (!openable) return;
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          openViewer();
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
          design={design}
          interactive={expanded && inputEnabled}
          fit={expanded ? 'contain' : 'width'}
          iframeRef={streamRef}
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
  const design = designOf(resolution);

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
          headerAction: createComputerHeader(t),
        }),
      'botharness-computer: channel sidebar entry',
    );
  });
}
