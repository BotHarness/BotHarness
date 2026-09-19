import { describe, expect, it } from 'vitest';

import { registerModeShadow } from '../src/client/mode.js';
import { createStore } from '../src/client/store.js';

describe('mode shadow', () => {
  it('registers while bot mode is active and disposes on exit', () => {
    const clientStore = createStore();
    const registered: string[] = [];
    const disposed: string[] = [];
    let teardown: (() => void) | undefined;
    const ctx = {
      slots: {
        inject: (_name: string, factory: () => unknown) => {
          teardown = factory() as () => void;
        },
      },
    };

    registerModeShadow(
      ctx as never,
      'sidebar.workspaces',
      () => {
        registered.push('shadow');
        return () => {
          disposed.push('shadow');
        };
      },
      clientStore,
    );

    expect(registered).toEqual([]);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow']);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow']);
    clientStore.setMode('dsh');
    expect(disposed).toEqual(['shadow']);
    clientStore.setMode('bot');
    expect(registered).toEqual(['shadow', 'shadow']);

    teardown?.();
    expect(disposed).toEqual(['shadow', 'shadow']);
  });
});
