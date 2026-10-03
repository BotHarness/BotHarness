import { randomUUID } from 'node:crypto';
import type { Page, ElementHandle } from 'playwright-core';

export function createDailyDocument(
  page: Page,
  onRevoke: (reason: string) => void,
): { execute(command: string, args: Record<string, unknown>): Promise<unknown>; dispose(): void } {
  let granted = false;
  let paused = false;
  let revision = 0;
  let observed = -1;
  let revoked = false;
  const refs = new Map<string, ElementHandle<HTMLElement | SVGElement>>();
  function clearRefs(): void {
    for (const element of refs.values()) void element.dispose().catch(() => undefined);
    refs.clear();
    observed = -1;
  }
  function revoke(reason: string): void {
    if (revoked) return;
    revoked = true;
    granted = false;
    revision += 1;
    clearRefs();
    onRevoke(reason);
  }
  function current(): Page {
    if (revoked || page.isClosed() || !page.context().browser()?.isConnected())
      throw new Error(
        'The Daily Browser document was returned or disconnected; connect and authorize again',
      );
    return page;
  }
  function authorized(): Page {
    const selected = current();
    if (!granted) throw new Error('Allow control of this document in the Browser entry first');
    return selected;
  }
  page.on('request', (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      revoke('navigation or reload');
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) revoke('navigation or reload');
  });
  page.on('close', () => revoke('tab closed or removed from the connection'));
  page.on('crash', () => revoke('tab crashed'));
  page
    .context()
    .browser()
    ?.on('disconnected', () => revoke('extension disconnected'));
  async function execute(command: string, args: Record<string, unknown>): Promise<unknown> {
    if (command === 'grant') {
      current();
      granted = true;
      clearRefs();
      return {};
    }
    if (command === 'pause') {
      current();
      paused = args.active === true;
      revision += 1;
      clearRefs();
      return {};
    }
    const selected = authorized();
    const expected = revision;
    if (command === 'observe') {
      clearRefs();
      const elements: { ref: string; role: string; name: string }[] = [];
      const prefix = randomUUID();
      const handles = await selected.$$(
        'a,button,input:not([type="hidden"]),textarea,select,[role="button"],[role="textbox"],[contenteditable="true"]',
      );
      for (const element of handles) {
        const info = await element.evaluate((node) => {
          const bounds = node.getBoundingClientRect();
          if (!bounds.width || !bounds.height || getComputedStyle(node).visibility === 'hidden')
            return null;
          const input = node instanceof HTMLInputElement;
          const label =
            node instanceof HTMLInputElement ||
            node instanceof HTMLTextAreaElement ||
            node instanceof HTMLSelectElement
              ? [...(node.labels ?? [])].map((label) => label.innerText).join(' ')
              : '';
          return {
            role: node.getAttribute('role') ?? (input ? 'textbox' : node.tagName.toLowerCase()),
            name:
              (
                node.getAttribute('aria-label') ||
                label ||
                node.getAttribute('placeholder') ||
                node.textContent ||
                ''
              )
                .trim()
                .slice(0, 200) +
              (input && node.type !== 'password' ? ` Value: ${node.value.slice(0, 200)}` : ''),
          };
        });
        if (info === null || elements.length >= 250) {
          await element.dispose();
          continue;
        }
        const ref = `${prefix}:${elements.length + 1}`;
        refs.set(ref, element);
        elements.push({ ref, ...info });
      }
      const result = {
        url: selected.url(),
        title: await selected.title(),
        text: (await selected.locator('body').innerText()).slice(0, 6000),
        elements,
      };
      authorized();
      if (expected !== revision)
        throw new Error('Daily Browser control changed during observation; observe again');
      if (!paused) observed = revision;
      return result;
    }
    if (command !== 'type' && command !== 'click')
      throw new Error('Daily Browser control supports observe, type and click only');
    if (paused) throw new Error('Browser Pause is active');
    if (observed !== revision) throw new Error('Resume requires a fresh browser_observe');
    const ref = typeof args.ref === 'string' ? refs.get(args.ref) : undefined;
    if (ref === undefined) throw new Error('The element ref is stale; call browser_observe again');
    await selected.bringToFront();
    authorized();
    if (expected !== revision || paused)
      throw new Error('Daily Browser control changed before the action; observe again');
    if (command === 'type') {
      if (typeof args.text !== 'string') throw new Error('browser_type needs text');
      await ref.fill(args.text, { timeout: 3000 });
    } else await ref.click({ timeout: 3000 });
    authorized();
    if (expected !== revision || paused)
      throw new Error('Daily Browser control changed during the action; its result was revoked');
    return { url: selected.url(), title: await selected.title() };
  }
  return { execute, dispose: () => revoke('Host disconnected') };
}
