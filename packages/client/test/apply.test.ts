import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => {
  const stub = () => null;
  return {
    Button: stub,
    IconAgentPresetOutline16: stub,
    IconChevronDownOutline14: stub,
    IconChevronRightOutline14: stub,
    IconNewChatOutline16: stub,
    IconPlusOutline16: stub,
    IconSearchOutline16: stub,
    IconSendOutline16: stub,
    Input: stub,
    Menu: stub,
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
  label?: string;
  inject?: () => unknown;
}

function createScoped(specs: Spec[], disposed: Spec[]) {
  return {
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
    effect: (callback: () => unknown) => {
      callback();
      return () => undefined;
    },
  };
}

describe('client apply', () => {
  it('registers the bot-mode entry, the main panel, and the mode shadows', () => {
    store.setMode('dsh');
    const specs: Spec[] = [];
    const disposed: Spec[] = [];
    apply(createScoped(specs, disposed) as never);

    expect(specs.map((spec) => spec.name)).toEqual(['sidebar.panellist', 'main']);
    expect(specs[0]).toMatchObject({ id: PANEL_ID, order: 10, label: 'BOT 模式' });
    expect(specs[1]).toMatchObject({ key: PANEL_ID });

    store.setMode('bot');
    expect(specs.map((spec) => spec.name)).toEqual([
      'sidebar.panellist',
      'main',
      'sidebar.workspaces',
      'main',
    ]);
    expect(specs[2]).toMatchObject({ name: 'sidebar.workspaces', priority: -100 });
    expect(specs[3]).toMatchObject({ name: 'main', key: 'conversation', priority: -100 });

    store.setMode('dsh');
    expect(disposed.map((spec) => spec.name)).toEqual(['sidebar.workspaces', 'main']);
  });
});
