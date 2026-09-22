export const ATTACHMENT_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/u;

export interface ChannelAttachmentRef {
  hash: string;
  name: string;
  mime: string;
  size: number;
}

export function isChannelAttachmentRef(value: unknown): value is ChannelAttachmentRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Record<string, unknown>;
  return (
    typeof ref['hash'] === 'string' &&
    ATTACHMENT_HASH_PATTERN.test(ref['hash']) &&
    typeof ref['name'] === 'string' &&
    ref['name'].length > 0 &&
    ref['name'].length <= 180 &&
    !/[/\\\u0000-\u001f\u007f]/u.test(ref['name']) &&
    typeof ref['mime'] === 'string' &&
    /^[a-z][a-z0-9.+-]*\/[a-z0-9][a-z0-9.+-]*$/u.test(ref['mime']) &&
    Number.isSafeInteger(ref['size']) &&
    (ref['size'] as number) >= 0
  );
}
