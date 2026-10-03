import { EventEmitter } from 'node:events';
import type { Page } from 'playwright-core';
import { expect, it, vi } from 'vitest';
import { createDailyDocument } from '../src/daily-document.js';
import type { BrowserObservation } from '../src/runtime/browser.js';

function fixture() {
  const page = new EventEmitter();
  const browser = new EventEmitter();
  const frame = {};
  const click = vi.fn(async () => undefined);
  const fill = vi.fn(async (_text: string) => undefined);
  const dispose = vi.fn(async () => undefined);
  const revoke = vi.fn();
  let text = 'Human initial note';
  const selected = Object.assign(page, {
    isClosed: () => false,
    url: () => 'https://example.com/account',
    bringToFront: vi.fn(async () => undefined),
    title: async () => 'Account',
    mainFrame: () => frame,
    context: () => ({ browser: () => Object.assign(browser, { isConnected: () => true }) }),
    $$: async () => [
      { evaluate: async () => ({ role: 'textbox', name: text }), click, fill, dispose },
    ],
    locator: () => ({ innerText: async () => text }),
  }) as unknown as Page;
  const document = createDailyDocument(selected, revoke);
  const observe = async () => (await document.execute('observe', {})) as BrowserObservation;
  return {
    document,
    page,
    browser,
    frame,
    click,
    fill,
    dispose,
    revoke,
    observe,
    edit: (value: string) => {
      text = value;
    },
  };
}
it('connection alone permits neither observation nor input; every new observe invalidates old refs', async () => {
  const f = fixture();
  await expect(f.observe()).rejects.toThrow('Allow control');
  await expect(f.document.execute('type', { ref: 'any', text: 'private' })).rejects.toThrow(
    'Allow control',
  );
  await f.document.execute('grant', {});
  const old = (await f.observe()).elements[0]!.ref;
  const current = (await f.observe()).elements[0]!.ref;
  expect(old).not.toBe(current);
  await expect(f.document.execute('type', { ref: old, text: 'private' })).rejects.toThrow('stale');
  await f.document.execute('type', { ref: current, text: 'current' });
  expect(f.fill).toHaveBeenCalledExactlyOnceWith('current', { timeout: 3000 });
});
it('Pause invalidates refs, allows fresh read-only observation, and Resume requires a new observe', async () => {
  const f = fixture();
  await f.document.execute('grant', {});
  const ref = (await f.observe()).elements[0]!.ref;
  await f.document.execute('pause', { active: true });
  f.edit('Human edited');
  const paused = await f.observe();
  expect(paused.text).toBe('Human edited');
  await expect(f.document.execute('click', { ref })).rejects.toThrow('Pause');
  await f.document.execute('pause', { active: false });
  await expect(f.document.execute('click', { ref: paused.elements[0]!.ref })).rejects.toThrow(
    'fresh',
  );
  const latest = await f.observe();
  await f.document.execute('click', { ref: latest.elements[0]!.ref });
  expect(f.click).toHaveBeenCalledOnce();
});
it.each(['request', 'framenavigated', 'close', 'crash', 'disconnected', 'return'])(
  'revokes on %s and never inherits another document',
  async (event) => {
    const f = fixture();
    await f.document.execute('grant', {});
    const ref = (await f.observe()).elements[0]!.ref;
    if (event === 'request')
      f.page.emit(event, { isNavigationRequest: () => true, frame: () => f.frame });
    else if (event === 'framenavigated') f.page.emit(event, f.frame);
    else if (event === 'disconnected') f.browser.emit(event);
    else if (event === 'return') f.document.dispose();
    else f.page.emit(event);
    await expect(f.document.execute('click', { ref })).rejects.toThrow('returned or disconnected');
    await expect(f.document.execute('grant', {})).rejects.toThrow('returned or disconnected');
    expect(f.click).not.toHaveBeenCalled();
    expect(f.revoke).toHaveBeenCalledOnce();
  },
);
it('an in-document fetch or child-frame navigation does not extend or revoke the selected document', async () => {
  const f = fixture();
  await f.document.execute('grant', {});
  f.page.emit('request', { isNavigationRequest: () => false, frame: () => f.frame });
  f.page.emit('request', { isNavigationRequest: () => true, frame: () => ({}) });
  f.page.emit('framenavigated', {});
  const ref = (await f.observe()).elements[0]!.ref;
  await f.document.execute('click', { ref });
  expect(f.click).toHaveBeenCalledOnce();
  expect(f.revoke).not.toHaveBeenCalled();
});
it('Bot-induced navigation revokes its action result and the subsequent grant', async () => {
  const f = fixture();
  await f.document.execute('grant', {});
  const ref = (await f.observe()).elements[0]!.ref;
  f.click.mockImplementation(async () => {
    f.page.emit('framenavigated', f.frame);
  });
  await expect(f.document.execute('click', { ref })).rejects.toThrow('returned or disconnected');
  expect(f.revoke).toHaveBeenCalledOnce();
});
it('Pause waits for an issued click to settle before acknowledging and fences its result', async () => {
  const f = fixture();
  await f.document.execute('grant', {});
  const ref = (await f.observe()).elements[0]!.ref;
  let release: (() => void) | undefined;
  f.click.mockImplementation(async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  });
  const pending = f.document.execute('click', { ref });
  await vi.waitFor(() => expect(f.click).toHaveBeenCalledOnce());
  const rejected = expect(pending).rejects.toThrow('result was revoked');
  let acknowledged = false;
  const pause = f.document.execute('pause', { active: true }).then(() => {
    acknowledged = true;
  });
  await Promise.resolve();
  expect(acknowledged).toBe(false);
  release!();
  await pause;
  await rejected;
  expect(acknowledged).toBe(true);
  await f.document.execute('pause', { active: false });
});
