import { driver } from 'driver.js';

export function highlightInternalControl(
  element: Element,
  title: string,
  description: string,
  closeLabel: string,
  onClosed?: () => void,
  skip?: { label: string; onSkip(): void } | undefined,
): () => void {
  const doc = element.ownerDocument;
  const previous = doc.activeElement;
  const buttons = skip === undefined ? (['close'] as const) : (['next', 'close'] as const);
  const tour = driver({
    animate: !doc.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    smoothScroll: false,
    allowKeyboardControl: false,
    showButtons: [...buttons],
    popoverClass: 'bh-internal-tour',
    overlayColor: 'var(--dsw-alias-bg-mask-1)',
    overlayOpacity: 1,
    onPopoverRender: (popover) => {
      popover.wrapper.setAttribute('role', 'dialog');
      popover.wrapper.setAttribute('aria-label', title);
      popover.closeButton.setAttribute('aria-label', closeLabel);
      popover.closeButton.focus();
    },
    onCloseClick: () => {
      onClosed?.();
      tour.destroy();
    },
    onDestroyed: () => {
      observer.disconnect();
      doc.removeEventListener('keydown', escape, true);
      queueMicrotask(() => {
        const dialog = [...doc.querySelectorAll<HTMLElement>('[role="dialog"]')]
          .filter(
            (node) => !node.classList.contains('driver-popover') && node.getClientRects().length,
          )
          .at(-1);
        if (dialog)
          dialog
            .querySelector<HTMLElement>(
              'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
            )
            ?.focus();
        else if (previous instanceof HTMLElement && previous.isConnected && previous !== doc.body)
          previous.focus();
        else if (element instanceof HTMLElement && element.isConnected) {
          const focus = element.matches('button, input, select, textarea, summary, [tabindex]')
            ? element
            : element.querySelector<HTMLElement>(
                '[role="tab"][aria-selected="true"], button, input, select, summary',
              );
          focus?.focus();
        }
      });
    },
  });
  const escape = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopImmediatePropagation();
    onClosed?.();
    tour.destroy();
  };
  doc.addEventListener('keydown', escape, true);
  const highlight = (target: Element) =>
    tour.highlight({
      element: target,
      popover: {
        title,
        description,
        showButtons: [...buttons],
        ...(skip === undefined
          ? {}
          : {
              nextBtnText: skip.label,
              onNextClick: () => {
                skip.onSkip();
                tour.destroy();
              },
            }),
      },
    });
  const observer = new MutationObserver(() => {
    const dialogs = [...doc.querySelectorAll('[role="dialog"]')].filter(
      (d) => !d.classList.contains('driver-popover') && d.getClientRects().length > 0,
    );
    if (!element.isConnected && !dialogs.length) {
      tour.destroy();
      return;
    }
    const target = dialogs.at(-1) ?? element;
    if (tour.getActiveElement() !== target) highlight(target);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  highlight(element);
  return () => {
    observer.disconnect();
    tour.destroy();
  };
}
