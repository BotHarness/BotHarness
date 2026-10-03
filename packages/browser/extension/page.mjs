export function readPage() {
  const elements = [...document.querySelectorAll('a,button,input,textarea,select,[role]')]
    .filter((element) => {
      const style = getComputedStyle(element);
      return (
        element.getClientRects().length > 0 &&
        style.visibility !== 'hidden' &&
        style.display !== 'none'
      );
    })
    .slice(0, 80)
    .map((element, index) => ({
      ref: `r${index + 1}`,
      role: (element.getAttribute('role') ?? element.tagName.toLowerCase()).slice(0, 80),
      name: (
        element.getAttribute('aria-label') ??
        (element.id
          ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent
          : undefined) ??
        (element.matches('input,textarea') ? '' : element.textContent) ??
        ''
      )
        .trim()
        .slice(0, 200),
    }));
  const text = [];
  let length = 0;
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let visited = 0;
    for (
      let node = walker.nextNode();
      node && visited < 4_000 && length < 10_000;
      node = walker.nextNode()
    ) {
      visited += 1;
      const parent = node.parentElement;
      if (
        !parent ||
        parent.closest('input,textarea,script,style,noscript') ||
        getComputedStyle(parent).visibility === 'hidden'
      )
        continue;
      range.selectNodeContents(node);
      if (range.getClientRects().length === 0) continue;
      const content = (node.textContent ?? '').trim().slice(0, 10_000 - length);
      if (content) {
        text.push(content);
        length += content.length + 1;
      }
    }
  }
  return {
    url: location.href.slice(0, 2048),
    title: document.title.slice(0, 500),
    text: text.join('\n').slice(0, 10_000),
    elements,
  };
}
