export const LOCALE_NS = 'botharness-browser';

export const zh = {
  'entry.label': '浏览器',
  'entry.access.title': 'Browser Access',
  'entry.access.enable': '启用 Browser Access',
  'entry.access.disable': '停用 Browser Access',
  'entry.access.failed': '切换 Browser Access 失败',
  'entry.access.failureHint': '授权失败',
  'entry.profile.label': 'Profile',
  'entry.profile.default': 'default',
  'entry.profile.failed': '切换浏览器 profile 失败',
  'entry.profile.choose': '选择浏览器 Profile',
  'entry.profile.create': '创建“{name}”',
  'entry.view.follow': '跟随 Bot',
  'entry.view.pause': '暂停 Bot',
  'entry.view.resume': '继续',
  'entry.view.open': '打开 Bot 浏览器',
  'entry.view.stop': '停止',
  'entry.view.opening': '正在打开…',
  'entry.view.noFrame': '暂无画面',
  'entry.view.noTabs': '暂无标签页',
  'entry.error': '浏览器操作失败',
};

export type BrowserKey = keyof typeof zh;

export const en: Record<BrowserKey, string> = {
  'entry.label': 'Browser',
  'entry.access.title': 'Browser Access',
  'entry.access.enable': 'Enable Browser Access',
  'entry.access.disable': 'Disable Browser Access',
  'entry.access.failed': 'Failed to switch Browser Access',
  'entry.access.failureHint': 'Access failed',
  'entry.profile.label': 'Profile',
  'entry.profile.default': 'default',
  'entry.profile.failed': 'Failed to switch the browser profile',
  'entry.profile.choose': 'Choose browser profile',
  'entry.profile.create': 'Create “{name}”',
  'entry.view.follow': 'Follow the Bot',
  'entry.view.pause': 'Pause Bot',
  'entry.view.resume': 'Resume',
  'entry.view.open': 'Open Bot Browser',
  'entry.view.stop': 'Stop',
  'entry.view.opening': 'Opening…',
  'entry.view.noFrame': 'No frame yet',
  'entry.view.noTabs': 'No tabs yet',
  'entry.error': 'Browser action failed',
};

export type BrowserTranslate = (
  key: BrowserKey,
  params?: Record<string, string | number>,
) => string;
