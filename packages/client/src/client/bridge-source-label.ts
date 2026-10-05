import type { BotHarnessTranslate } from './locale.js';

export function externalPlatformLabel(platform: string, t: BotHarnessTranslate): string {
  if (platform === 'feishu') return t('im.platform.feishu');
  if (platform === 'slack') return 'Slack';
  if (platform === 'discord') return 'Discord';
  if (platform === 'weixin') return t('im.platform.weixin');
  return platform;
}

export function bridgeSourceLabel(
  origin: { platform: string; conversationName: string },
  t: BotHarnessTranslate,
): string {
  const platform = externalPlatformLabel(origin.platform, t);
  return `${platform} ${origin.conversationName}`;
}

export function externalSenderLabel(
  origin: { platform: string; senderId: string; senderName?: string },
  t: BotHarnessTranslate,
): string {
  return origin.senderName ?? (origin.platform === 'weixin' ? t('im.weixinUser') : origin.senderId);
}
