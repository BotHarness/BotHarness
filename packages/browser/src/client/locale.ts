/** Locale namespace owning the Browser client's copy. */
export const LOCALE_NS = 'botharness-browser';

/** Simplified Chinese dictionary and the key-set source of truth. */
export const zh = {
  'entry.label': '浏览器',
  'entry.shared':
    'Bot Browser 由本 profile 的所有 PersonaBot 共享：各自拥有自己的窗口，共享登录态与 Cookie。',
  'entry.access.title': 'Browser Access',
  'entry.access.description': '开启后，该 Bot 的会话可以使用 Bot Browser 工具',
  'entry.access.failed': '切换 Browser Access 失败',
  'entry.status.stopped': '未运行',
  'entry.status.running': '运行中',
  'entry.status.url': '当前页面：{url}',
  'entry.binary': '浏览器：{path}',
  'entry.open': '打开 Bot 浏览器',
  'entry.opening': '正在打开…',
  'entry.stop': '停止',
  'entry.stopping': '正在停止…',
  'entry.hint': '首次使用请在打开的窗口里登录需要的网站；登录态会保留在这个浏览器 profile 中。',
  'entry.error': '浏览器操作失败',
};

export type BrowserKey = keyof typeof zh;

/** English dictionary; must cover the same keys. */
export const en: Record<BrowserKey, string> = {
  'entry.label': 'Browser',
  'entry.shared':
    'The Bot Browser is shared by every PersonaBot of this profile: each owns its own window, while cookies and sign-ins are shared.',
  'entry.access.title': 'Browser Access',
  'entry.access.description': "Lets this Bot's sessions use the Bot Browser tools",
  'entry.access.failed': 'Failed to switch Browser Access',
  'entry.status.stopped': 'Not running',
  'entry.status.running': 'Running',
  'entry.status.url': 'Current page: {url}',
  'entry.binary': 'Browser: {path}',
  'entry.open': 'Open Bot Browser',
  'entry.opening': 'Opening…',
  'entry.stop': 'Stop',
  'entry.stopping': 'Stopping…',
  'entry.hint':
    'Sign in to the sites you need in the window that opens; logins persist in this browser profile.',
  'entry.error': 'Browser action failed',
};

export type BrowserTranslate = (
  key: BrowserKey,
  params?: Record<string, string | number>,
) => string;
