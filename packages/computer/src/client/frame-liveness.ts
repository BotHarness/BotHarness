/**
 * Stream liveness beyond canvas size: Selkies sizes `#videoCanvas` at layout
 * time — before the first frame — so size alone reports "live" while Selkies'
 * own status line still says Connecting, and a dead-but-sized stream never
 * trips the miss counter at all. Liveness here is sized + pixels changing +
 * Selkies `#status-display` quiet, with a grace window for truly static
 * desktops (which legitimately stop changing pixels).
 *
 * The sampler only touches the iframe through an injected `Document`, so every
 * projection below is unit-testable with stub documents.
 * @module @botharness/computer/client/frame-liveness
 */

import type { FramePhase } from './viewer-state.js';

/**
 * Ticks without any live signal before the overlay admits there is no
 * picture: the tracker's first check lands at ~300ms and later checks every
 * ~1s, so six misses ≈ five seconds of silence.
 */
export const EMPTY_AFTER_MISSES = 6;

/** Quiet sized ticks before an idle desktop is optimistically live. */
export const QUIET_TOLERANCE = 4;

/**
 * Quiet ticks before a quiet stream is declared empty (retry recovers).
 * Exceeds the panel-clock minute so a real desktop's clock repaint resets
 * the count first; only a truly frozen, textless stream gets here.
 */
export const QUIET_ABANDON = 120;

/** Selkies' dedicated connection status line (a stable id, not minified). */
const STATUS_ELEMENT_ID = 'status-display';

/**
 * Substrings of a busy upstream: the connecting screen, the disconnect
 * retry, and failure states. Scoped to `#status-display` only, so sidebar
 * copy (e.g. a Reconnect button) can never trip it. Note "Connected" matches
 * none of these — `connecting` is deliberately not truncated to `connect`.
 */
const BUSY_TEXT = /connecting|reconnect|disconnect|failed|error/i;

/** One poll tick's observations of the viewer document. */
export interface StreamSample {
  readonly sized: boolean;
  readonly busy: boolean;
  readonly signature?: number;
}

/** Rolling tracker state between ticks. */
export interface StreamTracker {
  readonly misses: number;
  readonly quiet: number;
  readonly lastSignature?: number;
}

/** FNV-1a over raw bytes; the pixel-change detector below. */
export function hashBytes(data: Uint8ClampedArray): number {
  let hash = 0x81_9c_9d_c5;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index] ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
}

/**
 * Whether Selkies itself reports busy. False when the status element is
 * absent (unknown page), hidden, or showing a non-busy state — never throws,
 * so a cross-origin or exotic document degrades to "quiet".
 */
export function upstreamBusy(doc: Document | null | undefined): boolean {
  try {
    const element = doc?.getElementById(STATUS_ELEMENT_ID) as HTMLElement | null;
    if (element === null || element === undefined) return false;
    if (element.classList.contains('hidden')) return false;
    return BUSY_TEXT.test(element.textContent ?? '');
  } catch {
    return false;
  }
}

function signatureOf(
  doc: Document,
  surface: HTMLVideoElement | HTMLCanvasElement,
): number | undefined {
  try {
    const scratch = doc.createElement('canvas');
    scratch.width = 16;
    scratch.height = 16;
    const context = scratch.getContext('2d', { willReadFrequently: true });
    if (context === null) return undefined;
    context.drawImage(surface, 0, 0, 16, 16);
    return hashBytes(context.getImageData(0, 0, 16, 16).data);
  } catch {
    return undefined;
  }
}

/**
 * Observes one frame of the viewer document: canvas size (the pre-#221
 * signal), Selkies' own busy line, and a 16x16 pixel signature for change
 * detection. Never throws; unreadable pixels degrade to `signature`
 * undefined (the caller falls back to the sized-only signal).
 */
export function sampleSurface(doc: Document | null | undefined): StreamSample {
  const busy = upstreamBusy(doc);
  let sized = false;
  let signature: number | undefined;
  try {
    const surface = doc?.getElementById('videoCanvas') as
      | HTMLVideoElement
      | HTMLCanvasElement
      | null;
    // Duck-typed (no instanceof): a video reports videoWidth, a canvas its
    // width, anything else sizes zero. This also stays callable in node.
    const videoWidth = (surface as { readonly videoWidth?: unknown } | null)?.videoWidth;
    const canvasWidth = (surface as { readonly width?: unknown } | null)?.width;
    const width =
      typeof videoWidth === 'number'
        ? videoWidth
        : typeof canvasWidth === 'number'
          ? canvasWidth
          : 0;
    sized = surface !== null && surface !== undefined && width > 0;
    if (sized && surface !== null && surface !== undefined && doc !== null && doc !== undefined) {
      signature = signatureOf(doc, surface);
    }
  } catch {
    signature = undefined;
  }
  return signature === undefined ? { sized, busy } : { sized, busy, signature };
}
function withSignature(
  base: { readonly misses: number; readonly quiet: number },
  signature: number | undefined,
): StreamTracker {
  return signature === undefined ? { ...base } : { ...base, lastSignature: signature };
}

function withPreviousSignature(
  base: { readonly misses: number; readonly quiet: number },
  prev: StreamTracker,
): StreamTracker {
  return prev.lastSignature === undefined
    ? { ...base }
    : { ...base, lastSignature: prev.lastSignature };
}

/**
 * Projects one tick into the overlay phase:
 * - unsized or upstream-busy ticks never go live (busy misses still age
 *   toward empty, so a stuck connecting screen gets a retry); the pixel
 *   baseline is preserved across them, so a change that arrived while vetoed
 *   still counts once the veto clears;
 * - a changed signature goes live immediately (second tick at the latest);
 * - unreadable pixels degrade to the old sized-only signal;
 * - a quiet, sized, static surface goes live after QUIET_TOLERANCE (a real
 *   desktop idling) and gives up to empty after QUIET_ABANDON.
 */
export function nextStreamTracker(
  prev: StreamTracker,
  sample: StreamSample,
): { readonly tracker: StreamTracker; readonly phase: FramePhase } {
  const signature = sample.signature;
  if (!sample.sized || sample.busy) {
    const misses = prev.misses + 1;
    return {
      tracker: withPreviousSignature({ misses, quiet: 0 }, prev),
      phase: misses >= EMPTY_AFTER_MISSES ? 'empty' : 'connecting',
    };
  }
  const changed =
    signature !== undefined && prev.lastSignature !== undefined && signature !== prev.lastSignature;
  if (changed) {
    return {
      tracker: withSignature({ misses: 0, quiet: 0 }, signature),
      phase: 'live',
    };
  }
  if (signature === undefined) {
    return { tracker: { misses: 0, quiet: 0 }, phase: 'live' };
  }
  const quiet = prev.quiet + 1;
  if (quiet >= QUIET_ABANDON) {
    return {
      tracker: withSignature({ misses: EMPTY_AFTER_MISSES, quiet }, signature),
      phase: 'empty',
    };
  }
  if (quiet >= QUIET_TOLERANCE) {
    return {
      tracker: withSignature({ misses: 0, quiet }, signature),
      phase: 'live',
    };
  }
  return {
    tracker: withSignature({ misses: prev.misses + 1, quiet }, signature),
    phase: 'connecting',
  };
}
