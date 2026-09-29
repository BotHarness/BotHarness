import type { FramePhase } from './viewer-state.js';

export const VIEWER_EVENT_ENDPOINT = '/api/computer/diagnostics/viewer';

export type ViewerLifecycleEvent =
  | { readonly type: 'mount' }
  | { readonly type: 'overlay'; readonly open: boolean }
  | { readonly type: 'phase'; readonly from: FramePhase; readonly to: FramePhase }
  | { readonly type: 'auto-reload'; readonly attempt: number }
  | { readonly type: 'manual-retry' }
  | { readonly type: 'loss-remount'; readonly streak: number };

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
  } catch {}
}
