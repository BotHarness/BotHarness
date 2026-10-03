import { EventEmitter } from 'node:events';
import type { ChildProcess } from 'node:child_process';
import { expect, it, vi } from 'vitest';
import { createDailyControl } from '../src/daily.js';

function setup() {
  const worker = new EventEmitter();
  const send = vi.fn((message, callback) => callback(null));
  const kill = vi.fn();
  const onChange = vi.fn();
  let enabled = true;
  let access = true;
  const control = createDailyControl({
    enabled: () => enabled,
    bot: (slug) => (slug === 'bot-a' ? { displayName: 'QA', browserAccess: access } : undefined),
    path: '',
    onChange,
    note: () => undefined,
    spawn: () => Object.assign(worker, { send, kill }) as unknown as ChildProcess,
  });
  const reply = (value: unknown = {}) =>
    worker.emit('message', { id: send.mock.calls.at(-1)![0].id, value });
  return {
    control,
    worker,
    send,
    kill,
    onChange,
    reply,
    setEnabled: (value: boolean) => {
      enabled = value;
    },
    setAccess: (value: boolean) => {
      access = value;
    },
  };
}
it('never converts connection or read-only sharing into an action grant', async () => {
  const h = setup();
  h.control.connect('bot-a');
  expect(h.control.view('bot-a')?.state).toBe('connecting');
  await expect(h.control.grant('bot-a')).rejects.toThrow('Select one page');
  h.reply({ url: 'https://example.com', title: 'Account' });
  await Promise.resolve();
  expect(h.control.view('bot-a')?.state).toBe('confirm');
  const granted = h.control.grant('bot-a');
  h.reply();
  await granted;
  expect(h.control.view('bot-a')?.state).toBe('controlled');
  expect(h.onChange).toHaveBeenCalledTimes(2);
  h.control.returnBot('bot-a');
  expect(h.kill).toHaveBeenCalledTimes(1);
});
it('rejects another Bot and Access-off, prevents parallel connections, cancels pending calls on navigation', async () => {
  const h = setup();
  expect(() => h.control.connect('bot-b')).toThrow('Browser Access');
  h.setAccess(false);
  expect(() => h.control.connect('bot-a')).toThrow('Browser Access');
  h.setAccess(true);
  h.control.connect('bot-a');
  expect(() => h.control.connect('bot-a')).toThrow('Return');
  h.reply({ url: 'https://example.com', title: 'Account' });
  await Promise.resolve();
  const pending = h.control.observe('bot-a', new AbortController().signal);
  h.worker.emit('message', { event: 'revoked', reason: 'navigation' });
  await expect(pending).rejects.toThrow('revoked');
  expect(h.control.view('bot-a')).toBeUndefined();
  expect(h.kill).toHaveBeenCalledOnce();
  h.reply({ text: 'late content' });
  expect(h.control.view('bot-a')).toBeUndefined();
});
it('Host target changes or cancellation stop the pending connector', async () => {
  const h = setup();
  h.control.connect('bot-a');
  h.control.clear();
  expect(h.kill).toHaveBeenCalledOnce();
  h.reply({ url: 'https://example.com', title: 'late' });
  await Promise.resolve();
  expect(h.control.view('bot-a')).toBeUndefined();
});
it('surfaces connection failures and requires a new Human connection', async () => {
  const h = setup();
  h.control.connect('bot-a');
  h.worker.emit('message', {
    id: h.send.mock.calls.at(-1)![0].id,
    error: 'Playwright Extension not found',
  });
  await vi.waitFor(() => expect(h.control.view('bot-a')?.state).toBe('error'));
  expect(h.control.view('bot-a')?.error).toContain('Extension not found');
  expect(h.kill).toHaveBeenCalledOnce();
});
