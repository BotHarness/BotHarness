import { h, localizeText } from './i18n.js';

export const UPDATE_RPC_CHANNEL = '/dsh-im';

export function UpdatePanel() {
  return h(
    'span',
    {
      className: 'dim-statusTag',
      title: localizeText('此 IM 连接器随 BotHarness 更新，以保持兼容。'),
    },
    '随 BotHarness 更新',
  );
}
