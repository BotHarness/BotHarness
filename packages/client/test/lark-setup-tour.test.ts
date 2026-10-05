// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { highlightLarkSetup } from '../src/client/lark-setup-tour.js';

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true })),
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await vi.advanceTimersByTimeAsync(100);
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it('retargets the real binding dialog and exits without closing it or focusing outside it', async () => {
  const bind = document.createElement('button');
  bind.textContent = 'Bind identity';
  document.body.append(bind);
  bind.focus();
  stop = highlightLarkSetup(bind, 'Bind identity', 'Choose your account', 'Close');
  await vi.advanceTimersByTimeAsync(50);

  const dialog = document.createElement('section');
  dialog.setAttribute('role', 'dialog');
  Object.defineProperty(dialog, 'getClientRects', { value: () => [new DOMRect(0, 0, 200, 80)] });
  const nativeClose = document.createElement('button');
  nativeClose.textContent = 'Native close';
  dialog.append(nativeClose);
  document.body.append(dialog);
  await vi.advanceTimersByTimeAsync(50);
  expect(dialog.classList.contains('driver-active-element')).toBe(true);
  expect(document.querySelector('.driver-popover-close-btn')?.getAttribute('aria-label')).toBe(
    'Close',
  );
  expect(document.body.classList.contains('driver-fade')).toBe(false);

  const nativeEscape = vi.fn();
  document.addEventListener('keydown', nativeEscape);
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(nativeEscape).not.toHaveBeenCalled();
  expect(dialog.isConnected).toBe(true);
  expect(document.querySelector('.driver-popover')).toBeNull();
  expect(document.activeElement).toBe(nativeClose);
  document.removeEventListener('keydown', nativeEscape);
});

it('restores the original control and removes keyboard interception after dismissal', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  stop = highlightLarkSetup(trigger, 'Connect account', 'Open settings', 'Close');
  await vi.advanceTimersByTimeAsync(50);
  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.activeElement).toBe(trigger);
  const afterDismiss = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(afterDismiss);
  expect(afterDismiss.defaultPrevented).toBe(false);
});
