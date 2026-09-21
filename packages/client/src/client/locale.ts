import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots';

/** Locale namespace owning the BotHarness client's copy. */
export const LOCALE_NS = 'botharness';

/** Simplified Chinese dictionary and the key-set source of truth. */
export const zh = {
  'sort.menu.label': '排序方式',
  'sort.updated': '最近更新',
  'sort.manual': '手动排序',
  'sort.inherit': '恢复自动',
  'sort.row.title': 'BOT 列表排序',
  'sort.row.description': '设置 BOT 模式列表的默认排序方式',
  'sort.row.memory': '仅当前会话生效，不会保存',
  'section.rename': '重命名',
  'section.delete': '删除',
  'move.menu.label': '移动到',
  'pin.add': '置顶 PersonaBot',
  'pin.drop': '拖到此处置顶',
  'pin.remove': '取消置顶',
  'pin.zone.label': 'PersonaBot 置顶区域',
  'roster.readOnly': '名册存储不可用，陈列只读',
} as const satisfies Record<string, string>;

/** BotHarness dictionary key union. */
export type BotHarnessKey = keyof typeof zh;

/** English dictionary, checked against the Chinese key set. */
export const en = {
  'sort.menu.label': 'Sort by',
  'sort.updated': 'Recently updated',
  'sort.manual': 'Manual order',
  'sort.inherit': 'Reset to default',
  'sort.row.title': 'BOT list sorting',
  'sort.row.description': 'Default order for the BOT mode list',
  'sort.row.memory': 'Applies in this session only; not saved',
  'section.rename': 'Rename',
  'section.delete': 'Delete',
  'move.menu.label': 'Move to',
  'pin.add': 'Pin PersonaBot',
  'pin.drop': 'Drag here to pin',
  'pin.remove': 'Unpin',
  'pin.zone.label': 'Pinned PersonaBots',
  'roster.readOnly': 'Roster storage unavailable; the arrangement is read-only',
} satisfies Record<BotHarnessKey, string>;

/** Namespace-bound translate function carried by both surfaces. */
export type BotHarnessTranslate = TranslateNS<typeof LOCALE_NS>;

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** BotHarness client copy. */
    botharness: BotHarnessKey;
  }
}
