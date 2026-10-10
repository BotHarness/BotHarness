import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';
const candidate = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime/agent-browser.js', () => ({ createAgentBrowserRuntime: candidate }));
import { createBotBrowserRuntimes } from '../src/runtimes.js';
import { type BotBrowserRuntimeOptions, createBotBrowserRuntime } from '../src/runtime/browser.js';

describe('managed Container driver selection', () => {
  it('keys target and driver separately while keeping the same owning Container profile', async () => {
    const stopCurrent = vi.fn(async () => undefined);
    const stopCandidate = vi.fn(async () => undefined);
    const root = join(tmpdir(), 'browser-container-driver');
    const current = createBotBrowserRuntime({ userDataDir: join(root, 'unused') });
    const alternate = createBotBrowserRuntime({ userDataDir: join(root, 'unused-candidate') });
    current.stop = stopCurrent;
    alternate.stop = stopCandidate;
    candidate.mockReturnValue(alternate);
    const create = vi.fn((_options: BotBrowserRuntimeOptions) => current);
    let driver: 'current' | 'agent-browser' = 'current';
    const runtimes = createBotBrowserRuntimes({
      browserDir: join(root, 'browser'),
      installDir: join(root, 'install'),
      profileOf: () => 'work',
      target: () => 'container',
      driver: () => driver,
      create,
    });
    expect(runtimes.for('a')).toBe(current);
    expect(runtimes.for('b')).toBe(current);
    driver = 'agent-browser';
    expect(runtimes.for('a')).toBe(alternate);
    expect(runtimes.for('b')).toBe(alternate);
    expect(candidate).toHaveBeenCalledOnce();
    const currentOptions = create.mock.calls[0]![0];
    const candidateOptions = candidate.mock.calls[0]?.[0];
    expect(candidateOptions.userDataDir).toBe(join(root, 'browser-profiles', 'work'));
    expect(currentOptions).toMatchObject({ userDataDir: candidateOptions.userDataDir });
    expect(candidateOptions.execution).toBeDefined();
    expect(candidateOptions.execution).not.toBe(currentOptions.execution);
    await runtimes.stopAll();
    expect(stopCurrent).toHaveBeenCalledOnce();
    expect(stopCandidate).toHaveBeenCalledOnce();
  });
});
