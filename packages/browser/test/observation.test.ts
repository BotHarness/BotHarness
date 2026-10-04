import { describe, expect, it } from 'vitest';
import { compactBrowserSnapshot, formatBrowserElement } from '../src/runtime/observation.js';

describe('Browser observation model text', () => {
  it('keeps action identity and quotes values with explicit false and truncated states', () => {
    expect(
      formatBrowserElement({
        ref: 'e_nonce_1',
        role: 'input',
        name: 'City',
        value: 'Tokyo\nJapan',
        checked: false,
        disabled: true,
        readOnly: true,
        expanded: false,
        selected: false,
        valueTruncated: true,
      }),
    ).toBe(
      'e_nonce_1 input City [value="Tokyo\\nJapan", value-truncated, checked=false, disabled, readonly, expanded=false, selected=false]',
    );
    expect(
      formatBrowserElement(
        { ref: 'e_nonce_1', role: 'checkbox', name: 'Ship', checked: 'mixed' },
        false,
      ),
    ).toBe('checkbox Ship [checked=mixed]');
  });
  it('retains article associations, static receipts and modal/control state while dropping scaffolds', () => {
    const text = compactBrowserSnapshot(`- main
  - generic
    - article
      - paragraph
        - StaticText "SKU AUR-LIMITED"
      - button "Configure" [ref=e1]
    - article
      - paragraph
        - StaticText "SKU OTHER"
      - button "Configure" [ref=e2]
- dialog "Review order"
  - heading "Review order" [level=2, ref=e3]
    - StaticText "Review order"
  - textbox "Street" [readonly, ref=e4]: 1 QA Lane
    - StaticText "1 QA Lane"
  - alert
    - StaticText "Street address required"
  - button "Confirm order" [disabled, ref=e5]
  - paragraph
    - StaticText "Order ORDER-001 confirmed"`);
    expect(text).toBe(`- main
  - article
    - StaticText "SKU AUR-LIMITED"
    - button "Configure"
  - article
    - StaticText "SKU OTHER"
    - button "Configure"
- dialog "Review order"
  - heading "Review order" [level=2]
  - textbox "Street" [readonly]: 1 QA Lane
  - alert
    - StaticText "Street address required"
  - button "Confirm order" [disabled]
  - StaticText "Order ORDER-001 confirmed"`);
  });
  it('preserves named structures, unknown lines, and literal ref-like text inside page content', () => {
    const text =
      '- generic "Meaningful group"\n  - StaticText "literal [ref=e1]"\n  - textbox "literal [ref=e2]" [ref=e3]: x\nunknown continuation';
    expect(compactBrowserSnapshot(text)).toBe(text.replace(' [ref=e3]', ''));
  });
  it('preserves sibling duplicate text and marks the existing output bound', () => {
    expect(compactBrowserSnapshot('- textbox "A" [ref=e1]: x\n- StaticText "x"')).toContain(
      'StaticText "x"',
    );
    expect(compactBrowserSnapshot('x'.repeat(12001))).toBe(
      'x'.repeat(12000) + '\n[AX text truncated]',
    );
  });
});
