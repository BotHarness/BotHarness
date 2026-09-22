import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () => {
  const { createElement } = await import('react');
  const glyph = () => null;
  const control = (props: Record<string, unknown>) => {
    const { children, variant: _variant, size: _size, ...rest } = props;
    return createElement('button', { type: 'button', ...rest }, children as never);
  };
  const dot = (props: { state?: string }) => createElement('span', { 'data-state': props.state });
  return {
    IconChevronDownOutline14: glyph,
    IconCloseFill14: glyph,
    IconFolderOpenOutline16: glyph,
    IconSettingsOutline16: glyph,
    IconFullscreenOutline16: glyph,
    Menu: glyph,
    Button: control,
    Pill: control,
    StateDot: dot,
  };
});

import {
  apply,
  ComputerEntryView,
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
      bind: () => ({
        getSnapshot: () => ({ status: 'ready' as const, value: undefined, writable: true }),
        subscribe: () => () => {},
        set: async () => {},
      }),
    };
    const ctx = {
      locale: { bind: () => t, register: () => () => {} },
      inject: (deps: string[], callback: (context: unknown) => void) => {
        if (deps.includes('settingsScope')) {
          callback({ settingsScope: settings });
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

  it('renders the live viewer, its connecting overlay, and stop while running', () => {
    const html = view({ state: 'running', botSlug: 'atlas' });
    expect(html).toContain('<iframe');
    expect(html).toContain('/botharness-computer/viewer/');
    expect(html).toContain('停止');
    expect(html).toContain('atlas 的屏幕');
    // The stream is not live yet in a static render, so the loading state shows.
    expect(html).toContain('连接中');
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
