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
import type { Context as ClientContext } from '@deepseek-ai/cordis';

export const name = 'botharness-computer-client';

/**
 * The Channel sidebar registry is a client-side service provided by
 * `@botharness/client`; the entry types are duplicated structurally so this
 * bundle stays self-contained (importing that package at runtime would inline
 * its client code into ours).
 */
export const inject = ['channelSidebar'];

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

const PHASE_LABEL: Partial<Record<ComputerPhase, string>> = {
  pulling: '正在拉取镜像',
  starting: '正在启动',
  stopping: '正在停止',
};

const SETUP_GUIDANCE = [
  '未检测到容器运行时。任选其一安装后重试：',
  '',
  'Colima（推荐，MIT）：',
  '  brew install colima docker',
  '  brew services start colima',
  '',
  '或 Docker Desktop：https://www.docker.com/products/docker-desktop/',
].join('\n');

const SHARED_NOTE =
  '这台电脑由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与文件。';

const AUTHORIZATION_POINTS = [
  '检测本机容器运行时；缺失时只给安装引导，不会自动安装',
  '创建/复用持久卷（登录态与文件保留在这台电脑上）',
  '拉取镜像（首次约 1.2 GB 网络流量）并创建容器',
  '把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问',
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

/** Watches the same-origin viewer document until its stream surface is live. */
function useFrameReady(iframeRef: RefObject<HTMLIFrameElement>, active: boolean): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!active) {
      setReady(false);
      return () => {};
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = (): void => {
      if (cancelled) return;
      try {
        const doc = iframeRef.current?.contentDocument ?? null;
        const surface = doc?.getElementById('videoCanvas') as
          | HTMLVideoElement
          | HTMLCanvasElement
          | null;
        if (surface !== null) {
          const width = surface instanceof HTMLVideoElement ? surface.videoWidth : surface.width;
          if (width > 0) {
            setReady(true);
            return;
          }
        }
      } catch {
        // A cross-origin or not-yet-loaded document simply keeps waiting.
      }
      timer = setTimeout(check, 500);
    };
    timer = setTimeout(check, 300);
    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [iframeRef, active]);

  return ready;
}

/** Centered spinner over black, used while the viewer connects. */
function LoadingOverlay(): ReactElement {
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
        <span style={{ fontSize: 12.5, opacity: 0.7 }}>连接中</span>
      </div>
    </div>
  );
}

interface ScaledFrameProps {
  readonly title: string;
  /** Interactive frames forward input; the inline card keeps a hover mask. */
  readonly interactive: boolean;
  readonly iframeRef?: RefObject<HTMLIFrameElement>;
}

/** Fixed-aspect card that scales the viewer to the container width. */
function ScaledFrame({ title, interactive, iframeRef }: ScaledFrameProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return () => {};
    const update = (): void => {
      if (element.clientWidth > 0) setScale(element.clientWidth / DESIGN_WIDTH);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: `${String(DESIGN_WIDTH)} / ${String(DESIGN_HEIGHT)}`,
        overflow: 'hidden',
        border: '1px solid var(--dsh-border, #3a3a3a)',
        borderRadius: 8,
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
          transform: `scale(${String(scale)})`,
          transformOrigin: 'top left',
          pointerEvents: interactive ? 'auto' : 'none',
        }}
      />
    </div>
  );
}

/**
 * Running state: an AgentScreen-style resting card. While the stream connects
 * it shows the loading overlay; once live, a hover mask blocks input and
 * offers 「打开」, which expands to the fullscreen viewer.
 */
function RunningCard({
  botSlug,
  busy,
  stopping,
  onStop,
}: {
  readonly botSlug: string | undefined;
  readonly busy: boolean;
  readonly stopping: boolean;
  readonly onStop: () => void;
}): ReactElement {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const ready = useFrameReady(iframeRef, true);
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const title = `${botSlug ?? 'PersonaBot'} 的屏幕`;

  useEffect(() => {
    if (!expanded) return () => {};
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [expanded]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        role={ready ? 'button' : undefined}
        aria-label={ready ? '打开大屏' : '正在连接'}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          if (ready) setExpanded(true);
        }}
        style={{ position: 'relative', cursor: ready ? 'pointer' : 'default' }}
      >
        <ScaledFrame title={title} interactive={false} iframeRef={iframeRef} />
        {!ready ? (
          <LoadingOverlay />
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
              ⤢ 打开
            </span>
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.9 }}>{title}</div>
      <button type="button" style={buttonStyle} disabled={busy || stopping} onClick={onStop}>
        {busy || stopping ? '停止中…' : '停止'}
      </button>

      {expanded
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label={title}
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 100,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 24,
              }}
            >
              <div
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.75)' }}
                onClick={() => setExpanded(false)}
              />
              <div
                style={{
                  position: 'relative',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  width: 'min(1200px, 94vw)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fff' }}>
                  <strong style={{ fontSize: 13 }}>{title}</strong>
                  <span style={{ flex: 1 }} />
                  <button
                    type="button"
                    style={buttonStyle}
                    onClick={() => setExpanded(false)}
                    aria-label="收起"
                  >
                    收起
                  </button>
                </div>
                <ScaledFrame title={title} interactive />
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

export interface ComputerEntryViewProps {
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
    return <div style={noteStyle}>{SETUP_GUIDANCE}</div>;
  }

  if (confirming) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div style={{ opacity: 0.8 }}>启动会在你的机器上执行：</div>
        <ul style={{ margin: 0, paddingLeft: 16, lineHeight: 1.6, opacity: 0.85 }}>
          {AUTHORIZATION_POINTS.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.85 }}>
          <input type="checkbox" onChange={(event) => onApprove(event.target.checked)} />
          本次会话内不再询问
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" style={buttonStyle} onClick={onCancel}>
            取消
          </button>
          <button type="button" style={primaryButtonStyle} onClick={onConfirmStart}>
            授权并启动
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
      <RunningCard botSlug={botSlug} busy={busy} stopping={phase === 'stopping'} onStop={onStop} />
    );
  }

  if (inProgress) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
        <div>{PHASE_LABEL[phase] ?? '处理中'}…</div>
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
        <div style={terminalStyle}>{progress?.text ?? detail ?? '请稍候'}</div>
        <div style={{ opacity: 0.5 }}>
          已用时 {elapsed}s
          {progress?.updatedAt === undefined
            ? ''
            : ` · 最后更新 ${String(Math.max(0, Math.round((nowTs - progress.updatedAt) / 1000)))}s 前`}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 12 }}>
      <div style={noteStyle}>{error ?? detail ?? SHARED_NOTE}</div>
      <button type="button" style={primaryButtonStyle} disabled={busy} onClick={onStart}>
        {busy ? '启动中…' : '启动'}
      </button>
    </div>
  );
}

/** The Computer entry: Setup → Ready → Running, rendered inside the Channel sidebar. */
export function ComputerEntry({ botSlug }: ChannelSidebarEntryProps): ReactElement {
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
          body: JSON.stringify({ authorize: true }),
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
      {...(botSlug === undefined ? {} : { botSlug })}
      onStart={onStart}
      onConfirmStart={onConfirmStart}
      onStop={() => void act(STOP_ENDPOINT)}
      onApprove={onApprove}
      onCancel={() => setConfirming(false)}
    />
  );
}

export function apply(ctx: ClientContext): void {
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
  ctx.inject(['channelSidebar'], (sidebarCtx) => {
    const registry = (sidebarCtx as unknown as { channelSidebar?: ChannelSidebarRegistryLike })
      .channelSidebar;
    if (registry === undefined) return;
    ctx.effect(
      () =>
        registry.register({
          id: ENTRY_ID,
          label: '电脑',
          order: 40,
          scope: 'personabot',
          component: ComputerEntry,
        }),
      'botharness-computer: channel sidebar entry',
    );
  });
}
