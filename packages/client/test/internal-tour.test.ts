// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  resolveTourSteps,
  startInternalTour,
  type InternalTourOptions,
} from '../src/client/internal-tour.js';

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

function options(overrides: Partial<InternalTourOptions> = {}): InternalTourOptions {
  return {
    closeLabel: 'Close',
    skipLabel: 'Skip tutorial',
    previousLabel: 'Previous',
    nextLabel: 'Next',
    doneLabel: 'Done',
    onClosed: vi.fn(),
    onFinished: vi.fn(),
    onSkip: vi.fn(),
    ...overrides,
  };
}

it('keeps only anchors that exist in the document', () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const topbar = document.createElement('section');
  topbar.setAttribute('data-bh-tour', 'topbar');
  document.body.append(roster, topbar);
  const steps = resolveTourSteps(document, [
    { selector: '[data-onboarding-welcome]', title: 'Welcome', description: 'w' },
    { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
    { selector: '[data-bh-tour="topbar"]', title: 'Header', description: 'h' },
  ]);
  expect(steps.map((step) => step.title)).toEqual(['Roster', 'Header']);
  expect(steps[0]!.element.getAttribute('data-bh-tour')).toBe('roster');
});

it('drives a multi-step tour with progress, labels and a skip action', async () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const composer = document.createElement('button');
  composer.setAttribute('data-bh-tour', 'composer');
  document.body.append(roster, composer);
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'Conversations' },
      { selector: '[data-bh-tour="composer"]', title: 'Message box', description: 'Type here' },
      { selector: '[data-bh-tour="missing"]', title: 'Missing', description: 'Skipped' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Roster');
  expect(document.querySelector('.driver-popover-progress-text')?.textContent).toContain('/');
  expect(document.querySelector('.driver-popover-close-btn')?.getAttribute('aria-label')).toBe(
    'Close',
  );
  const skip = document.querySelector<HTMLButtonElement>('.bh-internal-tour-skip');
  expect(skip?.textContent).toBe('Skip tutorial');
  skip?.click();
  expect(tourOptions.onSkip).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('waits for the first anchor before driving the tour', async () => {
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-onboarding-welcome]', title: 'Welcome', description: 'w' },
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover')).toBeNull();
  const welcome = document.createElement('div');
  welcome.setAttribute('data-onboarding-welcome', '');
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  document.body.append(welcome, roster);
  await vi.advanceTimersByTimeAsync(50);
  expect(document.querySelector('.driver-popover-title')?.textContent).toBe('Welcome');
});

it('pauses and restores the original control when Escape dismisses the tour', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  trigger.focus();
  const tourOptions = options();
  stop = startInternalTour([{ selector: 'button', title: 'A', description: 'a' }], tourOptions);
  await vi.advanceTimersByTimeAsync(50);
  const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.dispatchEvent(escape);
  await vi.advanceTimersByTimeAsync(50);
  expect(escape.defaultPrevented).toBe(true);
  expect(tourOptions.onClosed).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
  expect(document.activeElement).toBe(trigger);
  const afterDismiss = new KeyboardEvent('keydown', {
    key: 'Escape',
    bubbles: true,
    cancelable: true,
  });
  document.dispatchEvent(afterDismiss);
  expect(afterDismiss.defaultPrevented).toBe(false);
});

it('finishes through the Done action on the last step', async () => {
  const roster = document.createElement('div');
  roster.setAttribute('data-bh-tour', 'roster');
  const composer = document.createElement('div');
  composer.setAttribute('data-bh-tour', 'composer');
  document.body.append(roster, composer);
  const tourOptions = options();
  stop = startInternalTour(
    [
      { selector: '[data-bh-tour="roster"]', title: 'Roster', description: 'r' },
      { selector: '[data-bh-tour="composer"]', title: 'Message box', description: 'm' },
    ],
    tourOptions,
  );
  await vi.advanceTimersByTimeAsync(50);
  document.querySelector<HTMLButtonElement>('.driver-popover-next-btn')?.click();
  await vi.advanceTimersByTimeAsync(50);
  const done = document.querySelector<HTMLButtonElement>('.driver-popover-next-btn');
  expect(done?.textContent).toBe('Done');
  done?.click();
  await vi.advanceTimersByTimeAsync(50);
  expect(tourOptions.onFinished).toHaveBeenCalledOnce();
  expect(document.querySelector('.driver-popover')).toBeNull();
});

it('pauses when a real dialog appears instead of covering it', async () => {
  const trigger = document.createElement('button');
  document.body.append(trigger);
  const tourOptions = options();
  stop = startInternalTour([{ selector: 'button', title: 'A', description: 'a' }], tourOptions);
  await vi.advanceTimersByTimeAsync(50);
  const dialog = document.createElement('section');
  dialog.setAttribute('role', 'dialog');
  Object.defineProperty(dialog, 'getClientRects', { value: () => [new DOMRect(0, 0, 200, 80)] });
  document.body.append(dialog);
  await vi.advanceTimersByTimeAsync(50);
  expect(tourOptions.onClosed).toHaveBeenCalledOnce();
  expect(dialog.isConnected).toBe(true);
  expect(document.querySelector('.driver-popover')).toBeNull();
});
