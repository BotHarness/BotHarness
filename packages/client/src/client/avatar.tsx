import { useMemo, type ReactElement } from 'react';

import { blobatar } from 'blobatar';

const FALLBACK_HUES = [225, 262, 12, 152, 47, 200];

function fallbackMarkup(seed: string): string {
  const hue = FALLBACK_HUES[seed.length % FALLBACK_HUES.length] ?? 225;
  const initial = seed.slice(0, 1).toUpperCase();
  return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="46" fill="hsl(${hue} 70% 62%)"/><text x="50" y="62" text-anchor="middle" font-size="42" fill="#fff">${initial}</text></svg>`;
}

export function Blobatar({ seed, size }: { seed: string; size: number }): ReactElement {
  const markup = useMemo(() => {
    try {
      return blobatar(`botharness:${seed}`);
    } catch {
      return fallbackMarkup(seed);
    }
  }, [seed]);

  return (
    <span
      className="bh-blob"
      style={{ width: size, height: size }}
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}
