import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { apply, ComputerEntryView, type ComputerEntryViewProps } from '../src/client/index.js';

function view(overrides: Partial<ComputerEntryViewProps> = {}): string {
  const props: ComputerEntryViewProps = {
    state: 'stopped',
    runtimeAvailable: true,
    confirming: false,
    busy: false,
    elapsed: 0,
    nowTs: 0,
    onStart: () => undefined,
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
    const ctx = {
      inject: (_deps: string[], callback: (context: unknown) => void) => {
        callback({ channelSidebar: registry });
      },
      effect: (callback: () => () => void) => {
        disposed = callback();
      },
    };

    apply(ctx as unknown as Parameters<typeof apply>[0]);

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

  it('renders the live viewer and stop while running', () => {
    const html = view({ state: 'running', botSlug: 'atlas' });
    expect(html).toContain('<iframe');
    expect(html).toContain('/botharness-computer/viewer/');
    expect(html).toContain('停止');
    expect(html).toContain('atlas');
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
