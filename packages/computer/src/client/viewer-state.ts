/**
 * Pure state machine for the Running card's viewer: open/collapse targets,
 * title-bar status/dot/label projections, and small copy predicates. Stream
 * liveness itself (sized + pixels + Selkies status line) lives in
 * `frame-liveness.ts`; this module stays free of DOM so its contract is
 * unit-testable without a browser.
 * @module @botharness/computer/client/viewer-state
 */

import type { ComputerKey } from './locale.js';

/** User/keyboard actions that move the fullscreen viewer. */
export type ViewerAction = 'open' | 'collapse';

/**
 * The overlay target for an action: open targets the fullscreen overlay,
 * collapse targets the resting entry. Fullscreen exits through the toolbar
 * collapse button only — there is intentionally no Escape shortcut.
 */
export function nextExpanded(action: ViewerAction): boolean {
  return action === 'open';
}

/** Stream health as projected by the frame tracker. */
export type FramePhase = 'connecting' | 'live' | 'empty';

/** StateDot semantics for a phase (done / blue ring / red). */
export function dotStateFor(phase: FramePhase): 'done' | 'ongoing' | 'error' {
  if (phase === 'live') return 'done';
  if (phase === 'empty') return 'error';
  return 'ongoing';
}

/** Locale key for the title-bar/overlay status text. */
export function statusKeyFor(phase: FramePhase, reconnecting: boolean): ComputerKey {
  if (phase === 'live') return 'entry.live';
  if (phase === 'empty') return 'entry.noScreen';
  return reconnecting ? 'entry.reconnecting' : 'entry.connecting';
}

/** Locale key for the stop control (shared by the title bar and the card row). */
export function stopKey(busy: boolean, stopping: boolean): ComputerKey {
  return busy || stopping ? 'entry.stopping' : 'entry.stop';
}

/**
 * Bare container exit reports ("exited code=137") are machine noise from a
 * normal stop — the start view shows the friendly shared note instead, while
 * real server details and client errors still surface.
 */
const EXIT_REPORT = /^exited code=\d+$/;

export function isExitReport(detail: string | undefined): boolean {
  return detail !== undefined && EXIT_REPORT.test(detail);
}
