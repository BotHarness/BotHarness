import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
export const name = 'botharness-output-qa';
export const inject = ['botharness'];
export function apply(ctx, config) {
  const core = ctx.botharness;
  const proof = {
    generation: randomUUID(),
    events: [],
    filtered: [],
    syncFailures: 0,
    asyncFailures: 0,
    consumerDisposed: false,
  };
  const persist = () => writeFileSync(config.proofPath, JSON.stringify(proof, null, 2) + '\n');
  const selected = (event) =>
    core.registry.get(event.botId)?.displayName.startsWith('Output QA ') === true;
  ctx.on(
    'botharness/personabot/output-committed',
    (event) => {
      if (!selected(event)) return;
      proof.syncFailures++;
      throw new Error('neutral-sync-consumer-refusal');
    },
    { global: true },
  );
  ctx.on(
    'botharness/personabot/output-committed',
    async (event) => {
      if (!selected(event)) return;
      proof.asyncFailures++;
      throw new Error('neutral-async-consumer-refusal');
    },
    { global: true },
  );
  const consumer = ctx.plugin({
    name: 'neutral-filtered-output-consumer',
    apply(child) {
      child.on(
        'botharness/personabot/output-committed',
        (event) => {
          if (!selected(event) || event.channelId !== 'dm-' + event.botId) return;
          proof.filtered.push(event.messageId);
          if (event.content.body === 'dispose neutral listener') {
            void consumer.dispose().then(() => {
              proof.consumerDisposed = true;
              persist();
            });
          }
        },
        { global: true },
      );
    },
  });
  ctx.on(
    'botharness/personabot/output-committed',
    (event) => {
      if (!selected(event)) return;
      const stored = core.channels.message(event.channelId, event.messageId);
      proof.events.push({
        event,
        alreadyCommitted: stored?.body === event.content.body,
        ownedSession: core.ownership.resolve(event.sessionId)?.botSlug === event.botId,
        frozen:
          Object.isFrozen(event) &&
          Object.isFrozen(event.content) &&
          Object.isFrozen(event.correlation),
      });
      if (proof.events.length > 20) proof.events.shift();
      persist();
    },
    { global: true },
  );
  persist();
}
