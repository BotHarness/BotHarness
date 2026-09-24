import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-settings';
import Schema from '@deepseek-ai/schemastery';

import {
  BOT_MODE_ICON_FIELD,
  BOT_MODE_DEVELOPER_FIELD,
  BOT_MODE_ICONS,
  BOT_MODE_MOTION_FIELD,
  BOT_MODE_MOTION_PREFERENCES,
  BOT_MODE_NAMESPACE,
  BOT_MODE_SORT_FIELD,
  BOT_MODE_SORT_MODES,
  BOT_MODE_SORT_MODES_FIELD,
  DEFAULT_BOT_MODE_ICON,
  DEFAULT_BOT_MODE_DEVELOPER,
  DEFAULT_BOT_MODE_MOTION,
  DEFAULT_BOT_MODE_SORT,
  type BotModeSettings,
} from './bot-mode-settings.js';

export const name = 'botharness-client';

/** Durable BOT-mode schema; also the wire envelope the browser scope validates against. */
export const BotModeSettingsSchema: Schema<
  Partial<BotModeSettings>,
  BotModeSettings
> = Schema.object({
  [BOT_MODE_ICON_FIELD]: Schema.union([...BOT_MODE_ICONS]).default(DEFAULT_BOT_MODE_ICON),
  [BOT_MODE_DEVELOPER_FIELD]: Schema.boolean().default(DEFAULT_BOT_MODE_DEVELOPER),
  [BOT_MODE_MOTION_FIELD]: Schema.union([...BOT_MODE_MOTION_PREFERENCES]).default(
    DEFAULT_BOT_MODE_MOTION,
  ),
  [BOT_MODE_SORT_FIELD]: Schema.union([...BOT_MODE_SORT_MODES]).default(DEFAULT_BOT_MODE_SORT),
  [BOT_MODE_SORT_MODES_FIELD]: Schema.dict(Schema.union([...BOT_MODE_SORT_MODES])).default({}),
});

/**
 * Host half of `@botharness/client`.
 *
 * Registers the `ui-bot-mode` settings namespace when the Host exposes the
 * settings capability; `ctx.inject` keeps the namespace optional, so a profile
 * without a settings provider still loads the rest of the plugin. The browser
 * half is discovered from `dsh.client` and served as `lib/client.js`.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(BOT_MODE_NAMESPACE, BotModeSettingsSchema);
  });
}
