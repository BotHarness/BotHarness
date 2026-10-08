import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { compactNative, checkNativeWait } from './experiment-native-wait-proof.mjs';

export function exportWaitEvidence(proof) {
  const read = (kind) => proof.observations.find((o) => o.kind === kind)?.value;
  const request = read('native-request');
  const before = compactNative(read('native-before'));
  const during = compactNative(read('while-pending').native);
  const after = compactNative(read('native-after'));
  const owned = proof.observations.find(
    (o) => o.kind === 'owned-native-after' && o.value.role === 'orchestrator',
  );
  const orchestrator = owned ? compactNative(owned.value.snapshot) : after;
  const messages = read('messages-after');
  const rejected = ['revoked', 'changed'].includes(proof.mode);
  const verdict = checkNativeWait({
    owner: request.toolApprovalRequest?.role ?? 'orchestrator',
    before,
    during,
    after,
    orchestrator,
    request,
    messages,
    decision: read('web-decision-response') ?? read('stale-decision'),
    rejected,
  });
  const scene = read('scene');
  const unrelatedId = read('while-pending').unrelatedId;
  const submission = proof.observations.find(
    (o) => o.kind === 'human-submit' && o.value.messageId === unrelatedId,
  );
  const result = {
    issue: 1036,
    dsh: '0.2.0-rc.1',
    upstream: '4878cdabd87d4041bdaff61d04c966883b9fd07a',
    applicationBaseline: 'fe08fd925f9bf4644b4634ef464ce83e758bfdae',
    mode: proof.mode,
    startedAt: proof.startedAt,
    finishedAt: proof.finishedAt,
    botSlug: scene.bot.slug,
    channelId: scene.channelId,
    request,
    scope: read('grant'),
    scopeChange: read('scope-change') ?? read('revoke'),
    decision: read('web-decision-response') ?? read('stale-decision'),
    unrelated: {
      messageId: unrelatedId,
      submittedAt: submission.value.result.message.at,
      observedThrough: proof.observations.find((o) => o.kind === 'while-pending').at,
      replyDuringWait: read('while-pending').reply ?? null,
      admission: read('while-pending').attention.items.find(
        (i) => i.sourceMessageId === unrelatedId,
      ),
    },
    verdict,
    before,
    during,
    after,
    orchestrator,
    messages: messages.filter(
      (m) => m.author.kind === 'bot' || m.toolApprovalDecision || m.userQuestionResolution,
    ),
    client: proof.observations
      .filter((o) => o.kind === 'client' || o.kind === 'client-final')
      .map((o) => ({ at: o.at, consoleErrors: o.value.consoleErrors })),
  };
  const scrub = (value) => {
    if (typeof value === 'string') {
      let safe = value;
      let path = homedir();
      for (let n = 0; n < 4; n++) {
        safe = safe.split(path).join('[user-home]');
        path = JSON.stringify(path).slice(1, -1);
      }
      return safe.split(homedir().replaceAll('\\', '/')).join('[user-home]');
    }
    if (Array.isArray(value)) return value.map(scrub);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, scrub(v)]));
    return value;
  };
  return scrub(result);
}

if (process.argv[1]?.endsWith('experiment-native-wait-evidence.mjs')) {
  const proof = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const result = exportWaitEvidence(proof);
  writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.verdict));
}
