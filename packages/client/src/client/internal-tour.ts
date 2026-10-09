import { driver } from 'driver.js';

export interface InternalTourSpec {
  selector: string;
  title: string;
  description: string;
}

export interface InternalTourStep {
  element: Element;
  title: string;
  description: string;
}

export interface InternalTourOptions {
  closeLabel: string;
  skipLabel: string;
  previousLabel: string;
  nextLabel: string;
  doneLabel: string;
  onClosed(): void;
  onFinished(): void;
  onSkip(): void;
}

const FIRST_STEP_TIMEOUT_MS = 4000;

export function resolveTourSteps(
  doc: Document,
  specs: readonly InternalTourSpec[],
): InternalTourStep[] {
  const steps: InternalTourStep[] = [];
  for (const spec of specs) {
    const element = doc.querySelector(spec.selector);
    if (element !== null) steps.push({ element, title: spec.title, description: spec.description });
  }
  return steps;
}

export function startInternalTour(
  specs: readonly InternalTourSpec[],
  options: InternalTourOptions,
): () => void {
  const doc = typeof document === 'undefined' ? undefined : document;
  const first = specs[0];
  if (doc === undefined || first === undefined) return () => {};
  const previous = doc.activeElement;
  let tour: ReturnType<typeof driver> | undefined;
  let observer: MutationObserver | undefined;
  let dialogs: MutationObserver | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  const stopWaiting = (): void => {
    observer?.disconnect();
    observer = undefined;
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  const attempt = (allowPartial: boolean): void => {
    if (started) return;
    if (!allowPartial && doc.querySelector(first.selector) === null) return;
    const steps = resolveTourSteps(doc, specs);
    if (steps.length === 0) return;
    started = true;
    stopWaiting();
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      options.onClosed();
      tour?.destroy();
    };
    const reduced = doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    tour = driver({
      animate: !reduced,
      smoothScroll: false,
      allowKeyboardControl: false,
      overlayColor: 'var(--dsw-alias-bg-mask-1)',
      overlayOpacity: 1,
      popoverClass: 'bh-internal-tour',
      showButtons: ['next', 'previous', 'close'],
      showProgress: true,
      progressText: '{{current}} / {{total}}',
      nextBtnText: options.nextLabel,
      prevBtnText: options.previousLabel,
      doneBtnText: options.doneLabel,
      steps: steps.map((step, index) => ({
        element: step.element,
        popover: {
          title: step.title,
          description: step.description,
          ...(index === steps.length - 1
            ? {
                nextBtnText: options.doneLabel,
                onNextClick: () => {
                  options.onFinished();
                  tour?.destroy();
                },
              }
            : {}),
        },
      })),
      onPopoverRender: (popover) => {
        popover.wrapper.setAttribute('role', 'dialog');
        popover.wrapper.setAttribute('aria-label', tour?.getActiveStep()?.popover?.title ?? '');
        popover.closeButton.setAttribute('aria-label', options.closeLabel);
        if (popover.footerButtons.querySelector('.bh-internal-tour-skip') === null) {
          const skip = doc.createElement('button');
          skip.type = 'button';
          skip.className = 'bh-internal-tour-skip';
          skip.textContent = options.skipLabel;
          skip.addEventListener('click', () => {
            options.onSkip();
            tour?.destroy();
          });
          popover.footerButtons.prepend(skip);
        }
        popover.closeButton.focus();
      },
      onCloseClick: () => {
        options.onClosed();
        tour?.destroy();
      },
      onDestroyed: () => {
        doc.removeEventListener('keydown', escape, true);
        dialogs?.disconnect();
        dialogs = undefined;
        queueMicrotask(() => {
          if (previous instanceof HTMLElement && previous.isConnected && previous !== doc.body)
            previous.focus();
        });
      },
    });
    doc.addEventListener('keydown', escape, true);
    dialogs = new MutationObserver(() => {
      const dialog = [...doc.querySelectorAll('[role="dialog"]')].find(
        (node) => !node.classList.contains('driver-popover') && node.getClientRects().length > 0,
      );
      if (dialog === undefined) return;
      options.onClosed();
      tour?.destroy();
    });
    dialogs.observe(doc.body, { childList: true, subtree: true });
    tour.drive();
  };
  if (doc.querySelector(first.selector) !== null) {
    attempt(false);
  } else {
    observer = new MutationObserver(() => {
      attempt(false);
    });
    observer.observe(doc.body, { childList: true, subtree: true });
    timer = setTimeout(() => {
      attempt(true);
    }, FIRST_STEP_TIMEOUT_MS);
  }
  return () => {
    stopWaiting();
    tour?.destroy();
  };
}
