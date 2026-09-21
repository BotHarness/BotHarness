/**
 * The Settings navigation is shell-owned: DSH picks a nav glyph from a
 * hardcoded map keyed by section id and falls back to the settings gear, and
 * the `settings.section` contract carries no icon option. This module tags the
 * Bot section's nav cell — found by its localized label, never by position —
 * hides the shell's glyph, and inserts the Human-chosen Bot mark in the same
 * slot. When DSH cannot be matched the gear simply stays; nothing breaks.
 */

/** Class marking the nav cell whose glyph we replace. */
export const BOT_NAV_MARKER = 'bh-bot-nav';

/** Class of the icon box inserted into the marked cell. */
export const BOT_NAV_ICON_CLASS = 'bh-bot-nav-icon';

/** Whether one nav cell's label text is the Bot section's current label. */
export function isBotNavLabel(text: string | null | undefined, labels: readonly string[]): boolean {
  const value = text?.trim();
  return value !== undefined && value !== '' && labels.includes(value);
}

/**
 * A nav cell candidate: a button whose visible children are exactly a glyph
 * and a label, matching what the Settings shell renders.
 */
function navLabelNode(button: Element): Element | undefined {
  if (button.childElementCount !== 2) return undefined;
  const spans = button.querySelectorAll(':scope > span');
  return spans.length === 1 ? (spans[0] ?? undefined) : undefined;
}

/**
 * Find the Bot section's nav cell in the Settings navigation: the shell-owned
 * button whose visible children are a glyph and our localized label.
 */
export function findBotNavCell(doc: Document, labels: readonly string[]): HTMLElement | undefined {
  for (const button of doc.querySelectorAll('button')) {
    const label = navLabelNode(button);
    if (label === undefined || !isBotNavLabel(label.textContent, labels)) continue;
    return button as HTMLElement;
  }
  return undefined;
}

export interface BotNavIconOptions {
  /** Localized labels the section may render right now (locale may change). */
  readonly labels: () => readonly string[];
  /** Current icon markup; re-read on every apply. */
  readonly markup: () => string;
  /** Extra sources that should trigger a re-apply (preferences, palette). */
  readonly subscribe?: ((listener: () => void) => () => void) | undefined;
  /** Document to patch; injectable for tests. */
  readonly root?: Document | undefined;
}

/**
 * Keep the Bot section's Settings nav cell wearing the chosen mark.
 * @param options - Labels, markup source, and change subscriptions.
 * @returns disposer removing the observer and every inserted node.
 */
export function installBotNavIcon(options: BotNavIconOptions): () => void {
  const doc = options.root ?? (typeof document === 'undefined' ? undefined : document);
  if (doc === undefined) return () => {};
  const touched = new Set<HTMLElement>();
  let scheduled = false;

  const apply = (): void => {
    const labels = options.labels();
    const markup = options.markup();
    const cell = findBotNavCell(doc, labels);
    if (cell !== undefined) {
      const label = navLabelNode(cell);
      cell.classList.add(BOT_NAV_MARKER);
      touched.add(cell);
      // Hide the shell glyph with an inline style, not a class: the shell
      // re-renders the button's className on locale or active-state changes,
      // but React never touches inline styles it did not set.
      for (const child of cell.children) {
        if (child === label || child.classList.contains(BOT_NAV_ICON_CLASS)) continue;
        (child as HTMLElement).style.display = 'none';
      }
      let box = cell.querySelector(`:scope > .${BOT_NAV_ICON_CLASS}`) as HTMLElement | null;
      if (box === null) {
        box = doc.createElement('span') as HTMLElement;
        box.className = BOT_NAV_ICON_CLASS;
        box.setAttribute('aria-hidden', 'true');
        cell.insertBefore(box, cell.firstChild);
      }
      // Size in place too, so the mark never depends on our stylesheet
      // reaching a shell-owned surface.
      box.style.cssText =
        'display:inline-flex;flex:none;align-items:center;justify-content:center;width:16px;height:16px;';
      if (box.innerHTML !== markup) {
        box.innerHTML = markup;
        const media = box.firstElementChild as HTMLElement | null;
        if (media !== null) {
          media.style.cssText = 'display:block;width:100%;height:100%;object-fit:contain;';
        }
      }
    }
  };

  const schedule = (): void => {
    if (scheduled) return;
    scheduled = true;
    const run = (): void => {
      scheduled = false;
      apply();
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else setTimeout(run, 0);
  };

  apply();

  const observer =
    typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(schedule);
  observer?.observe(doc.body, { childList: true, subtree: true });
  const unsubscribe = options.subscribe?.(schedule);

  return () => {
    observer?.disconnect();
    unsubscribe?.();
    for (const cell of touched) {
      cell.querySelector(`:scope > .${BOT_NAV_ICON_CLASS}`)?.remove();
      cell.classList.remove(BOT_NAV_MARKER);
    }
    touched.clear();
  };
}
