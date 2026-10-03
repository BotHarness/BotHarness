import type { ViewerKey } from './locale.js';

export type ViewerAction = 'open' | 'collapse';

export function nextExpanded(action: ViewerAction): boolean {
  return action === 'open';
}

export type FramePhase = 'connecting' | 'live' | 'empty';

export const PHASE_SMOOTH_AFTER = 2;

export interface SmoothedPhase {
  readonly phase: FramePhase;
  readonly streak: number;
}

export function smoothPhase(shown: FramePhase, raw: FramePhase, streak: number): SmoothedPhase {
  if (raw === 'live') return { phase: 'live', streak: 0 };
  if (shown !== 'live') return { phase: raw, streak: 0 };
  const next = streak + 1;
  if (next >= PHASE_SMOOTH_AFTER) return { phase: raw, streak: next };
  return { phase: shown, streak: next };
}

export function dotStateFor(phase: FramePhase): 'done' | 'ongoing' | 'error' {
  if (phase === 'live') return 'done';
  if (phase === 'empty') return 'error';
  return 'ongoing';
}

export function statusKeyFor(phase: FramePhase, reconnecting: boolean): ViewerKey {
  if (phase === 'live') return 'entry.live';
  if (phase === 'empty') return 'entry.noScreen';
  return reconnecting ? 'entry.reconnecting' : 'entry.connecting';
}

export function stopKey(busy: boolean, stopping: boolean): ViewerKey {
  return busy || stopping ? 'entry.stopping' : 'entry.stop';
}

const EXIT_REPORT = /^exited code=\d+$/;

export function isExitReport(detail: string | undefined): boolean {
  return detail !== undefined && EXIT_REPORT.test(detail);
}
