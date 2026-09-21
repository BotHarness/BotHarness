import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutline16: stub,
    IconChevronDownOutline14: stub,
    IconChevronRightOutline14: stub,
    IconCloseOutline16: stub,
    IconEditOutline16: stub,
    IconEllipsisOutline16: stub,
    IconNewChatOutline16: stub,
    IconPanelLeftOutline16: stub,
    IconTriangleRightFill14: stub,
    IconTrashOutline16: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    Input: stub,
    Menu: stub,
    Modal: stub,
    StateDot: stub,
    Tag: stub,
    Tooltip: stub,
    relativeTime: () => ({ unit: 'now', n: 0 }),
  };
});

import { apply, PANEL_ID } from '../src/client/index.js';
import { store } from '../src/client/store.js';

interface Spec {
  name: string;
  id?: string;
  key?: string;
  priority?: number;
  order?: number;
  label?: string;
  inject?: () => unknown;
}

interface FakeScope {
  getSnapshot(): {
    status: 'ready';
    value: {
      motionPreference: 'system';
      sortMode: 'updated';
      sortModes: Record<string, never>;
    };
    user: Record<string, never>;
    writable: boolean;
    mode: 'host';
  };
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  mutate(ops: readonly unknown[]): Promise<void>;
}

function fakeScope(): FakeScope {
  return {
    getSnapshot: () => ({
      status: 'ready',
      value: {
        botIcon: 'mascot' as const,
        motionPreference: 'system',
        sortMode: 'updated',
        sortModes: {},
      },
      user: {},
      writable: true,
      mode: 'host',
    }),
    subscribe: () => () => undefined,
    set: async () => undefined,
    mutate: async () => undefined,
  };
}

function createScoped(specs: Spec[], disposed: Spec[], withSettings = false) {
  const scoped: Record<string, unknown> = {
    slots: {
      inject: (_name: string, callback: () => unknown) => callback(),
      register: (spec: Spec) => {
        specs.push(spec);
        return () => {
          disposed.push(spec);
        };
      },
    },
    connection: {
      rpc: {
        call: async () => ({ ok: true, value: { bots: [], channels: [] } }),
      },
    },
    inputTriggers: {
      registerSource: () => () => undefined,
    },
    locale: {
      register: () => () => undefined,
      bind: () => (key: string) => key,
    },
    provide: () => () => undefined,
    effect: (callback: () => unknown) => {
      callback();
      return () => undefined;
    },
    inject: (_deps: string[], callback: (ctx: unknown) => unknown) => {
      if (withSettings) {
        callback({ ...scoped, settingsScope: { bind: () => fakeScope() } });
      }
      return () => undefined;
    },
  };
  return scoped;
}

describe('client apply', () => {
  it('registers the bot-mode entry, the main panel, and the mode shadows', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    const disposed: Spec[] = [];
    apply(createScoped(specs, disposed) as never);

    expect(specs.map((spec) => spec.name)).toEqual(['sidebar.panellist', 'main']);
    expect(specs[0]).toMatchObject({
      id: PANEL_ID,
      order: 10,
      label: expect.any(Function),
      locale: 'botharness',
    });
    expect(specs[1]).toMatchObject({ key: PANEL_ID });

    store.setMode('bot');
    expect(specs.map((spec) => spec.name)).toEqual([
      'sidebar.panellist',
      'main',
      'sidebar.workspaces',
      'main',
    ]);
    expect(specs[2]).toMatchObject({
      name: 'sidebar.workspaces',
      priority: -100,
      locale: 'botharness',
    });
    expect(specs[3]).toMatchObject({ name: 'main', key: 'conversation', priority: -100 });

    store.setMode('dsh');
    expect(disposed.map((spec) => spec.name)).toEqual(['sidebar.workspaces', 'main']);
  });

  it('registers the BotHarness settings section only while settingsScope is served', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    const disposed: Spec[] = [];
    apply(createScoped(specs, disposed, true) as never);

    const section = specs.find((spec) => spec.name === 'settings.section');
    expect(section).toMatchObject({ id: 'botharness', order: 25, locale: 'botharness' });
    expect(section?.inject).toBeTypeOf('function');
    expect(section?.label).toBeTypeOf('function');

    const withoutSettings: Spec[] = [];
    apply(createScoped(withoutSettings, []) as never);
    expect(withoutSettings.some((spec) => spec.name === 'settings.section')).toBe(false);
  });
});
