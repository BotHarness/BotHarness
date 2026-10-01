// @vitest-environment jsdom
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  const spawn = vi.fn();
  return { ...actual, spawn, default: { ...actual, spawn } };
});
import { ChildProcess, spawn } from 'node:child_process';
import { createBotBrowserRuntime } from '../src/runtime/browser.js';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

async function runtimeWithDocument(html: string) {
  document.body.innerHTML = html;
  const dir = mkdtempSync(join(tmpdir(), 'browser-editability-'));
  dirs.push(dir);
  const child = new ChildProcess();
  const stderr = new PassThrough();
  vi.mocked(spawn).mockImplementation(() => {
    queueMicrotask(() =>
      stderr.emit('data', Buffer.from('DevTools listening on ws://127.0.0.1:1/devtools/browser/a')),
    );
    return Object.assign(child, {
      stderr,
      exitCode: null,
      killed: false,
      kill: vi.fn(),
    });
  });
  const runtime = createBotBrowserRuntime({
    userDataDir: dir,
    browserPath: '/fixture/chrome',
    fileExists: () => true,
    connect: async () => ({
      send: async (method, params) => {
        if (method === 'Target.attachToTarget') return { sessionId: 'fixture' };
        if (method === 'Runtime.evaluate') {
          return { result: { value: new Function(`return ${params?.['expression']}`)() } };
        }
        return {};
      },
      subscribe: () => () => undefined,
      close: () => undefined,
    }),
  });
  await runtime.ensure();
  return runtime;
}

describe('Browser typing respects native editability', () => {
  it.each([
    '<input data-botharness-ref="target" readonly value="original">',
    '<textarea data-botharness-ref="target" readonly>original</textarea>',
    '<input data-botharness-ref="target" disabled value="original">',
    '<textarea data-botharness-ref="target" disabled>original</textarea>',
    '<fieldset disabled><input data-botharness-ref="target" value="original"></fieldset>',
    '<fieldset disabled><legend>first</legend><legend><input data-botharness-ref="target" value="original"></legend></fieldset>',
  ])('refuses protected control without value, focus, or events: %s', async (html) => {
    const runtime = await runtimeWithDocument('<input id="focus">' + html);
    const focus = document.querySelector<HTMLInputElement>('#focus')!;
    const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '[data-botharness-ref]',
    )!;
    focus.focus();
    const input = vi.fn();
    const change = vi.fn();
    target.addEventListener('input', input);
    target.addEventListener('change', change);
    await expect(runtime.type('tab', 'target', 'changed')).rejects.toThrow(/readonly|disabled/);
    expect(target.value).toBe('original');
    expect(document.activeElement).toBe(focus);
    expect(input).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
  });

  it.each([
    '<input data-botharness-ref="target" value="original">',
    '<textarea data-botharness-ref="target">original</textarea>',
    '<fieldset disabled><legend><input data-botharness-ref="target" value="original"></legend></fieldset>',
  ])('still edits an enabled field and the first-legend exception: %s', async (html) => {
    const runtime = await runtimeWithDocument(html);
    const target = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(
      '[data-botharness-ref]',
    )!;
    const input = vi.fn();
    const change = vi.fn();
    target.addEventListener('input', input);
    target.addEventListener('change', change);
    await runtime.type('tab', 'target', 'changed');
    expect(target.value).toBe('changed');
    expect(document.activeElement).toBe(target);
    expect(input).toHaveBeenCalledOnce();
    expect(change).toHaveBeenCalledOnce();
  });
});
