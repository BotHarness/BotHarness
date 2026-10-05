export function reviewedSource({
  run,
  sourceSha,
  mainSha,
  checkoutSha,
  resumePartial,
  isAncestor,
}) {
  if (
    !/^[a-f0-9]{40}$/.test(sourceSha) ||
    checkoutSha !== mainSha ||
    run.path !== '.github/workflows/npm-prerelease-prepare.yml' ||
    run.event !== 'workflow_dispatch' ||
    run.head_branch !== 'main' ||
    run.conclusion !== 'success' ||
    run.head_sha !== sourceSha
  )
    throw new Error('Preparation is not the successful reviewed manual-main run');
  if (sourceSha !== mainSha && (resumePartial !== true || isAncestor !== true))
    throw new Error(
      'Historical preparation requires explicit partial recovery from a main ancestor',
    );
  return { sourceSha, recovery: resumePartial === true };
}

async function publicVersion(artifact) {
  const url = `https://registry.npmjs.org/${encodeURIComponent(artifact.name)}/${encodeURIComponent(artifact.version)}?recovery=${Date.now()}`;
  const response = await fetch(url, {
    headers: { 'cache-control': 'no-cache' },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Registry read failed (${response.status}): ${artifact.name}`);
  return response.json();
}

export async function requirePartialPublication(artifacts, readVersion = publicVersion) {
  const existing = [];
  for (const artifact of artifacts) {
    const remote = await readVersion(artifact);
    if (!remote) continue;
    if (
      remote.name !== artifact.name ||
      remote.version !== artifact.version ||
      remote.dist?.integrity !== artifact.integrity
    )
      throw new Error(
        `Registry version already has different bytes: ${artifact.name}@${artifact.version}`,
      );
    existing.push(artifact.name);
  }
  if (
    !existing.some((name) => ['@botharness/core', '@botharness/ui', 'deepseekbot'].includes(name))
  )
    throw new Error('Partial recovery requires an already published matching product component');
  return existing;
}
