// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';

import { SNAPSHOT_SCRIPT } from '../src/runtime/browser.js';

function rect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    top: 10,
    left: 20,
    right: 20 + width,
    bottom: 10 + height,
    x: 20,
    y: 10,
    toJSON: () => ({}),
  } as DOMRect;
}

interface Snapshot {
  readonly elements: readonly { ref: string; role: string; name: string }[];
}

function runSnapshot(): Snapshot {
  return (new Function(`return ${SNAPSHOT_SCRIPT}`) as () => Snapshot)();
}

describe('browser observe snapshot', () => {
  it('lists semantic elements and innermost role-less click targets', () => {
    document.body.innerHTML = '';
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return rect(this.id === 'small' ? 20 : 120, this.id === 'small' ? 20 : 40);
    });

    const link = document.createElement('a');
    link.href = 'https://example.com';
    link.textContent = 'Example';
    document.body.append(link);

    const wrapper = document.createElement('div');
    wrapper.style.cursor = 'pointer';
    const icon = document.createElement('span');
    icon.id = 'small';
    icon.style.cursor = 'pointer';
    icon.textContent = 'icon';
    wrapper.append(icon);
    document.body.append(wrapper);

    const outside = document.createElement('span');
    outside.style.cursor = 'default';
    outside.textContent = 'plain';
    document.body.append(outside);

    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    const toolbarItem = document.createElement('div');
    toolbarItem.style.cursor = 'pointer';
    editor.append(toolbarItem);
    document.body.append(editor);

    const snapshot = runSnapshot();
    const roles = snapshot.elements.map((element) => `${element.role}:${element.name}`);
    expect(roles).toContain('a:Example');
    expect(roles).toContain('clickable:icon');
    expect(roles).not.toContain('clickable:');
    expect(snapshot.elements.filter((element) => element.role === 'clickable')).toHaveLength(2);
    expect(roles).toContain('clickable:div @80,30');
    expect(outside.hasAttribute('data-botharness-ref')).toBe(false);
    expect(toolbarItem.hasAttribute('data-botharness-ref')).toBe(true);

    vi.restoreAllMocks();
  });

  it('keeps role-less controls in successive observations', () => {
    document.body.innerHTML = '<div style="cursor:pointer">Upload image</div>';
    const geometry = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect(120, 40));
    try {
      const first = runSnapshot();
      const second = runSnapshot();
      expect(first.elements.map((element) => element.name)).toEqual(['Upload image']);
      expect(second.elements.map((element) => element.name)).toEqual(['Upload image']);
    } finally {
      geometry.mockRestore();
    }
  });

  it('never reassigns an old ref to an inserted control on re-observation', () => {
    document.body.innerHTML = '<button id="intended">Intended action</button>';
    const geometry = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect(120, 40));
    try {
      const oldRef = runSnapshot().elements[0]!.ref;
      const inserted = document.createElement('button');
      inserted.textContent = 'Different action';
      document.body.prepend(inserted);
      const latest = runSnapshot();
      expect(latest.elements.map((element) => element.name)).toEqual([
        'Different action',
        'Intended action',
      ]);
      expect(document.querySelector(`[data-botharness-ref="${oldRef}"]`)).toBeNull();
      expect(latest.elements[1]!.ref).not.toBe(oldRef);
    } finally {
      geometry.mockRestore();
    }
  });

  it('removes refs from controls that are no longer observable', () => {
    document.body.innerHTML = '<button>Hidden action</button>';
    const geometry = vi
      .spyOn(Element.prototype, 'getBoundingClientRect')
      .mockReturnValue(rect(120, 40));
    try {
      const oldRef = runSnapshot().elements[0]!.ref;
      geometry.mockReturnValue(rect(0, 0));
      expect(runSnapshot().elements).toHaveLength(0);
      expect(document.querySelector(`[data-botharness-ref="${oldRef}"]`)).toBeNull();
    } finally {
      geometry.mockRestore();
    }
  });
});
