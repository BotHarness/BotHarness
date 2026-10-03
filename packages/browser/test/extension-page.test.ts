// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('reads rendered document text with bounded output while omitting field values and hidden text', () => {
  document.title = 'Account QA';
  document.body.innerHTML =
    '<p>Signed in as QA Reader</p><input type="password" value="PASSWORD-LOCAL"><textarea>TEXTAREA-LOCAL</textarea><p style="visibility:hidden">HIDDEN-LOCAL</p><button aria-label="Continue">Continue</button>';
  vi.spyOn(Element.prototype, 'getClientRects').mockImplementation(
    () => [{ width: 1 }] as unknown as DOMRectList,
  );
  const range = document.createRange();
  vi.spyOn(document, 'createRange').mockImplementation(() =>
    Object.assign(range, { getClientRects: () => [{ width: 1 }] }),
  );
  const source = readFileSync(resolve('packages/browser/extension/page.mjs'), 'utf8').replace(
    'export function',
    'function',
  );
  const observe = () =>
    runInNewContext(source + '\nreadPage()', {
      document,
      location,
      NodeFilter,
      CSS: { escape: (value: string) => value },
      getComputedStyle,
    });
  const page = observe();
  expect(page.text).toContain('Signed in as QA Reader');
  expect(JSON.stringify(page)).not.toMatch(/PASSWORD-LOCAL|TEXTAREA-LOCAL|HIDDEN-LOCAL/u);
  expect(page.elements).toContainEqual(expect.objectContaining({ name: 'Continue' }));
  document.body.append(document.createTextNode('x'.repeat(40_000)));
  expect(observe().text.length).toBeLessThanOrEqual(10_000);
});
