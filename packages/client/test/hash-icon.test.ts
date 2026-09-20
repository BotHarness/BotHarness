import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { HashIcon } from '../src/client/hash-icon.js';

describe('hash icon', () => {
  it('vendors the Lucide hash bars on a 24-unit stroked grid', () => {
    const markup = renderToStaticMarkup(createElement(HashIcon, { size: 16 }));

    expect(markup).toContain('viewBox="0 0 24 24"');
    expect(markup).toContain('fill="none"');
    expect(markup).toContain('stroke="currentColor"');
    expect(markup).toContain('stroke-width="2"');
    expect(markup).toContain('stroke-linecap="round"');
    expect(markup).toContain('stroke-linejoin="round"');
    expect(markup.match(/<line /g)).toHaveLength(4);
  });

  it('defaults to the 16px channel slot box and follows the primitives contract', () => {
    const fallback = renderToStaticMarkup(createElement(HashIcon, {}));
    expect(fallback).toContain('width="16"');
    expect(fallback).toContain('height="16"');

    const sized = renderToStaticMarkup(
      createElement(HashIcon, { size: 20, className: 'bh-section-chevron' }),
    );
    expect(sized).toContain('width="20"');
    expect(sized).toContain('height="20"');
    expect(sized).toContain('class="bh-section-chevron"');
  });
});
