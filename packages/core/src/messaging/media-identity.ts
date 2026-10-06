import { createHash } from 'node:crypto';

export function sourceMediaUploadId(
  providerId: string,
  fingerprint: string,
  conversationId: string,
  attachmentId: string,
): string {
  const hash = createHash('sha256')
    .update(JSON.stringify([providerId, fingerprint, conversationId, attachmentId]))
    .digest('hex')
    .slice(0, 32);
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16),
    '8' + hash.slice(17, 20),
    hash.slice(20),
  ].join('-');
}
