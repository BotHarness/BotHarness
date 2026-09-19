import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { NameInput } from '../src/client/name-input.js';

describe('name input', () => {
  it('renders the native rename field class with attributes passed through', () => {
    const markup = renderToStaticMarkup(
      createElement(NameInput, {
        autoFocus: true,
        placeholder: '分组名称',
        'aria-label': '分组名称',
        value: '工作流',
        readOnly: true,
      }),
    );

    expect(markup).toContain('class="bh-name-input"');
    expect(markup).toContain('autofocus');
    expect(markup).toContain('placeholder="分组名称"');
    expect(markup).toContain('aria-label="分组名称"');
    expect(markup).toContain('value="工作流"');
  });

  it('keeps a caller class alongside the native class', () => {
    const markup = renderToStaticMarkup(createElement(NameInput, { className: 'extra' }));

    expect(markup).toContain('class="bh-name-input extra"');
  });
});
