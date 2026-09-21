import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
} from 'react';
import type { Context as ClientContext } from '@deepseek-ai/cordis';
// Type-only: the `shell.overlay` slot contract.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-slots';

export const name = 'botharness-computer-client';

export const inject = ['slots'];

const STATUS_ENDPOINT = '/api/computer/status';
const START_ENDPOINT = '/api/computer/start';
const STOP_ENDPOINT = '/api/computer/stop';
const VIEWER_SRC = '/botharness-computer/viewer/vnc.html?autoconnect=1&resize=scale&reconnect=1';
const APPROVED_KEY = 'botharness-computer-start-approved';

type ComputerState = 'absent' | 'stopped' | 'running' | 'failed';
type ComputerPhase = 'idle' | 'pulling' | 'starting' | 'running' | 'stopping' | 'failed';

interface ComputerStatusPayload {
  readonly provider: string | null;
  readonly probe: { readonly available: boolean; readonly detail?: string };
  readonly status: {
    readonly state: ComputerState;
    readonly phase?: ComputerPhase;
    readonly detail?: string;
    readonly progress?: { readonly percent?: number; readonly text?: string };
  };
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', ...init });
  if (!response.ok) throw new Error(`${String(response.status)} ${await response.text()}`);
  return (await response.json()) as T;
}

const STATE_LABEL: Record<ComputerState, string> = {
  absent: '未创建',
  stopped: '已停止',
  running: '运行中',
  failed: '不可用',
};

const PHASE_LABEL: Partial<Record<ComputerPhase, string>> = {
  pulling: '正在拉取镜像',
  starting: '正在启动容器',
  stopping: '正在停止',
};

const AUTHORIZATION_POINTS = [
  '检测本机容器运行时；缺失时只给出安装引导，不会自动安装',
  '创建/复用持久卷（浏览器登录态与文件保留在这台电脑上）',
  '拉取镜像（首次约 1.2 GB 网络流量）并创建容器',
  '把 Web VNC 绑定到 127.0.0.1 的本地端口，仅本机可访问',
];

const STYLES = `
@keyframes bc-progress { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
.bc-progress-track { position: relative; overflow: hidden; height: 6px; border-radius: 3px; background: rgba(127,127,127,0.25); width: 100%; }
.bc-progress-bar { position: absolute; inset: 0; border-radius: 3px; background: linear-gradient(90deg, transparent, var(--dsh-accent, #4d6bfe), transparent); animation: bc-progress 1.2s linear infinite; }
.bc-progress-bar--determinate { animation: none; background: var(--dsh-accent, #4d6bfe); left: 0; top: 0; bottom: 0; right: auto; }
.bc-terminal { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; opacity: 0.7; white-space: pre-wrap; word-break: break-all; max-height: 3.5em; overflow: hidden; }
`;

const launcherStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 20,
  zIndex: 60,
  border: '1px solid var(--dsh-border, #3a3a3a)',
  borderRadius: 20,
  padding: '6px 14px',
  background: 'var(--dsh-surface, #1f1f1f)',
  color: 'var(--dsh-text, #eee)',
  cursor: 'pointer',
  fontSize: 13,
};

const panelStyle: CSSProperties = {
  position: 'fixed',
  right: 20,
  bottom: 64,
  zIndex: 60,
  width: 640,
  height: 480,
  display: 'flex',
  flexDirection: 'column',
  border: '1px solid var(--dsh-border, #3a3a3a)',
  borderRadius: 12,
  overflow: 'hidden',
  background: 'var(--dsh-surface, #161616)',
  color: 'var(--dsh-text, #eee)',
  boxShadow: '0 12px 32px rgba(0,0,0,0.45)',
};

const barStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '8px 12px',
  fontSize: 13,
  borderBottom: '1px solid var(--dsh-border, #3a3a3a)',
};

const bodyStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
  fontSize: 13,
  textAlign: 'center',
  whiteSpace: 'pre-wrap',
  overflow: 'auto',
};

const progressStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  justifyContent: 'center',
  gap: 10,
  padding: '0 24px',
  fontSize: 13,
};

const confirmStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  padding: 18,
  fontSize: 13,
  overflow: 'auto',
};

const buttonStyle: CSSProperties = {
  padding: '4px 10px',
  borderRadius: 6,
  border: '1px solid var(--dsh-border, #3a3a3a)',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
};

const primaryButtonStyle: CSSProperties = {
  ...buttonStyle,
  borderColor: 'var(--dsh-accent, #4d6bfe)',
  background: 'var(--dsh-accent, #4d6bfe)',
  color: '#fff',
};

const SETUP_GUIDANCE = [
  '未检测到容器运行时。任选其一安装后重试：',
  '',
  'Colima（推荐，MIT）：',
  '  brew install colima docker',
  '  brew services start colima',
  '',
  '或安装 Docker Desktop：https://www.docker.com/products/docker-desktop/',
].join('\n');

function ComputerPanel(): ReactElement {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ComputerStatusPayload | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [approved, setApproved] = useState(
    () => globalThis.sessionStorage?.getItem(APPROVED_KEY) === '1',
  );
  const busySince = useRef<number | undefined>(undefined);
  const [elapsed, setElapsed] = useState(0);

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
  const progress = payload?.status.progress;
  const inProgress = phase === 'pulling' || phase === 'starting' || phase === 'stopping';

  useEffect(() => {
    if (!inProgress) {
      busySince.current = undefined;
      setElapsed(0);
      return;
    }
    busySince.current ??= Date.now();
    const timer = setInterval(() => {
      if (busySince.current !== undefined) {
        setElapsed(Math.round((Date.now() - busySince.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [inProgress]);

  const post = useCallback(
    async (endpoint: string, body?: Record<string, unknown>) => {
      setBusy(true);
      try {
        await requestJson(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {}),
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

  const approve = useCallback(
    (remember: boolean) => {
      if (remember) {
        globalThis.sessionStorage?.setItem(APPROVED_KEY, '1');
        setApproved(true);
      }
      setConfirming(false);
      void post(START_ENDPOINT, { authorize: true });
    },
    [post],
  );

  if (!open) {
    return (
      <button type="button" style={launcherStyle} onClick={() => setOpen(true)}>
        电脑
      </button>
    );
  }

  const state = payload?.status.state ?? 'absent';
  const unavailable = payload !== undefined && !payload.probe.available;

  return (
    <div style={panelStyle}>
      <div style={barStyle}>
        <strong>Computer</strong>
        <span>{inProgress ? (PHASE_LABEL[phase] ?? '处理中') : STATE_LABEL[state]}</span>
        {payload?.provider !== null && payload?.provider !== undefined && (
          <span style={{ opacity: 0.6 }}>{payload.provider}</span>
        )}
        <span style={{ flex: 1 }} />
        {state === 'running' ? (
          <button
            type="button"
            style={buttonStyle}
            disabled={busy || inProgress}
            onClick={() => void post(STOP_ENDPOINT)}
          >
            停止
          </button>
        ) : (
          <button
            type="button"
            style={buttonStyle}
            disabled={busy || inProgress}
            onClick={() =>
              approved ? void post(START_ENDPOINT, { authorize: true }) : setConfirming(true)
            }
          >
            启动
          </button>
        )}
        <button type="button" style={buttonStyle} onClick={() => setOpen(false)}>
          关闭
        </button>
      </div>
      {confirming ? (
        <div style={confirmStyle}>
          <strong>授权启动 Computer</strong>
          <div style={{ opacity: 0.75 }}>启动会在你的机器上执行以下操作：</div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, opacity: 0.85 }}>
            {AUTHORIZATION_POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <label style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.85 }}>
            <input
              type="checkbox"
              onChange={(event) => {
                if (event.target.checked) {
                  globalThis.sessionStorage?.setItem(APPROVED_KEY, '1');
                  setApproved(true);
                }
              }}
            />
            本次会话内不再询问
          </label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" style={buttonStyle} onClick={() => setConfirming(false)}>
              取消
            </button>
            <button type="button" style={primaryButtonStyle} onClick={() => approve(true)}>
              授权并启动
            </button>
          </div>
        </div>
      ) : state === 'running' ? (
        <iframe
          title="PersonaBot Computer"
          src={VIEWER_SRC}
          style={{ flex: 1, width: '100%', border: 'none' }}
        />
      ) : inProgress ? (
        <div style={progressStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{PHASE_LABEL[phase] ?? '处理中'}…</span>
            <span style={{ opacity: 0.8 }}>
              {progress?.percent === undefined ? '' : `${String(progress.percent)}%`}
            </span>
          </div>
          <div className="bc-progress-track">
            <div
              className={
                progress?.percent === undefined
                  ? 'bc-progress-bar'
                  : 'bc-progress-bar bc-progress-bar--determinate'
              }
              style={
                progress?.percent === undefined
                  ? undefined
                  : { width: `${String(progress.percent)}%` }
              }
            />
          </div>
          <div className="bc-terminal">{progress?.text ?? payload?.status.detail ?? '请稍候'}</div>
          <div style={{ opacity: 0.5 }}>已用时 {elapsed}s</div>
        </div>
      ) : (
        <div style={bodyStyle}>
          {unavailable
            ? SETUP_GUIDANCE
            : (error ?? payload?.status.detail ?? '点击「启动」创建并启动这台电脑。')}
        </div>
      )}
    </div>
  );
}

export function apply(ctx: ClientContext): void {
  ctx.effect(() => {
    if (typeof document === 'undefined') return () => {};
    const style = document.createElement('style');
    style.setAttribute('data-botharness-computer', 'client');
    style.textContent = STYLES;
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, 'botharness-computer: client styles');
  ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      { name: 'shell.overlay', id: 'botharness-computer', order: 60 },
      ComputerPanel,
    ),
  );
}
