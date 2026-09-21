import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    IconChevronDownOutline14: stub,
    IconCloseFill14: stub,
    IconFolderOpenOutline16: stub,
    IconSettingsOutline16: stub,
    Menu: stub,
  };
});

import { apply, ComputerEntryView, type ComputerEntryViewProps } from '../src/client/index.js';
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
