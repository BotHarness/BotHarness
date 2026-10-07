// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

import { createPersonaBot, type BridgeCall } from '../src/client/bridge.js';
import { GitSettings } from '../src/client/git-settings.js';
import {
  en,
  zhTranslate,
  type BotHarnessKey,
  type BotHarnessTranslate,
} from '../src/client/locale.js';

const enTranslate = ((key: BotHarnessKey, params?: Record<string, string>) =>
  en[key].replace(/\{(\w+)\}/gu, (_, name: string) => params?.[name] ?? '')) as BotHarnessTranslate;

const IDLE = { installable: true, install: { phase: 'idle' } };

async function render(value: unknown, t: BotHarnessTranslate = zhTranslate) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const call = vi.fn<BridgeCall>(async () => ({ ok: true, value }));
  await act(async () => {
    root.render(createElement(GitSettings, { call, t } as never));
  });
  await act(async () => {
    await Promise.resolve();
  });
  const row = host.querySelector<HTMLElement>('[data-git-setting]')!;
  const result = { state: row.dataset['gitSetting'], text: row.textContent ?? '' };
  act(() => root.unmount());
  host.remove();
  return result;
}

describe('GitSettings', () => {
  it('shows the Git version in use and whether it is the system or Managed Git', async () => {
    expect(
      await render({ available: true, version: '2.47.1', source: 'system', ...IDLE }),
    ).toMatchObject({ state: 'system', text: expect.stringContaining('2.47.1（系统）') });
    expect(
      await render({ available: true, version: '2.53.0', source: 'managed', ...IDLE }, enTranslate),
    ).toMatchObject({ state: 'managed', text: expect.stringContaining('2.53.0 (managed)') });
  });

  it('says when no usable Git is available', async () => {
    expect(
      await render({ available: false, reason: 'too-old', version: '2.20.1', ...IDLE }),
    ).toMatchObject({ state: 'too-old', text: expect.stringContaining('2.20.1 太旧') });
    expect(await render({ available: false, reason: 'missing', ...IDLE })).toMatchObject({
      state: 'missing',
      text: expect.stringContaining('不可用'),
    });
  });
});

describe('Import from GitHub result', () => {
  it('carries the HTTPS fallback the Host reports', async () => {
    const bot = { slug: 'ada', displayName: 'Ada', status: 'active', roles: [] };
    const call = vi.fn<BridgeCall>(async () => ({
      ok: true,
      value: {
        bot,
        httpsFallback: {
          from: 'git@h:o/r.git',
          to: 'https://h/o/r.git',
          reason: 'auth',
          detail: 'Permission denied (publickey).',
        },
      },
    }));
    const created = await createPersonaBot(call, {
      displayName: 'Ada',
      roles: [],
      gitUrl: 'git@h:o/r.git',
    });
    expect(created.httpsFallback).toEqual({
      from: 'git@h:o/r.git',
      to: 'https://h/o/r.git',
      reason: 'auth',
      detail: 'Permission denied (publickey).',
    });
    expect(call).toHaveBeenCalledWith(
      'createFromGit',
      { displayName: 'Ada', roles: [], gitUrl: 'git@h:o/r.git' },
      undefined,
    );
  });
});
