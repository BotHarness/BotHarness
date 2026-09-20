/**
 * Vendored `hash` glyph from lucide-react@1.46.0 (ISC, ADR-0032).
 *
 * Source: lucide `hash` (`dist/esm/icons/hash.mjs`): four stroked bars on a
 * 24-unit grid — two horizontals (y 9 / 15, x 4 → 20) and two slanted
 * verticals (x 10 → 8, x 16 → 14, y 3 → 21). Vendored at the stock 2-unit
 * stroke (round caps/joins), which lands at ≈1.33px in the 16px channel slot
 * and matches the measured DSH native hash weight (≈1.3px) without
 * hand-drawing. No `lucide-react` runtime dependency is added.
 *
 * ISC License
 *
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT).
 * All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 *
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 *
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
 * REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
 * INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
 * LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
 * OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
 * PERFORMANCE OF THIS SOFTWARE.
 */

import type { ReactElement } from 'react';

/** Primitives `IconProps` contract: square edge plus layout class, color rides `currentColor`. */
export interface HashIconProps {
  size?: number | undefined;
  className?: string | undefined;
}

/** Group-channel `#` slot glyph: a 16px Lucide hash, vertically centered by the slot's flex. */
export function HashIcon({ size = 16, className }: HashIconProps): ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="4" x2="20" y1="9" y2="9" />
      <line x1="4" x2="20" y1="15" y2="15" />
      <line x1="10" x2="8" y1="3" y2="21" />
      <line x1="16" x2="14" y1="3" y2="21" />
    </svg>
  );
}
