// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { openImSettings } from '../src/client/bot-settings-open.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
});

it('waits for native settings and selects the actual IM and Feishu controls', async () => {
  vi.useFakeTimers();
  const trigger = document.createElement('button');
  trigger.setAttribute('aria-haspopup', 'dialog');
  document.body.append(trigger);
  const selected = vi.fn();
  trigger.onclick = () => {
    queueMicrotask(() => {
      const dialog = document.createElement('div');
      dialog.setAttribute('role', 'dialog');
      const nav = document.createElement('button');
      nav.textContent = 'IM bots';
      nav.onclick = () => {
        const platform = document.createElement('button');
        platform.textContent = 'Feishu';
        platform.onclick = selected;
        dialog.append(platform);
      };
      dialog.append(nav);
      document.body.append(dialog);
    });
  };
  const ready = vi.fn();
  const unavailable = vi.fn();
  const cancel = openImSettings(document, ready, unavailable);
  await vi.advanceTimersByTimeAsync(1);
  expect(selected).toHaveBeenCalledTimes(1);
  expect(ready).toHaveBeenCalledWith(document.querySelector('[role="dialog"]'));
  await vi.advanceTimersByTimeAsync(10000);
  expect(unavailable).not.toHaveBeenCalled();
  cancel();
});

it('cancels a pending settings transition and reports an unavailable control once', async () => {
  vi.useFakeTimers();
  const ready = vi.fn();
  const unavailable = vi.fn();
  const cancel = openImSettings(document, ready, unavailable);
  cancel();
  await vi.advanceTimersByTimeAsync(10000);
  expect(ready).not.toHaveBeenCalled();
  expect(unavailable).not.toHaveBeenCalled();
  const stop = openImSettings(document, ready, unavailable);
  await vi.advanceTimersByTimeAsync(20000);
  expect(ready).not.toHaveBeenCalled();
  expect(unavailable).toHaveBeenCalledTimes(1);
  stop();
});
