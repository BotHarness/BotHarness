// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { expect, it, vi } from 'vitest';
function page() {
  document.body.innerHTML =
    '<label for="note">Note</label><input id="note" value="Human"><button id="save">Save</button><input type="password" value="secret">';
  for (const element of document.querySelectorAll('input,button')) {
    Object.assign(element, {
      getClientRects: () => [1],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 30 }),
      scrollIntoView: vi.fn(),
    });
  }
  const source = readFileSync('packages/browser/profile-extension/page.mjs', 'utf8').replace(
    'export function',
    'function',
  );
  return runInNewContext(`${source}; profilePage`, {
    CSS: { escape: (value: string) => value },
    document,
    location,
    getComputedStyle,
    crypto: webcrypto,
    HTMLInputElement,
    HTMLTextAreaElement,
    Event,
    Map,
  }) as (
    method: string,
    slug: string,
    ref?: string,
  ) => { elements: { ref: string; name: string }[] };
}
it('refs retain original elements and cannot adopt a same-label replacement or another Bot', () => {
  const execute = page();
  const observed = execute('observe', 'a');
  const ref = observed.elements[0]!.ref;
  expect(observed.elements.some((item) => item.name.includes('secret'))).toBe(false);
  expect(() => execute('prepare-type', 'b', ref)).toThrow('Stale');
  document.querySelector('#note')!.outerHTML = '<input id="note" value="Replacement">';
  expect(() => execute('prepare-type', 'a', ref)).toThrow('Stale');
});
it('Pause invalidation requires a new observation without ending Profile pairing', () => {
  const execute = page();
  const ref = execute('observe', 'a').elements[0]!.ref;
  execute('invalidate', 'a');
  expect(() => execute('prepare-type', 'a', ref)).toThrow('Stale');
  expect(execute('observe', 'a').elements[0]!.ref).not.toBe(ref);
});
