import { createHash } from 'node:crypto';
import { MessagingError, MessagingProviderError, type MessagingProvider } from './provider.js';

interface DshImTarget {
  targetId: string;
  name?: string;
  kind: string;
  route: Record<string, string | number>;
}

export interface DshImOutboundService {
  contractVersion: 1;
  listBots(): Promise<{ botId: string; channel: string }[]>;
  listTargets(botId: string): Promise<DshImTarget[]>;
  describeBot(botId: string): Promise<{
    version: 1;
    channel: string;
    botId: string;
    account: { fingerprint: string; name?: string };
    connected: boolean;
    capabilities: string[];
  }>;
  sendChecked(
    botId: string,
    targetId: string,
    text: string,
    options: {
      expectedFingerprint: string;
      expectedTargetDigest: string;
      signal: AbortSignal;
      format: 'plain';
    },
  ): Promise<{ sent: true }>;
}

function targetDigest(target: DshImTarget): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        kind: target.kind,
        route: Object.fromEntries(
          Object.entries(target.route).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        ),
      }),
    )
    .digest('hex');
}

export function createDshImProvider(value: unknown): MessagingProvider | undefined {
  if (value === null || typeof value !== 'object') return undefined;
  const service = value as Partial<DshImOutboundService>;
  if (
    service.contractVersion !== 1 ||
    typeof service.describeBot !== 'function' ||
    typeof service.sendChecked !== 'function' ||
    typeof service.listBots !== 'function' ||
    typeof service.listTargets !== 'function'
  )
    return undefined;
  const host = service as DshImOutboundService;
  const account = async (ref: string) => {
    let info;
    try {
      info = await host.describeBot(ref);
    } catch (error) {
      const code =
        error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
      throw new MessagingError(
        code === 'unknown-bot' || code === 'account-changed'
          ? 'rebind-required'
          : 'provider-unavailable',
      );
    }
    if (
      info.version !== 1 ||
      info.botId !== ref ||
      info.channel !== 'feishu' ||
      !/^[a-f0-9]{64}$/.test(info.account?.fingerprint ?? '') ||
      !info.capabilities.includes('proactive-text-checked')
    )
      throw new MessagingError('provider-incompatible');
    return {
      ref,
      platform: info.channel,
      name: info.account.name ?? ref,
      fingerprint: info.account.fingerprint,
      connected: info.connected,
    };
  };
  const targets = async (ref: string) =>
    (await host.listTargets(ref)).map((target) => ({
      ref: target.targetId,
      name: target.name ?? target.targetId,
      digest: targetDigest(target),
    }));
  return {
    id: 'dsh-im/feishu',
    async accounts() {
      const bots = (await host.listBots()).filter((bot) => bot.channel === 'feishu');
      const result = await Promise.allSettled(bots.map((bot) => account(bot.botId)));
      return result.flatMap((item) => (item.status === 'fulfilled' ? [item.value] : []));
    },
    targets,
    async inspect(accountRef, targetRef) {
      const current = await account(accountRef);
      const target = (await targets(accountRef)).find((item) => item.ref === targetRef);
      if (target === undefined) throw new MessagingError('rebind-required');
      return { account: current, target };
    },
    async send(input) {
      try {
        const result = await host.sendChecked(input.accountRef, input.targetRef, input.text, {
          expectedFingerprint: input.fingerprint,
          expectedTargetDigest: input.targetDigest,
          signal: input.signal,
          format: 'plain',
        });
        if (result.sent !== true)
          throw new MessagingProviderError('provider-result-unknown', 'unknown');
        return { accepted: true };
      } catch (error) {
        if (error instanceof MessagingProviderError) throw error;
        const code =
          error !== null &&
          typeof error === 'object' &&
          'code' in error &&
          typeof error.code === 'string'
            ? error.code
            : 'provider-result-unknown';
        const definite = [
          'unknown-bot',
          'unknown-target',
          'account-changed',
          'account-unverified',
          'target-changed',
          'capability-unavailable',
          'bot-not-connected',
          'bad-request',
        ].includes(code);
        throw new MessagingProviderError(
          definite ? code : 'provider-result-unknown',
          definite ? 'not-started' : 'unknown',
        );
      }
    },
  };
}
