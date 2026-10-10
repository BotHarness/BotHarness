// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BrowserApiError,
  BrowserFailureNotice,
  BrowserProvisionProgress,
  readFailure,
} from '../src/client/browser-failure.js';
import { en, zh, type BrowserKey, type BrowserTranslate } from '../src/client/locale.js';
import { BROWSER_FAILURE_KINDS } from '../src/failure-kinds.js';

let root: Root;
let host: HTMLDivElement;

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render(node: React.ReactElement): Promise<void> {
  await act(async () => root.render(node));
}

describe('BrowserApiError', () => {
  it('carries code and detail through panel requests, falling back to raw text', () => {
    expect(readFailure(new BrowserApiError('plain', 'provision-no-network', 'raw'))).toEqual({
      message: 'plain',
      code: 'provision-no-network',
      detail: 'raw',
    });
    expect(readFailure(new Error('boom'))).toEqual({ message: 'boom' });
    expect(readFailure('nope')).toEqual({ message: 'nope' });
  });
});

describe('BrowserFailureNotice', () => {
  it.each(BROWSER_FAILURE_KINDS)('renders what, fault, and one action for %s', async (kind) => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw fallback', code: kind, detail: 'raw-code-127' },
        t,
      }),
    );
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.title`]);
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.fault`]);
    expect(alert?.textContent).toContain(en[`entry.fail.${kind}.action`]);
    expect(alert?.textContent).toContain('raw-code-127');
    expect(alert?.textContent).not.toContain('raw fallback');
  });

  it('renders the Chinese triple for the same code', async () => {
    const t = ((key: BrowserKey) => zh[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw', code: 'provision-no-network', detail: '' },
        t,
      }),
    );
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('本机网络似乎不通');
  });

  it('renders nothing for unknown codes so callers fall back to raw text', async () => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserFailureNotice, {
        failure: { message: 'raw fallback' },
        t,
      }),
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('BrowserProvisionProgress', () => {
  it('shows percent and MB while downloading', async () => {
    const t = ((key: BrowserKey, params?: Record<string, string | number>) =>
      en[key]
        .replace('{percent}', String(params?.['percent']))
        .replace('{downloaded}', String(params?.['downloaded']))
        .replace('{total}', String(params?.['total']))) as BrowserTranslate;
    await render(
      createElement(BrowserProvisionProgress, {
        progress: { downloadedBytes: 75 * 1024 * 1024, totalBytes: 150 * 1024 * 1024 },
        t,
      }),
    );
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain('50%');
    expect(status?.textContent).toContain('75.0 MB');
    expect(status?.textContent).toContain('150.0 MB');
    const bar = host.querySelector('progress');
    expect(bar?.getAttribute('value')).toBe(String(75 * 1024 * 1024));
    expect(bar?.getAttribute('max')).toBe(String(150 * 1024 * 1024));
  });

  it('shows a preparing state before the first byte count', async () => {
    const t = ((key: BrowserKey) => en[key]) as BrowserTranslate;
    await render(
      createElement(BrowserProvisionProgress, {
        progress: { downloadedBytes: 0, totalBytes: 0 },
        t,
      }),
    );
    expect(host.querySelector('[role="status"]')?.textContent).toContain('Preparing');
    expect(host.querySelector('progress')).toBeNull();
  });
});
