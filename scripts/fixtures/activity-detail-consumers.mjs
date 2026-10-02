import { writeFileSync } from 'node:fs';

export const name = 'botharness-tool-detail-qa';
export const inject = ['botharnessActivityDetails'];

export function apply(ctx, config) {
  const proof = {
    realHost: true,
    allowedArguments: false,
    allowedResult: false,
    unknownRefRefused: false,
    unauthorizedRefused: false,
    revokedRefRefused: false,
    safeActivityOnly: true,
  };
  const references = new Map();
  const persist = () => writeFileSync(config.proofPath, `${JSON.stringify(proof, null, 2)}\n`);
  ctx.plugin({
    name: 'botharness-tool-detail-denied-qa',
    inject: ['botharnessActivityDetails'],
    apply(denied) {
      denied.on(
        'botharness/personabot/activity',
        (event) => {
          const reference = event.activity?.detailRefs?.[0];
          if (!reference) return;
          const read = denied.botharnessActivityDetails.read(reference);
          proof.unauthorizedRefused ||= !read.ok && read.reason === 'unauthorized';
          persist();
        },
        { global: true },
      );
    },
  });
  ctx.on(
    'botharness/personabot/activity',
    (event) => {
      const reference = event.activity?.detailRefs?.[0];
      if (reference) references.set(event.slug, reference);
      const remembered = references.get(event.slug);
      if (!remembered) return;
      const read = ctx.botharnessActivityDetails.read(remembered);
      if (read.ok) {
        proof.allowedArguments ||= read.detail.arguments.includes('setTimeout');
        proof.allowedResult ||= read.detail.result !== undefined;
      } else if (event.state === 'idle') {
        proof.revokedRefRefused ||= read.reason === 'unavailable';
        references.delete(event.slug);
      }
      const unknown = ctx.botharnessActivityDetails.read('unknown-tool-reference');
      proof.unknownRefRefused ||= !unknown.ok && unknown.reason === 'unavailable';
      proof.safeActivityOnly &&= !/setTimeout|private-command|"arguments"|"result"|"meta"/.test(
        JSON.stringify(event),
      );
      persist();
    },
    { global: true },
  );
  persist();
}
