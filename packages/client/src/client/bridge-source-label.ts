import type { BotHarnessTranslate } from './locale.js';

export function externalPlatformLabel(platform: string, t: BotHarnessTranslate): string {
  if (platform === 'feishu') return t('im.platform.feishu');
  if (platform === 'slack') return 'Slack';
  return platform;
}

export function bridgeSourceLabel(
  origin: { platform: string; conversationName: string },
  t: BotHarnessTranslate,
): string {
  const platform = externalPlatformLabel(origin.platform, t);
  return `${platform} ${origin.conversationName}`;
}
