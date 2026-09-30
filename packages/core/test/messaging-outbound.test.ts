import { rmSync } from 'node:fs';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import { createDshImProvider } from '../src/messaging/dsh-im.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

function fixture(timeoutMs = 100) {
  const home = createTempRoot('botharness-outbox-');
  let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let active = true;
  let fingerprint = 'a'.repeat(64);
  let digest = 'b'.repeat(64);
  let sends = 0;
  let inspections = 0;
  let beforeInspect: (() => Promise<void>) | undefined;
  let effect: (() => Promise<{ accepted: true }>) | undefined;
  const provider: MessagingProvider = {
    id: 'test-provider',
    accounts: async () => [
      { ref: 'account', platform: 'test', name: 'Verified account', fingerprint, connected: true },
    ],
    targets: async () => [{ ref: 'self', name: 'Self', digest }],
    async inspect() {
      ++inspections;
      await beforeInspect?.();
      return {
        account: (await provider.accounts())[0]!,
        target: (await provider.targets('account'))[0]!,
      };
    },
    async send() {
      ++sends;
      const stored = service.history('ada')[0];
      expect(stored?.state).toBe('in-flight');
      return effect ? effect() : { accepted: true };
    },
  };
  const make = () =>
    createOutboundMessaging({
      database: attachOperationalModule(owner, 'messaging'),
      isBotActive: () => active,
      timeoutMs,
    });
  let service = make();
  let dispose = service.register(provider);
  const authorize = () =>
    service.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'account',
      targetRef: 'self',
      fingerprint,
      targetDigest: digest,
    });
  return {
    home,
    provider,
    authorize,
    get service() {
      return service;
    },
    get sends() {
      return sends;
    },
    get inspections() {
      return inspections;
    },
    setActive(value: boolean) {
      active = value;
    },
    setFingerprint(value: string) {
      fingerprint = value;
    },
    setDigest(value: string) {
      digest = value;
    },
    setInspect(value: () => Promise<void>) {
      beforeInspect = value;
    },
    setEffect(value: () => Promise<{ accepted: true }>) {
      effect = value;
    },
    dispose() {
      dispose();
    },
    crash() {
      owner.close();
    },
    restart() {
      service.close();
      owner.close();
      owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
      service = make();
      dispose = service.register(provider);
    },
    cleanup() {
      service.close();
      owner.close();
      rmSync(home, { recursive: true, force: true });
    },
  };
}

it('commits intent and attempt before the effect, and deduplicates concurrent browser requests across restart', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    const [a, b] = await Promise.all([
      fx.service.send('ada', grant.id, 'request-one', 'hello'),
      fx.service.send('ada', grant.id, 'request-one', 'hello'),
    ]);
    expect(a.id).toBe(b.id);
    expect(fx.sends).toBe(1);
    expect(fx.service.history('ada')[0]?.state).toBe('provider-accepted');
    fx.restart();
    const repeated = await fx.service.send('ada', grant.id, 'request-one', 'hello');
    expect(repeated.state).toBe('provider-accepted');
    expect(fx.sends).toBe(1);
    await expect(fx.service.send('ada', grant.id, 'request-one', 'other')).rejects.toThrow(
      'request-conflict',
    );
  } finally {
    fx.cleanup();
  }
});

it('revocation during dispatch preflight settles the durable pending intent without sending', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    const before = fx.inspections;
    fx.setInspect(async () => {
      if (fx.inspections === before + 2) fx.service.revoke('ada', grant.id);
    });
    const result = await fx.service.send('ada', grant.id, 'request-revoke', 'hello');
    expect(result.state).toBe('grant-revoked');
    expect(fx.sends).toBe(0);
    await expect(fx.service.send('ada', grant.id, 'request-new', 'hello')).rejects.toThrow(
      'grant-revoked',
    );
  } finally {
    fx.cleanup();
  }
});

it('changed account or target and an archived bot fail closed', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    fx.setFingerprint('c'.repeat(64));
    await expect(fx.service.send('ada', grant.id, 'request-account', 'hello')).rejects.toThrow(
      'rebind-required',
    );
    fx.setFingerprint(grant.fingerprint);
    fx.setDigest('d'.repeat(64));
    await expect(fx.service.send('ada', grant.id, 'request-target', 'hello')).rejects.toThrow(
      'rebind-required',
    );
    fx.setDigest(grant.targetDigest);
    fx.setActive(false);
    await expect(fx.service.send('ada', grant.id, 'request-archive', 'hello')).rejects.toThrow(
      'bot-unavailable',
    );
    expect(fx.sends).toBe(0);
  } finally {
    fx.cleanup();
  }
});

it('timeout is unknown and remains unknown after restart without another effect', async () => {
  const fx = fixture(10);
  try {
    const grant = await fx.authorize();
    fx.setEffect(() => new Promise(() => undefined));
    const result = await fx.service.send('ada', grant.id, 'request-timeout', 'hello');
    expect(result.state).toBe('unknown-outcome');
    expect(fx.sends).toBe(1);
    fx.restart();
    expect((await fx.service.send('ada', grant.id, 'request-timeout', 'hello')).state).toBe(
      'unknown-outcome',
    );
    expect(fx.sends).toBe(1);
  } finally {
    fx.cleanup();
  }
});

it('registration disposal interrupts an in-flight result and never assumes the effect was cancelled', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    fx.setEffect(async () => {
      fx.dispose();
      return { accepted: true };
    });
    expect((await fx.service.send('ada', grant.id, 'request-dispose', 'hello')).state).toBe(
      'unknown-outcome',
    );
    expect(fx.sends).toBe(1);
  } finally {
    fx.cleanup();
  }
});

it('a crash after effect start recovers the durable attempt as unknown', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    fx.setEffect(async () => {
      fx.crash();
      throw new Error('host exited');
    });
    await expect(fx.service.send('ada', grant.id, 'request-crash', 'hello')).rejects.toThrow();
    fx.restart();
    expect(fx.service.history('ada')[0]).toMatchObject({
      state: 'unknown-outcome',
      reason: 'host-interrupted',
    });
    expect((await fx.service.send('ada', grant.id, 'request-crash', 'hello')).state).toBe(
      'unknown-outcome',
    );
    expect(fx.sends).toBe(1);
  } finally {
    fx.cleanup();
  }
});

it('an account has one active PersonaBot binding, and revocation permits explicit rebinding', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    await expect(fx.authorize()).rejects.toThrow('binding-conflict');
    fx.service.revoke('ada', grant.id);
    const next = await fx.authorize();
    expect(next.id).not.toBe(grant.id);
  } finally {
    fx.cleanup();
  }
});

it('a legacy dsh-im service cannot silently acquire verified-identity authority', () => {
  expect(createDshImProvider({ listBots() {}, listTargets() {}, send() {} })).toBeUndefined();
});

it('refresh detects a changed target and keeps the grant suspended after the original target returns', async () => {
  const fx = fixture();
  try {
    const grant = await fx.authorize();
    fx.setDigest('d'.repeat(64));
    expect((await fx.service.snapshot('ada')).grants[0]).toMatchObject({
      availability: 'rebind-required',
      revision: 2,
    });
    fx.setDigest(grant.targetDigest);
    fx.restart();
    expect((await fx.service.snapshot('ada')).grants[0]?.availability).toBe('rebind-required');
    await expect(fx.service.send('ada', grant.id, 'restored-route', 'hello')).rejects.toThrow(
      'rebind-required',
    );
    expect(fx.sends).toBe(0);
  } finally {
    fx.cleanup();
  }
});

it('replacing a provider interrupts its attempt while disposing the old registration preserves the new provider', async () => {
  const fx = fixture();
  let replacementSends = 0;
  let release: (() => void) | undefined;
  try {
    const grant = await fx.authorize();
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    fx.setEffect(() => {
      release?.();
      return new Promise(() => undefined);
    });
    const oldAttempt = fx.service.send('ada', grant.id, 'old-registration', 'hello');
    await started;
    fx.service.register({
      ...fx.provider,
      send: async () => {
        ++replacementSends;
        return { accepted: true };
      },
    });
    fx.dispose();
    expect((await oldAttempt).state).toBe('unknown-outcome');
    expect((await fx.service.send('ada', grant.id, 'new-registration', 'hello')).state).toBe(
      'provider-accepted',
    );
    expect(fx.sends).toBe(1);
    expect(replacementSends).toBe(1);
  } finally {
    fx.cleanup();
  }
});
