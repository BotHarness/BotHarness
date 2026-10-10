import { expect } from 'vitest';

export function companionPosition(surface: HTMLElement): { left: string; bottom: string } {
  const match = /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\)$/.exec(surface.style.transform);
  expect(match).not.toBeNull();
  return { left: `${Number(match![1])}px`, bottom: `${-Number(match![2])}px` };
}
