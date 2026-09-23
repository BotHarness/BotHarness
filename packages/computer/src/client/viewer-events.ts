/**
 * Viewer lifecycle reporting into developer diagnostics: the Running card
 * narrates its own transitions (mount, phases, reloads, retries) so a later
 * debugging session can replay what the card did without a browser. Only
 * transitions are reported, never per-tick polls; details carry static
 * labels and counts, never tokens, URLs, or paths.
 * @module @botharness/computer/client/viewer-events
 */

import type { FramePhase } from './viewer-state.js';

/** Endpoint owning the bounded diagnostics ring (300 chars per detail). */
export const VIEWER_EVENT_ENDPOINT = '/api/computer/diagnostics/viewer';

/** Card lifecycle transitions worth one diagnostics line each. */
export type ViewerLifecycleEvent =
  | { readonly type: 'mount' }
  | { readonly type: 'overlay'; readonly open: boolean }
  | { readonly type: 'phase'; readonly from: FramePhase; readonly to: FramePhase }
  | { readonly type: 'auto-reload'; readonly attempt: number }
  | { readonly type: 'manual-retry' }
  | { readonly type: 'loss-remount'; readonly streak: number };

/** Stable machine-parseable line for one event. */
export function viewerEventText(event: ViewerLifecycleEvent): string {
  switch (event.type) {
    case 'mount':
      return 'viewer mount docked';
    case 'overlay':
      return event.open ? 'viewer overlay open' : 'viewer overlay closed';
    case 'phase':
      return `viewer phase ${event.from}>${event.to}`;
    case 'auto-reload':
      return `viewer auto-reload attempt=${String(event.attempt)}`;
    case 'manual-retry':
      return 'viewer manual-retry';
    case 'loss-remount':
      return `viewer loss-remount streak=${String(event.streak)}`;
  }
}

/**
 * Fire-and-forget post to the diagnostics route. Never throws — observability
 * must not break the viewer — and defaults to the global fetch so call sites
 * stay one argument.
 */
export async function reportViewerEvent(
  fetchImpl: typeof fetch | undefined,
  detail: string,
): Promise<void> {
  try {
    await (fetchImpl ?? fetch)(VIEWER_EVENT_ENDPOINT, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ detail }),
    });
  } catch {
    // Diagnostics are best effort by design.
  }
}
