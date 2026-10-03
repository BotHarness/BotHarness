export function profilePage(method, slug, ref) {
  const key = '__botharnessProfileRefs';
  const state = (globalThis[key] ??= { bots: new Map(), acting: false });
  if (!state.listening) {
    state.listening = true;
    for (const name of ['input', 'pointerdown', 'keydown'])
      document.addEventListener(
        name,
        (event) => {
          if (event.isTrusted && !state.acting) state.bots.clear();
        },
        true,
      );
  }
  if (method === 'invalidate') {
    state.bots.delete(slug);
    return null;
  }
  if (method === 'finish') {
    state.acting = false;
    return null;
  }
  const visible = (element) => {
    const style = getComputedStyle(element);
    return (
      element.isConnected &&
      element.getClientRects().length > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none'
    );
  };
  if (method === 'observe') {
    const refs = new Map();
    const prefix = crypto.randomUUID();
    const elements = [
      ...document.querySelectorAll(
        'a,button,input,textarea,select,[contenteditable="true"],[role="button"]',
      ),
    ]
      .filter(visible)
      .slice(0, 80)
      .map((element, index) => {
        const id = `${prefix}:${index}`;
        refs.set(id, element);
        const label =
          element.getAttribute('aria-label') ??
          (element.id
            ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
            : undefined) ??
          element.textContent ??
          '';
        const value = element.matches('input:not([type="password"]),textarea') ? element.value : '';
        return {
          ref: id,
          role: element.getAttribute('role') ?? element.tagName.toLowerCase(),
          name: `${label.trim()}${value ? ` (value: ${value})` : ''}`.slice(0, 300),
        };
      });
    state.bots.set(slug, { url: location.href, refs });
    return {
      url: location.href.slice(0, 2048),
      title: document.title.slice(0, 500),
      text: (document.body?.innerText ?? '').slice(0, 10_000),
      elements,
    };
  }
  const current = state.bots.get(slug);
  const element = current?.url === location.href ? current.refs.get(ref) : undefined;
  if (
    !element ||
    !visible(element) ||
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true'
  )
    return { error: 'Stale or unavailable ref; observe again' };
  if (!['type', 'click', 'prepare-type', 'prepare-click'].includes(method))
    return { error: 'Unsupported page command' };
  element.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const hit = document.elementFromPoint(x, y);
  if (!hit || (hit !== element && !element.contains(hit))) return { error: 'Element is covered' };
  if (method === 'type' || method === 'prepare-type') {
    if (
      !element.matches(
        'input:not([type="file"]):not([type="checkbox"]):not([type="radio"]),textarea',
      ) ||
      element.readOnly
    )
      return { error: 'Not an editable text field' };
    if (method === 'prepare-type') return { x, y, url: location.href };
    element.focus();
    if (document.activeElement !== element) return { error: 'Input focus unavailable' };
    const setter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(element, '');
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }
  if (method === 'prepare-click') return { x, y, url: location.href };
  state.acting = true;
  return { x, y, url: location.href };
}
