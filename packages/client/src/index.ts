import type { Context, Volatile } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

import {
  BOT_MODE_ICONS,
  BOT_MODE_MOTION_PREFERENCES,
  BOT_MODE_SORT_MODES,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SORT,
  type BotModeIcon,
  type BotModeMotionPreference,
  type BotModeSortMode,
  type BotModeSettings,
} from './bot-mode-settings.js';

export const name = 'botharness-client';

export interface Config {
  autoAcceptGroupInvites: Volatile<boolean>;
  developerMode: Volatile<boolean>;
  botIcon: Volatile<BotModeIcon>;
  motionPreference: Volatile<BotModeMotionPreference>;
  sortMode: Volatile<BotModeSortMode>;
  sortModes: Volatile<Record<string, BotModeSortMode>>;
}

export const Config: Schema<Partial<BotModeSettings>, Config> = Schema.object({
  autoAcceptGroupInvites: Schema.boolean().default(DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT).volatile(),
  developerMode: Schema.boolean().default(DEFAULT_BOT_MODE_DEVELOPER).volatile(),
  botIcon: Schema.union([...BOT_MODE_ICONS])
    .default(DEFAULT_BOT_MODE_ICON)
    .volatile(),
  motionPreference: Schema.union([...BOT_MODE_MOTION_PREFERENCES])
    .default(DEFAULT_BOT_MODE_MOTION)
    .volatile(),
  sortMode: Schema.union([...BOT_MODE_SORT_MODES])
    .default(DEFAULT_BOT_MODE_SORT)
    .volatile(),
  sortModes: Schema.dict(Schema.union([...BOT_MODE_SORT_MODES]))
    .default({})
    .volatile(),
});

export function apply(ctx: Context, config?: Config): void {
  ctx.inject(['botharness'], (child) => {
    const core = (
      child as unknown as {
        botharness?: { configureGroupInvitations(autoAccept: () => boolean): () => void };
      }
    ).botharness;
    if (core !== undefined)
      child.effect(() =>
        core.configureGroupInvitations(
          () => config?.autoAcceptGroupInvites.get() ?? DEFAULT_BOT_MODE_GROUP_AUTO_ACCEPT,
        ),
      );
  });
  ctx.inject(['settings'], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
