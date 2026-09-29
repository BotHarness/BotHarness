import { findBotNavCell } from './bot-icon-nav.js';

const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]';

const SETTLE_TIMEOUT_MS = 2000;

function openSettingsSection(labels: () => readonly string[], doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document);
  if (target === undefined) return;

  const trigger = target.querySelector(TRIGGER_SELECTOR) as HTMLElement | null;
  if (trigger !== null && trigger.getAttribute('aria-expanded') !== 'true') {
    trigger.click();
  }

  const selectSection = (): boolean => {
    const cell = findBotNavCell(target, labels());
    if (cell === undefined) return false;
    cell.click();
    return true;
  };

  if (selectSection()) return;

  const observer =
    typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(selectSection);
  observer?.observe(target.body, { childList: true, subtree: true });
  setTimeout(() => {
    observer?.disconnect();
  }, SETTLE_TIMEOUT_MS);
}

export function openBotSettings(labels: () => readonly string[], doc?: Document): void {
  openSettingsSection(labels, doc);
}

export function openModelsSettings(doc?: Document): void {
  openSettingsSection(() => ['模型', 'Models'], doc);
}
