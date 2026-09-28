// @vitest-environment jsdom
import { act, createElement, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  const glyph = () => null;
  const control = (props: Record<string, unknown>) => {
    const { children, variant: _variant, size: _size, ...rest } = props;
    return createElement('button', { type: 'button', ...rest }, children as never);
  };
  const dot = (props: { state?: string }) => createElement('span', { 'data-state': props.state });
  const toggle = (props: {
    checked?: boolean;
    disabled?: boolean;
    label?: string;
    onChange?: (next: boolean) => void;
  }) =>
    createElement('button', {
      type: 'button',
      role: 'switch',
      'aria-checked': props.checked === true ? 'true' : 'false',
      'aria-label': props.label,
      disabled: props.disabled === true,
      onClick: () => props.onChange?.(props.checked !== true),
    });
  return {
    IconChevronDownOutlineRegular: glyph,
    IconCloseFillRegular: glyph,
    IconFolderOpenOutlineRegular: glyph,
    IconSettingsOutlineRegular: glyph,
    IconFullscreenOutlineRegular: glyph,
    Menu: glyph,
    Button: control,
    Pill: control,
    StateDot: dot,
    Switch: toggle,
  };
});

import {
  apply,
  ComputerEntryView,
  RecentLogs,
  RecentLogsList,
  StreamOverlay,
  ViewerTitleBar,
  type ComputerEntryViewProps,
} from '../src/client/index.js';
import { zh, type ComputerKey, type ComputerTranslate } from '../src/client/locale.js';

const t = ((key: ComputerKey, params?: Record<string, unknown>): string => {
  let text: string = zh[key];
  if (params === undefined) return text;
  for (const [name, value] of Object.entries(params)) {
    text = text.replace(`{${name}}`, String(value));
  }
  return text;
}) as unknown as ComputerTranslate;

function view(overrides: Partial<ComputerEntryViewProps> = {}): string {
  const props: ComputerEntryViewProps = {
    t,
    state: 'stopped',
    runtimeAvailable: true,
    confirming: false,
    busy: false,
    elapsed: 0,
    nowTs: 0,
    onStart: () => undefined,
    onConfirmStart: () => undefined,
    onStop: () => undefined,
    onApprove: () => undefined,
    onCancel: () => undefined,
    ...overrides,
  };
  return renderToStaticMarkup(createElement(ComputerEntryView, props));
}

describe('Computer channel sidebar entry registration', () => {
  it('registers a personabot-scope entry and disposes it with the effect', () => {
    const registered: { id?: string; label?: string; scope?: string; order?: number }[] = [];
    const unregistered: string[] = [];
    let disposed: (() => void) | undefined;
    const registry = {
      register: (entry: { id?: string; label?: string; scope?: string; order?: number }) => {
        registered.push(entry);
        return () => {
          if (entry.id !== undefined) unregistered.push(entry.id);
        };
      },
    };
    const rows: { id?: string; order?: number }[] = [];
    const settings = {
      get: () => ({
        getSnapshot: () => ({ status: 'ready' as const, value: undefined, writable: true }),
        subscribe: () => () => {},
        set: async () => {},
      }),
    };
    const ctx = {
      locale: { bind: () => t, register: () => () => {} },
      inject: (deps: string[], callback: (context: unknown) => void) => {
        if (deps.includes('configForms')) {
          callback({ configForms: settings });
          return;
        }
        if (deps.includes('uiWorkspace')) {
          callback({
            uiWorkspace: { pickDirectory: async () => null },
            slots: {
              inject: (_name: string, register: () => void) => {
                register();
              },
              register: (options: { id?: string; order?: number }) => {
                rows.push(options);
                return () => {};
              },
            },
          });
          return;
        }
        callback({ channelSidebar: registry });
      },
      effect: (callback: () => () => void) => {
        disposed = callback();
      },
    };

    apply(ctx as unknown as Parameters<typeof apply>[0]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 'computer', order: 10 });
    expect(registered).toHaveLength(1);
    expect(registered[0]?.id).toBe('botharness-computer');
    expect(registered[0]?.label).toBe('电脑');
    expect(registered[0]?.scope).toBe('personabot');
    expect(registered[0]?.order).toBe(40);

    disposed?.();
    expect(unregistered).toEqual(['botharness-computer']);
  });
});

describe('Computer entry states', () => {
  it('shows the setup guidance when no container runtime is available', () => {
    const html = view({ runtimeAvailable: false });
    expect(html).toContain('未检测到容器运行时');
    expect(html).toContain('colima');
  });

  it('offers start with the shared-computer note when ready', () => {
    const html = view();
    expect(html).toContain('启动');
    expect(html).toContain('共享');
  });

  it('hides bare exit-code reports behind the shared note in the start view', () => {
    const html = view({ state: 'stopped', detail: 'exited code=137' });
    expect(html).not.toContain('exited code=137');
    expect(html).toContain('共享');
    expect(html).toContain('启动');
  });

  it('keeps real server details visible in the start view', () => {
    const html = view({ state: 'stopped', detail: 'pull failed: network unreachable' });
    expect(html).toContain('pull failed: network unreachable');
  });

  it('renders the live viewer, its connecting overlay, and stop while running', () => {
    const html = view({ state: 'running', botSlug: 'atlas' });
    // Exactly one iframe owns the stream in every layout (docked/fullscreen
    // toggle only re-geometries the same element, never mounts a second one).
    expect(html.match(/<iframe/g)).toHaveLength(1);
    expect(html).toContain('/botharness-computer/viewer/');
    expect(html).toContain('停止');
    expect(html).toContain('atlas 的屏幕');
    // The stream is not live yet in a static render, so the loading state shows.
    expect(html).toContain('连接中');
    // The docked card never forwards input; fullscreen starts watch-only too.
    expect(html).toContain('pointer-events:none');
  });

  it('shows pull progress with the runtime line and elapsed time', () => {
    const html = view({
      phase: 'pulling',
      progress: { percent: 50, text: 'abc123: Download complete', updatedAt: 1000 },
      elapsed: 12,
      nowTs: 5000,
    });
    expect(html).toContain('正在拉取镜像');
    expect(html).toContain('abc123: Download complete');
    expect(html).toContain('已用时 12s');
    expect(html).toContain('最后更新 4s 前');
  });

  it('asks for authorization before the first start', () => {
    const html = view({ confirming: true });
    expect(html).toContain('授权并启动');
    expect(html).toContain('本次会话内不再询问');
    expect(html).toContain('拉取镜像');
  });
});

describe('Fullscreen viewer title bar', () => {
  function titleBar(overrides: Partial<Parameters<typeof ViewerTitleBar>[0]> = {}): string {
    return renderToStaticMarkup(
      createElement(ViewerTitleBar, {
        t,
        title: 'atlas 的屏幕',
        phase: 'live',
        reconnecting: false,
        busy: false,
        stopping: false,
        interactive: false,
        onToggleInteractive: () => undefined,
        onStop: () => undefined,
        onCollapse: () => undefined,
        ...overrides,
      }),
    );
  }

  it('carries the Bot name, live status, stop, and collapse together', () => {
    const html = titleBar();
    expect(html).toContain('atlas 的屏幕');
    expect(html).toContain('已连接');
    expect(html).toContain('data-state="done"');
    expect(html).toContain('停止');
    expect(html).toContain('收起全屏');
  });

  it('shows the connecting label while the stream is not live yet', () => {
    const html = titleBar({ phase: 'connecting' });
    expect(html).toContain('连接中');
    expect(html).toContain('data-state="ongoing"');
  });

  it('defaults to watch-only and offers enabling input', () => {
    const html = titleBar();
    expect(html).toContain('观看模式');
    expect(html).toContain('开启交互');
    expect(html).not.toContain('停止交互');
  });

  it('reflects interactive mode once the Human enables input', () => {
    const html = titleBar({ interactive: true });
    expect(html).toContain('停止交互');
    expect(html).not.toContain('观看模式');
    expect(html).toContain('aria-pressed="true"');
  });

  it('prefers the reconnecting label and reports the empty state as an error', () => {
    const reconnecting = titleBar({ phase: 'connecting', reconnecting: true });
    expect(reconnecting).toContain('正在重新连接');
    const empty = titleBar({ phase: 'empty' });
    expect(empty).toContain('暂无画面');
    expect(empty).toContain('data-state="error"');
  });

  it('disables stop while a stop is already underway', () => {
    const html = titleBar({ stopping: true });
    expect(html).toContain('停止中');
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});

describe('StreamOverlay selector', () => {
  function overlay(overrides: Partial<Parameters<typeof StreamOverlay>[0]> = {}): string {
    return renderToStaticMarkup(
      createElement(StreamOverlay, {
        phase: 'connecting',
        reconnecting: false,
        hovered: false,
        t,
        onRetry: () => undefined,
        onOpen: () => undefined,
        ...overrides,
      }),
    );
  }

  it('shows the connecting notice with no pill while the stream is not live', () => {
    const html = overlay({ phase: 'connecting', hovered: true });
    expect(html).toContain('连接中');
    expect(html).not.toContain('打开大屏');
  });

  it('shows the empty state with retry after sustained silence', () => {
    const html = overlay({ phase: 'empty' });
    expect(html).toContain('暂无画面');
    expect(html).toContain('重新连接');
    expect(html).not.toContain('打开大屏');
  });

  it('offers the Open pill only on a live hovered frame', () => {
    expect(overlay({ phase: 'live', hovered: false })).toBe('');
    expect(overlay({ phase: 'live', hovered: true })).toContain('打开大屏');
  });
});

describe('Computer authorize storage note', () => {
  it('shows the resolved storage and bind risk on the authorize view', () => {
    const html = view({
      confirming: true,
      storage: { kind: 'bind', target: '/srv/bh-computer' },
    });
    expect(html).toContain('/srv/bh-computer');
    expect(html).toContain('SQLite');
  });

  it('hides the bind risk for volume storage', () => {
    const html = view({
      confirming: true,
      storage: { kind: 'volume', target: 'botharness-computer-config' },
    });
    expect(html).toContain('botharness-computer-config');
    expect(html).not.toContain('SQLite');
  });
});

describe('Computer authorize migration notice', () => {
  it('shows the migration hint on the authorize view', () => {
    const html = view({
      confirming: true,
      storage: {
        kind: 'bind',
        target: '/srv/bh-new',
        migrationHint: '存储位置已变更为 /srv/bh-new，运行中的容器保持不变',
      },
    });
    expect(html).toContain('存储位置已变更');
  });
});

interface EntryProps {
  readonly scope: 'channel' | 'personabot';
  readonly channelId: string;
  readonly botSlug: string | undefined;
  readonly actions: unknown;
}

interface EntryRegistration {
  readonly component: (props: EntryProps) => ReactElement;
}

type RpcCall = (
  channel: string,
  endpoint: string,
  payload: unknown,
) => Promise<
  | { readonly ok: true; readonly value: unknown }
  | { readonly ok: false; readonly error: { readonly message?: string } }
>;

/** Mount the entry exactly as the sidebar registry does, through `apply`. */
function mountEntry(
  rpcCall: RpcCall,
  botSlug: string | undefined,
  status: { probeAvailable?: boolean; state?: string } = {},
): {
  container: HTMLElement;
  render: () => Promise<void>;
  dispose: () => Promise<void>;
} {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        provider: 'docker',
        probe: { available: status.probeAvailable ?? true },
        status: { state: status.state ?? 'stopped' },
      }),
    })),
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
    },
  );
  const entries: EntryRegistration[] = [];
  const settings = {
    get: () => ({
      getSnapshot: () => ({ status: 'ready' as const, value: undefined, writable: true }),
      subscribe: () => () => {},
      set: async () => {},
    }),
  };
  const ctx = {
    locale: { bind: () => t, register: () => () => {} },
    inject: (deps: string[], callback: (context: unknown) => void) => {
      if (deps.includes('configForms')) {
        callback({ configForms: settings });
        return;
      }
      if (deps.includes('uiWorkspace')) {
        callback({
          uiWorkspace: { pickDirectory: async () => null },
          slots: {
            inject: (_name: string, register: () => void) => {
              register();
            },
            register: () => () => {},
          },
        });
        return;
      }
      callback({
        channelSidebar: {
          register: (entry: EntryRegistration) => {
            entries.push(entry);
            return () => {};
          },
        },
        connection: { rpc: { call: rpcCall } },
      });
    },
    effect: (callback: () => unknown) => {
      callback();
    },
  };
  apply(ctx as unknown as Parameters<typeof apply>[0]);
  const registration = entries[0];
  if (registration === undefined) throw new Error('computer entry was not registered');
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  return {
    container,
    async render() {
      await act(async () => {
        root.render(
          createElement(registration.component, {
            scope: 'personabot',
            channelId: 'dm-ada',
            botSlug,
            actions: undefined,
          }),
        );
      });
    },
    async dispose() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Computer entry access switch', () => {
  it('shows the Bot Computer Access and toggles it through the bridge', async () => {
    const calls: { endpoint: string; payload: unknown }[] = [];
    const rpcCall: RpcCall = async (_channel, endpoint, payload) => {
      calls.push({ endpoint, payload });
      if (endpoint === 'botharness/list') {
        return {
          ok: true,
          value: { bots: [{ slug: 'ada', displayName: 'Ada', computerAccess: false }] },
        };
      }
      if (endpoint === 'botharness/computerAccessSet') {
        return { ok: true, value: { bot: { slug: 'ada', computerAccess: true } } };
      }
      return { ok: false, error: { message: `unexpected ${endpoint}` } };
    };
    const view = mountEntry(rpcCall, 'ada');
    try {
      await view.render();
      const toggle = view.container.querySelector<HTMLButtonElement>('button[role="switch"]');
      expect(toggle).not.toBeNull();
      expect(toggle?.getAttribute('aria-checked')).toBe('false');
      expect(view.container.textContent).toContain('开启后，该 Bot 的会话可以操作这台电脑');

      await act(async () => {
        toggle?.click();
      });

      expect(calls).toContainEqual({
        endpoint: 'botharness/computerAccessSet',
        payload: { args: { slug: 'ada', enabled: true } },
      });
      expect(toggle?.getAttribute('aria-checked')).toBe('true');
    } finally {
      await view.dispose();
    }
  });

  it('rolls the switch back and shows the failure when the write rejects', async () => {
    const rpcCall: RpcCall = async (_channel, endpoint) => {
      if (endpoint === 'botharness/list') {
        return { ok: true, value: { bots: [{ slug: 'ada', computerAccess: true }] } };
      }
      throw new Error('bridge down');
    };
    const view = mountEntry(rpcCall, 'ada');
    try {
      await view.render();
      const toggle = view.container.querySelector<HTMLButtonElement>('button[role="switch"]');
      expect(toggle?.getAttribute('aria-checked')).toBe('true');

      await act(async () => {
        toggle?.click();
      });

      expect(toggle?.getAttribute('aria-checked')).toBe('true');
      expect(view.container.textContent).toContain('bridge down');
    } finally {
      await view.dispose();
    }
  });

  it('disables the switch while the write is in flight', async () => {
    let release: ((result: { ok: true; value: unknown }) => void) | undefined;
    const rpcCall: RpcCall = (_channel, endpoint) => {
      if (endpoint === 'botharness/list') {
        return Promise.resolve({
          ok: true,
          value: { bots: [{ slug: 'ada', computerAccess: false }] },
        });
      }
      return new Promise<{ ok: true; value: unknown }>((resolve) => {
        release = resolve;
      });
    };
    const view = mountEntry(rpcCall, 'ada');
    try {
      await view.render();
      const toggle = view.container.querySelector<HTMLButtonElement>('button[role="switch"]');
      await act(async () => {
        toggle?.click();
      });
      expect(toggle?.disabled).toBe(true);
      await act(async () => {
        release?.({ ok: true, value: { bot: { slug: 'ada', computerAccess: true } } });
      });
      expect(toggle?.disabled).toBe(false);
      expect(toggle?.getAttribute('aria-checked')).toBe('true');
    } finally {
      await view.dispose();
    }
  });

  it('disables the switch when the sidebar entry has no PersonaBot slug', async () => {
    const rpcCall: RpcCall = async () => ({ ok: true, value: {} });
    const view = mountEntry(rpcCall, undefined);
    try {
      await view.render();
      const toggle = view.container.querySelector<HTMLButtonElement>('button[role="switch"]');
      expect(toggle?.disabled).toBe(true);
    } finally {
      await view.dispose();
    }
  });

  it('keeps the switch visible above the setup guidance', async () => {
    const rpcCall: RpcCall = async () => ({ ok: true, value: {} });
    const view = mountEntry(rpcCall, 'ada', { probeAvailable: false });
    try {
      await view.render();
      expect(view.container.querySelector('button[role="switch"]')).not.toBeNull();
      expect(view.container.textContent).toContain('未检测到容器运行时');
    } finally {
      await view.dispose();
    }
  });

  it('keeps the switch above the running viewer', async () => {
    const rpcCall: RpcCall = async (_channel, endpoint) => {
      if (endpoint === 'botharness/list') {
        return { ok: true, value: { bots: [{ slug: 'ada', computerAccess: true }] } };
      }
      return { ok: true, value: {} };
    };
    const view = mountEntry(rpcCall, 'ada', { state: 'running' });
    try {
      await view.render();
      const toggle = view.container.querySelector<HTMLButtonElement>('button[role="switch"]');
      expect(toggle?.getAttribute('aria-checked')).toBe('true');
      expect(view.container.querySelector('iframe')).not.toBeNull();
    } finally {
      await view.dispose();
    }
  });
});

describe('Recent operational logs', () => {
  it('renders rows with kind and detail', () => {
    const html = renderToStaticMarkup(
      createElement(RecentLogsList, {
        entries: [
          {
            id: 2,
            ts: 3000,
            plugin: 'computer',
            owner: 'profile-shared',
            kind: 'lifecycle',
            detail: 'stop requested',
          },
          {
            id: 1,
            ts: 1000,
            plugin: 'computer',
            owner: 'profile-shared',
            kind: 'lifecycle',
            detail: 'start requested',
          },
        ],
      }),
    );
    expect(html).toContain('[lifecycle] stop requested');
    expect(html).toContain('[lifecycle] start requested');
    expect(html.indexOf('stop requested')).toBeLessThan(html.indexOf('start requested'));
  });

  it('renders the collapsed toggle without fetching', () => {
    const html = renderToStaticMarkup(createElement(RecentLogs, { t }));
    expect(html).toContain('近期动态');
    expect(html).not.toContain('暂无运行记录');
  });
});
