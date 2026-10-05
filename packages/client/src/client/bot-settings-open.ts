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

export function openImSettings(
  doc: Document,
  ready: (element: Element) => void,
  unavailable: () => void = () => {},
): () => void {
  let disposed = false;
  let selected = false;
  const inspect = () => {
    if (disposed) return;
    const dialog = [...doc.querySelectorAll('[role="dialog"]')].find((d) =>
      [...d.querySelectorAll('button')].some((b) =>
        /^(IM机器人|IM Bots)$/i.test(b.textContent?.trim() ?? ''),
      ),
    );
    if (!dialog) return;
    const nav = [...dialog.querySelectorAll('button')].find((b) =>
      /^(IM机器人|IM Bots)$/i.test(b.textContent?.trim() ?? ''),
    );
    if (!selected) {
      selected = true;
      nav?.click();
      queueMicrotask(inspect);
      return;
    }
    const platform = [...dialog.querySelectorAll('button')].find((b) =>
      ['飞书', 'Feishu', 'Lark / Feishu'].includes(b.textContent?.trim() ?? ''),
    );
    if (!platform) return;
    disposed = true;
    observer.disconnect();
    clearTimeout(timer);
    platform.click();
    ready(dialog);
  };
  const observer = new MutationObserver(inspect);
  observer.observe(doc.body, { childList: true, subtree: true });
  const timer = setTimeout(() => {
    disposed = true;
    observer.disconnect();
    unavailable();
  }, 10000);
  const trigger = doc.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  if (trigger?.getAttribute('aria-expanded') !== 'true') trigger?.click();
  inspect();
  return () => {
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
  };
}
