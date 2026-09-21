import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  fileURLToPath(new URL('../src/client/styles.ts', import.meta.url)),
  'utf8',
);

const ALIAS_START = '/* @bh-brand-aliases:start';
const ALIAS_END = '/* @bh-brand-aliases:end */';
const LITERAL_COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/;

function aliasBounds(): { start: number; end: number } {
  const start = source.indexOf(ALIAS_START);
  const end = source.indexOf(ALIAS_END);
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('styles.ts must delimit its brand alias block');
  }
  return { start, end };
}

describe('client styles', () => {
  it('contains no literal colours outside the brand alias block', () => {
    const { start, end } = aliasBounds();
    const outside = `${source.slice(0, start)}${source.slice(end)}`;
    expect(outside).not.toMatch(LITERAL_COLOUR);
  });

  it('keeps the brand alias block to at most three token entries', () => {
    const { start, end } = aliasBounds();
    const block = source.slice(start, end);
    const entries = block.match(/--bh-[a-z-]+\s*:/g) ?? [];
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.length).toBeLessThanOrEqual(3);
  });

  it('wires the measured native row geometry and spacing', () => {
    expect(source).toMatch(/\.bh-section-head \{[^}]*height: 24px/);
    expect(source).toMatch(/\.bh-section-head \{[^}]*gap: 6px/);
    expect(source).toMatch(/\.bh-section-head \{[^}]*padding: 0 8px/);
    expect(source).toMatch(/\.bh-channel-row \{[^}]*height: 32px/);
    expect(source).toMatch(/\.bh-channel-row \{[^}]*padding: 0 8px/);
    expect(source).toMatch(/\.bh-list-area > \* \+ \* \{\s*margin-top: 2px/);
    expect(source).toMatch(/\.bh-section \+ \.bh-section \{\s*margin-top: 12px/);
    expect(source).toMatch(/\.bh-section-head:hover \.bh-row-actions,[^}]*display: inline-flex/);
  });

  it('keeps the glyph-free section header muted with a 12px block break', () => {
    expect(source).not.toContain('bh-arrow');
    expect(source).not.toContain('bh-row-slot');
    expect(source).toMatch(/\.bh-section-name \{[^}]*color: var\(--dsw-alias-label-tertiary\)/);
    expect(source).toMatch(/\.bh-section \+ \.bh-section \{\s*margin-top: 12px/);
  });

  it('brightens the Discord header on hover instead of filling it', () => {
    expect(source).not.toMatch(/\.bh-section-head:hover[^}]*background/);
    expect(source).toMatch(/\.bh-section-head:hover \.bh-section-name/);
    expect(source).toMatch(
      /\.bh-section-chevron \{\s*[^}]*color: var\(--dsw-alias-label-tertiary\)/,
    );
    expect(source).toMatch(
      /\.bh-section-chevron\.bh-chevron-collapsed \{\s*transform: rotate\(-90deg\)/,
    );
    expect(source).toMatch(
      /\.bh-section-chevron \{\s*[^}]*transition: transform 150ms var\(--ds-ease-in-out\)/,
    );
  });

  it('carries the native channel drag insert-line recipe', () => {
    expect(source).toMatch(/\.bh-channel-row\.bh-drop-before::before/);
    expect(source).toMatch(/\.bh-channel-row\.bh-drop-after::after/);
    expect(source).toMatch(/\.bh-drop-before::before \{\s*top: -7px/);
    expect(source).toMatch(/\.bh-drop-after::after \{\s*bottom: -7px/);
  });

  it('carries the native section-block drag insert-line recipe', () => {
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before/);
    expect(source).toMatch(/\.bh-section\.bh-drop-after::after/);
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before \{\s*top: -8px/);
    expect(source).toMatch(/\.bh-section\.bh-drop-after::after \{\s*bottom: -8px/);
  });

  it('marks row-less section drops with an overlay line and fades the source in place', () => {
    expect(source).not.toContain('bh-empty-drop');
    expect(source).toMatch(/\.bh-section\.bh-drop-scope > \.bh-list-area::before/);
    expect(source).toMatch(
      /\.bh-section\.bh-drop-scope > \.bh-list-area::before \{[^}]*position: absolute/,
    );
    expect(source).toMatch(/\.bh-section\.bh-drop-before::before,[^{]*\{[^}]*position: absolute/);
    expect(source).toMatch(/\.bh-channel-row\.bh-drag-source \{\s*opacity: 0\.4/);
    expect(source).toMatch(/\.bh-contact\.bh-drag-source \{\s*opacity: 0\.4/);
  });

  it('anchors the channel move menu at the cursor proxy', () => {
    expect(source).toMatch(/\.bh-menu-anchor \{\s*position: fixed/);
    expect(source).toMatch(/\.bh-move-checked \{\s*display: flex/);
  });

  it('copies the native rename input box model without portaled overrides', () => {
    expect(source).toMatch(/\.bh-name-input \{[^}]*box-sizing: border-box/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*height: 44px/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*padding: 7px 14px/);
    expect(source).toMatch(/\.bh-name-input \{[^}]*border-radius: 22px/);
    expect(source).not.toContain('bh-modal-input');
  });

  it('uses the shared product motion boundary instead of component media queries', () => {
    expect(source).not.toContain('prefers-reduced-motion');
    expect(source).toContain("html[data-botharness-motion='reduce'] .bh-persona-avatar::before");
    expect(source).toContain("html[data-botharness-motion='full'] .bh-motion-preview-sample i");
  });

  it('keeps the composer island token-driven and clear of the message scroll area', () => {
    expect(source).toMatch(/\.bh-composer \{[^}]*border-radius: 999px/);
    expect(source).toMatch(/\.bh-composer-expanded \{[^}]*padding-bottom: 48px/);
    expect(source).toMatch(/\.bh-composer-expanded \{[^}]*border-radius: 20px/);
    expect(source).toMatch(
      /\.bh-composer \{[^}]*background: var\(--dsw-alias-bg-module-platform\)/,
    );
    expect(source).toMatch(/\.bh-composer-shell \{[^}]*safe-area-inset-bottom/);
    expect(source).toMatch(/\.bh-composer-activity-facepile \.bh-persona-avatar[^}]*border: 0/);
    expect(source).toMatch(
      /\.bh-composer-activity-facepile \.bh-persona-avatar::before \{[^}]*display: none/,
    );
    expect(source).toMatch(/\.bh-composer-input \{[^}]*max-height: 144px/);
    expect(source).toMatch(/\.bh-composer-input \{[^}]*padding: 7px 8px 5px/);
    expect(source).not.toMatch(/\.bh-composer-input \{[^}]*transition:/);
    expect(source).toMatch(/\.bh-composer-footer \{[^}]*bottom: 50%/);
    expect(source).toMatch(/\.bh-composer-expanded \.bh-composer-footer \{[^}]*bottom: 8px/);
    expect(source).toContain("html[data-botharness-motion='reduce'] .bh-composer-footer");
  });
});
