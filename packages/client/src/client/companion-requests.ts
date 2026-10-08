import type { CompanionApproval } from '../../../core/src/companions/feed.js';

export function companionRequests(value: unknown, botSlug: string): CompanionApproval[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item: unknown): CompanionApproval[] => {
    if (typeof item !== 'object' || item === null) return [];
    if (
      !('kind' in item) ||
      item.kind !== 'tool-approval' ||
      !('botSlug' in item) ||
      item.botSlug !== botSlug ||
      !('channelId' in item) ||
      item.channelId !== `dm-${botSlug}` ||
      !('messageId' in item) ||
      typeof item.messageId !== 'string' ||
      !item.messageId ||
      !('sessionId' in item) ||
      typeof item.sessionId !== 'string' ||
      !item.sessionId ||
      !('callId' in item) ||
      typeof item.callId !== 'string' ||
      !item.callId ||
      !('toolName' in item) ||
      typeof item.toolName !== 'string' ||
      !('role' in item) ||
      (item.role !== 'orchestrator' && item.role !== 'assignment') ||
      !('cwd' in item) ||
      typeof item.cwd !== 'string' ||
      !('input' in item) ||
      typeof item.input !== 'string' ||
      !('channelName' in item) ||
      typeof item.channelName !== 'string' ||
      !('expiresAt' in item) ||
      typeof item.expiresAt !== 'string' ||
      !Number.isFinite(Date.parse(item.expiresAt))
    )
      return [];
    return [
      {
        kind: item.kind,
        botSlug,
        channelId: item.channelId,
        messageId: item.messageId,
        sessionId: item.sessionId,
        callId: item.callId,
        toolName: item.toolName,
        role: item.role,
        cwd: item.cwd,
        input: item.input,
        channelName: item.channelName,
        expiresAt: item.expiresAt,
      },
    ];
  });
}
