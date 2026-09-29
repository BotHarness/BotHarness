import type { FramePhase } from './viewer-state.js';

export const EMPTY_AFTER_MISSES = 6;

export const BUSY_EMPTY_AFTER = 30;

export const QUIET_TOLERANCE = 4;

export const QUIET_ABANDON = 120;

export const LOSS_REMOUNT_AFTER = 3;

export const MAX_AUTO_RELOAD = 3;

const STATUS_ELEMENT_ID = 'status-display';

const BUSY_TEXT = /connecting|reconnect|disconnect|failed|error/i;

export interface StreamSample {
  readonly sized: boolean;
  readonly busy: boolean;
  readonly signature?: number;
}

export interface StreamTracker {
  readonly misses: number;
  readonly busyStreak: number;
  readonly quiet: number;
  readonly lastSignature?: number;
}

export function hashBytes(data: Uint8ClampedArray): number {
  let hash = 0x81_9c_9d_c5;
  for (let index = 0; index < data.length; index += 1) {
    hash ^= data[index] ?? 0;
    hash = Math.imul(hash, 0x01_00_01_93);
  }
  return hash >>> 0;
}

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

export function sampleSurface(doc: Document | null | undefined): StreamSample {
  const busy = upstreamBusy(doc);
  let sized = false;
  let signature: number | undefined;
  try {
    const surface = doc?.getElementById('videoCanvas') as
      | HTMLVideoElement
      | HTMLCanvasElement
      | null;
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
  base: { readonly misses: number; readonly busyStreak: number; readonly quiet: number },
  signature: number | undefined,
): StreamTracker {
  return signature === undefined ? { ...base } : { ...base, lastSignature: signature };
}

function withPreviousSignature(
  base: { readonly misses: number; readonly busyStreak: number; readonly quiet: number },
  prev: StreamTracker,
): StreamTracker {
  return prev.lastSignature === undefined
    ? { ...base }
    : { ...base, lastSignature: prev.lastSignature };
}

export function shouldRemountLoss(lossStreak: number): boolean {
  return lossStreak >= LOSS_REMOUNT_AFTER;
}

export function shouldAutoReload(phase: FramePhase, everLive: boolean, attempts: number): boolean {
  return phase === 'empty' && !everLive && attempts < MAX_AUTO_RELOAD;
}

export function nextStreamTracker(
  prev: StreamTracker,
  sample: StreamSample,
): { readonly tracker: StreamTracker; readonly phase: FramePhase } {
  const signature = sample.signature;
  if (!sample.sized) {
    const misses = prev.misses + 1;
    return {
      tracker: withSignature({ misses, busyStreak: 0, quiet: 0 }, signature),
      phase: misses >= EMPTY_AFTER_MISSES ? 'empty' : 'connecting',
    };
  }
  if (sample.busy) {
    const busyStreak = prev.busyStreak + 1;
    return {
      tracker: withPreviousSignature({ misses: prev.misses, busyStreak, quiet: 0 }, prev),
      phase: busyStreak >= BUSY_EMPTY_AFTER ? 'empty' : 'connecting',
    };
  }
  const changed =
    signature !== undefined && prev.lastSignature !== undefined && signature !== prev.lastSignature;
  if (changed) {
    return {
      tracker: withSignature({ misses: 0, busyStreak: 0, quiet: 0 }, signature),
      phase: 'live',
    };
  }
  if (signature === undefined) {
    return { tracker: { misses: 0, busyStreak: 0, quiet: 0 }, phase: 'live' };
  }
  const quiet = prev.quiet + 1;
  if (quiet >= QUIET_ABANDON) {
    return {
      tracker: withSignature({ misses: EMPTY_AFTER_MISSES, busyStreak: 0, quiet }, signature),
      phase: 'empty',
    };
  }
  if (quiet >= QUIET_TOLERANCE) {
    return {
      tracker: withSignature({ misses: 0, busyStreak: 0, quiet }, signature),
      phase: 'live',
    };
  }
  return {
    tracker: withSignature({ misses: prev.misses, busyStreak: 0, quiet }, signature),
    phase: 'connecting',
  };
}
