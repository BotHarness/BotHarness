import type { ConfigStorage } from './roster-config.js';

/** Browser-local choice, available before Host settings finish loading. */
export const START_IN_BOT_MODE_KEY = 'botharness/start-in-bot-mode.v1';
const STARTUP_CONSUMED_KEY = '__botharnessStartupModeConsumed';

export function readStartInBotMode(storage: ConfigStorage | undefined): boolean {
  try {
    return storage?.getItem(START_IN_BOT_MODE_KEY) === 'true';
  } catch {
    return false;
  }
}

/** Apply the startup choice once per browser document, including across Client HMR. */
export function consumeStartInBotMode(
  target: Record<string, unknown>,
  storage: ConfigStorage | undefined,
): boolean {
  if (target[STARTUP_CONSUMED_KEY] === true) return false;
  target[STARTUP_CONSUMED_KEY] = true;
  return readStartInBotMode(storage);
}

export function writeStartInBotMode(storage: ConfigStorage | undefined, enabled: boolean): boolean {
  if (storage === undefined) return false;
  try {
    storage.setItem(START_IN_BOT_MODE_KEY, String(enabled));
    return true;
  } catch {
    return false;
  }
}
