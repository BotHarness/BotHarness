import type { BotHarnessTranslate } from './locale.js';

export function bridgeSourceLabel(
  origin: { platform: string; conversationName: string },
  t: BotHarnessTranslate,
): string {
  const platform = origin.platform === 'feishu' ? t('im.platform.feishu') : origin.platform;
  return `${platform} ${origin.conversationName}`;
}
