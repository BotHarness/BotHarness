import { useSyncExternalStore } from 'react';

/**
 * The color scheme BotHarness artwork resolves against. DSH's theme presenter
 * switches `body[data-ds-dark-theme]` for the active palette (ui-theme's
 * documented contract), so observing that attribute is a faithful signal that
 * needs no service dependency.
 */
export type BotColorScheme = 'light' | 'dark';

const DARK_ATTRIBUTE = 'data-ds-dark-theme';

/** Read the palette the document is currently rendering. */
export function readBotColorScheme(): BotColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light';
}

/** Subscribe to palette switches; returns the unsubscribe function. */
export function subscribeBotColorScheme(listener: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {};
  }
  const observer = new MutationObserver(listener);
  observer.observe(document.body, { attributes: true, attributeFilter: [DARK_ATTRIBUTE] });
  return () => {
    observer.disconnect();
  };
}

/** React binding for artwork that ships light and dark variants. */
export function useBotColorScheme(): BotColorScheme {
  return useSyncExternalStore(subscribeBotColorScheme, readBotColorScheme, () => 'light');
}
