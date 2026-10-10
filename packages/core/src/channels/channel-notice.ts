import type { ChannelMessage } from './channel.js';

const CHANNEL_NOTICE_FIELDS = ['botDmAction', 'memoryCommit'] as const;

export function isChannelNotice(
  message: Pick<ChannelMessage, 'botDmAction' | 'memoryCommit'>,
): boolean {
  return CHANNEL_NOTICE_FIELDS.some((field) => message[field] !== undefined);
}

export function notChannelNoticeSql(payloadColumn: string): string {
  return CHANNEL_NOTICE_FIELDS.map(
    (field) => `json_type(${payloadColumn}, '$.${field}') IS NULL`,
  ).join(' AND ');
}
