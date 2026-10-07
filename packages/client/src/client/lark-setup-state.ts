import type { MessagingSnapshot } from '../../../core/src/messaging/outbound.js';

export const LARK_SETUP_STEPS = ['app', 'bind', 'verify'] as const;
export type LarkSetupStep = (typeof LARK_SETUP_STEPS)[number];

export function larkSetupState(snapshot: MessagingSnapshot | undefined, accountKey: string) {
  const account = snapshot?.accounts.find(
    (a) => a.platform === 'feishu' && `${a.providerId}:${a.ref}` === accountKey,
  );
  const identity = snapshot?.identities?.find(
    (i) =>
      i.platform === 'feishu' &&
      i.providerId === account?.providerId &&
      i.accountRef === account?.ref &&
      i.fingerprint === account.fingerprint &&
      i.enabled &&
      i.availability === 'available',
  );
  const grants =
    snapshot?.grants.filter(
      (g) =>
        g.bindingId === identity?.id &&
        !g.revokedAt &&
        g.availability === 'available' &&
        g.receiveScope &&
        g.reception === 'receiving',
    ) ?? [];
  const receipt = snapshot?.setup?.receipts.find(
    (r) =>
      grants.some(
        (g) => g.id === r.grantId && g.receiveScope?.conversationId === r.conversationId,
      ) && !!r.threadId,
  );
  return {
    account,
    identity,
    grants,
    receipt,
    providerReady: snapshot?.setup?.providerReady === true,
    next: !account?.connected ? 'app' : !identity ? 'bind' : 'verify',
    complete:
      snapshot?.setup?.providerReady === true &&
      !!account?.connected &&
      !!identity &&
      !!receipt?.replyMessageId &&
      receipt?.replyState === 'provider-accepted',
  };
}
