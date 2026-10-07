const SETTLE_TIMEOUT_MS = 2000;

export function revealSidebarAnchor(
  doc: Document,
  entryId: string,
  anchor: string,
  ready: (element: Element) => void,
  unavailable: () => void,
): () => void {
  const selector = `[data-anchor="${anchor}"]`;
  const found = doc.querySelector(selector);
  if (found !== null) {
    ready(found);
    return () => {};
  }
  const entry = doc.querySelector(`[data-entry-id="${entryId}"]`);
  const head = entry?.querySelector<HTMLButtonElement>('button[aria-expanded="false"]');
  if (entry === null || entry === undefined || (entry as HTMLElement).hidden || !head) {
    unavailable();
    return () => {};
  }
  let done = false;
  const finish = (): void => {
    done = true;
    observer.disconnect();
    clearTimeout(timer);
  };
  const observer = new MutationObserver(() => {
    const element = doc.querySelector(selector);
    if (element === null || done) return;
    finish();
    ready(element);
  });
  observer.observe(doc.body, { childList: true, subtree: true });
  const timer = setTimeout(() => {
    if (done) return;
    finish();
    unavailable();
  }, SETTLE_TIMEOUT_MS);
  head.click();
  return finish;
}
