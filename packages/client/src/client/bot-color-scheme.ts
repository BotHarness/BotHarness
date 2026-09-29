import { useSyncExternalStore } from 'react';

export type BotColorScheme = 'light' | 'dark';

const DARK_ATTRIBUTE = 'data-ds-dark-theme';

export function readBotColorScheme(): BotColorScheme {
  if (typeof document === 'undefined') return 'light';
  return document.body.hasAttribute(DARK_ATTRIBUTE) ? 'dark' : 'light';
}

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

export function useBotColorScheme(): BotColorScheme {
  return useSyncExternalStore(subscribeBotColorScheme, readBotColorScheme, () => 'light');
}
