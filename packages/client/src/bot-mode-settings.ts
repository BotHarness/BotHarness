export const BOT_MODE_NAMESPACE = 'botharness-client';

export const BOT_MODE_SORT_FIELD = 'sortMode';

export const BOT_MODE_SORT_MODES_FIELD = 'sortModes';

export const PINNED_SORT_SCOPE_ID = 'pinned';

export const BOT_MODE_MOTION_FIELD = 'motionPreference';

export const BOT_MODE_ICON_FIELD = 'botIcon';

export const BOT_MODE_DEVELOPER_FIELD = 'developerMode';

export const BOT_MODE_SORT_MODES = ['updated', 'manual'] as const;

export const BOT_MODE_MOTION_PREFERENCES = ['system', 'reduce', 'full'] as const;

export const BOT_MODE_ICONS = ['mascot', 'simple', 'blob', 'bot'] as const;

export type BotModeSortMode = (typeof BOT_MODE_SORT_MODES)[number];

export type BotModeMotionPreference = (typeof BOT_MODE_MOTION_PREFERENCES)[number];

export type BotModeIcon = (typeof BOT_MODE_ICONS)[number];

export const DEFAULT_BOT_MODE_SORT: BotModeSortMode = 'updated';

export const DEFAULT_BOT_MODE_MOTION: BotModeMotionPreference = 'system';

export const DEFAULT_BOT_MODE_ICON: BotModeIcon = 'mascot';

export const DEFAULT_BOT_MODE_DEVELOPER = false;

export function isBotModeSortMode(value: unknown): value is BotModeSortMode {
  return value === 'updated' || value === 'manual';
}

export function isBotModeMotionPreference(value: unknown): value is BotModeMotionPreference {
  return value === 'system' || value === 'reduce' || value === 'full';
}

export function isBotModeIcon(value: unknown): value is BotModeIcon {
  return value === 'mascot' || value === 'simple' || value === 'blob' || value === 'bot';
}

export interface BotModeSettings {
  developerMode: boolean;
  motionPreference: BotModeMotionPreference;
  botIcon: BotModeIcon;
  sortMode: BotModeSortMode;
  sortModes: Record<string, BotModeSortMode>;
}
