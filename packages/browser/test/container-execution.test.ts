import { describe, expect, it, vi } from 'vitest';

import {
  CONTAINER_BROWSER_IMAGE,
  containerBrowserArgs,
  containerBrowserIdentity,
  createContainerBrowserExecution,
} from '../src/runtime/container.js';

describe('Container Browser execution boundary', () => {
  it('keeps identity profile-scoped and separates named profiles', () => {
    expect(containerBrowserIdentity('/qa/profile/browser')).toBe(
      containerBrowserIdentity('/qa/profile/browser'),
    );
    expect(containerBrowserIdentity('/qa/profile/browser')).not.toBe(
      containerBrowserIdentity('/qa/other/browser'),
    );
    expect(containerBrowserIdentity('/qa/profile/browser')).not.toBe(
      containerBrowserIdentity('/qa/profile/browser-profiles/work'),
    );
  });

  it('publishes only a loopback viewer and never mounts Host or Computer resources', () => {
    const args = containerBrowserArgs('abc');
    expect(args.at(-1)).toBe(CONTAINER_BROWSER_IMAGE);
    expect(CONTAINER_BROWSER_IMAGE).toMatch(/@sha256:[a-f0-9]{64}$/u);
    expect(args.filter((arg) => arg.includes('type='))).toEqual([
      'type=volume,source=botharness-browser-abc,target=/config',
    ]);
    expect(args[args.indexOf('--publish') + 1]).toBe('127.0.0.1::3000');
    expect(args.join(' ')).not.toMatch(
      /--privileged|docker\.sock|--network host|botharness-computer/u,
    );
    expect(args).toContain('no-new-privileges=true');
    expect(args).toContain('SUBFOLDER=/botharness-browser/viewer/abc/');
    expect(args).toContain('START_DOCKER=false');
  });

  it('refuses an existing foreign container without stopping or deleting it', async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'info') return '29';
      if (args[0] === 'ps') return 'occupied';
      if (args[0] === 'inspect') return 'another-owner';
      throw new Error('unexpected mutation');
    });
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run,
    });
    await expect(execution.start()).rejects.toThrow('belongs to another owner');
    expect(run.mock.calls.every(([args]) => ['info', 'ps', 'inspect'].includes(args[0]!))).toBe(
      true,
    );
    expect(execution.isRunning()).toBe(false);
  });

  it('rejects a foreign persistent volume before launching any browser', async () => {
    const run = vi.fn(async (args: readonly string[]) => {
      if (args[0] === 'info') return '29';
      if (args[0] === 'ps') return '';
      if (args[0] === 'volume' && args[1] === 'create') return 'existing';
      if (args[0] === 'volume' && args[1] === 'inspect') return 'foreign';
      throw new Error('unexpected mutation');
    });
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run,
    });
    await expect(execution.start()).rejects.toThrow('volume belongs to another owner');
    expect(run.mock.calls.some(([args]) => args[0] === 'run')).toBe(false);
  });

  it('reports missing Docker explicitly without publishing a viewer or claiming running', async () => {
    const execution = createContainerBrowserExecution({
      profileDirectory: '/qa/profile/browser',
      run: async () => {
        throw new Error('Docker unavailable');
      },
    });
    await expect(execution.start()).rejects.toThrow(
      'Container Bot Browser startup failed: Docker unavailable',
    );
    expect(execution.isRunning()).toBe(false);
    expect(execution.viewerUrl()).toBeUndefined();
    await expect(execution.prepareUpload('/qa/file')).rejects.toThrow('not running');
  });
});
