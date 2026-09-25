import type { Context, Volatile } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

import {
  BOT_MODE_ICONS,
  BOT_MODE_MOTION_PREFERENCES,
  BOT_MODE_SORT_MODES,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SORT,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSortMode,
  type BotModeSettings,
} from './bot-mode-settings.js';

export const name = 'botharness-client';

export interface Config {
  developerMode: Volatile<boolean>;
  botIcon: Volatile<BotModeIcon>;
  motionPreference: Volatile<BotModeMotionPreference>;
  sortMode: Volatile<BotModeSortMode>;
  sortModes: Volatile<Record<string, BotModeSortMode>>;
}

/** Profile-owned live preferences projected through the official Config form. */
export const Config: Schema<Partial<BotModeSettings>, Config> = Schema.object({
  developerMode: Schema.boolean().default(DEFAULT_BOT_MODE_DEVELOPER).volatile(),
  botIcon: Schema.union([...BOT_MODE_ICONS]).default(DEFAULT_BOT_MODE_ICON).volatile(),
  motionPreference: Schema.union([...BOT_MODE_MOTION_PREFERENCES])
    .default(DEFAULT_BOT_MODE_MOTION)
    .volatile(),
  sortMode: Schema.union([...BOT_MODE_SORT_MODES]).default(DEFAULT_BOT_MODE_SORT).volatile(),
  sortModes: Schema.dict(Schema.union([...BOT_MODE_SORT_MODES])).default({}).volatile(),
});

/**
 * Host half of the Client Bundle. The settings page is contributed by the
 * browser plugin, so suppress the native auto-generated Config form.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}