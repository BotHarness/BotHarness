/**
 * Opening the Settings dialog on the Bot section. DSH exposes no navigation
 * API — the shell owns modal state and only its onboarding step props receive
 * `openSection` — so this composes the two stable DOM contracts we already
 * rely on: the settings trigger announces itself with `aria-haspopup="dialog"`,
 * and the Bot section's nav cell is matched by its localized label. If either
 * is missing the call is a quiet no-op.
 */

import { findBotNavCell } from './bot-icon-nav.js';

const TRIGGER_SELECTOR = 'button[aria-haspopup="dialog"]';

/** How long to wait for the panel to mount before giving up. */
const SETTLE_TIMEOUT_MS = 2000;

/**
 * Open Settings and select the Bot section.
 * @param labels - Current localized section labels.
 * @param doc - Document to act on; injectable for tests.
 */
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

/** Open the BotHarness section through the shell-owned Settings dialog. */
export function openBotSettings(labels: () => readonly string[], doc?: Document): void {
  openSettingsSection(labels, doc);
}

/** Open DSH Models; labels mirror the pinned native Models navigation copy. */
export function openModelsSettings(doc?: Document): void {
  openSettingsSection(() => ['模型', 'Models'], doc);
}
