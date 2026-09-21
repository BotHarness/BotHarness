/**
 * BOT-mode preference contract shared by the Host settings schema and the
 * browser settings scope. Kept free of schemastery so the client bundle pulls
 * only constants and types.
 */

/** Settings namespace owning BOT-mode view preferences. */
export const BOT_MODE_NAMESPACE = 'ui-bot-mode';

/** Field carrying the global list sort mode. */
export const BOT_MODE_SORT_FIELD = 'sortMode';

/** Field carrying per-section sort modes; a missing section id inherits the global default. */
export const BOT_MODE_SORT_MODES_FIELD = 'sortModes';

/** Field carrying the Human-owned BotHarness motion preference. */
export const BOT_MODE_MOTION_FIELD = 'motionPreference';

/** Field carrying the Human-owned Bot icon choice. */
export const BOT_MODE_ICON_FIELD = 'botIcon';

/** Sort modes accepted at settings boundaries. */
export const BOT_MODE_SORT_MODES = ['updated', 'manual'] as const;

/** Motion preferences accepted at settings boundaries. */
export const BOT_MODE_MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;

/** Bot icon choices accepted at settings boundaries. */
export const BOT_MODE_ICONS = ['mascot', 'blob', 'bot'] as const;

/** Global or per-section sort mode: newest-first (`updated`) or the user's frozen order (`manual`). */
export type BotModeSortMode = (typeof BOT_MODE_SORT_MODES)[number];

/** Product-level motion preference, analogous to a system/light/dark theme setting. */
export type BotModeMotionPreference = (typeof BOT_MODE_MOTION_PREFERENCES)[number];

/** Which mark identifies the Bot in the app sidebar and the Settings navigation. */
export type BotModeIcon = (typeof BOT_MODE_ICONS)[number];

/** Default while the settings document stores no override. */
export const DEFAULT_BOT_MODE_SORT: BotModeSortMode = 'updated';

/** Follow the operating-system preference until the Human explicitly overrides it. */
export const DEFAULT_BOT_MODE_MOTION: BotModeMotionPreference = 'system';

/** The shipped DeepSeekBot mascot until the Human picks another mark. */
export const DEFAULT_BOT_MODE_ICON: BotModeIcon = 'mascot';

/** Narrow one wire, storage, or registry value to a persistable sort mode. */
export function isBotModeSortMode(value: unknown): value is BotModeSortMode {
  return value === 'updated' || value === 'manual';
}

/** Narrow one wire, storage, or registry value to a persistable motion preference. */
export function isBotModeMotionPreference(value: unknown): value is BotModeMotionPreference {
  return value === 'system' || value === 'reduce' || value === 'full';
}

/** Narrow one wire, storage, or registry value to a persistable Bot icon. */
export function isBotModeIcon(value: unknown): value is BotModeIcon {
  return value === 'mascot' || value === 'blob' || value === 'bot';
}

/** Durable BOT-mode section shared by the Host schema and the browser scope. */
export interface BotModeSettings {
  /** Human-owned motion preference for every BotHarness Client surface. */
  motionPreference: BotModeMotionPreference;
  /** Human-owned Bot mark shared by the app sidebar and the Settings navigation. */
  botIcon: BotModeIcon;
  /** Global default the list follows. */
  sortMode: BotModeSortMode;
  /** Per-section overrides by section id; a missing key inherits `sortMode`. */
  sortModes: Record<string, BotModeSortMode>;
}
