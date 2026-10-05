import { describe, expect, it } from 'vitest';
import { reviewedSource, requirePartialPublication } from '../npm-prerelease-recovery.mjs';

const sourceSha = 'a'.repeat(40);
const mainSha = 'b'.repeat(40);
const run = {
  path: '.github/workflows/npm-prerelease-prepare.yml',
  event: 'workflow_dispatch',
  head_branch: 'main',
  conclusion: 'success',
  head_sha: sourceSha,
};
const candidate = { run, sourceSha, mainSha, checkoutSha: mainSha, isAncestor: true };
const artifacts = [
  '@botharness/im-provider',
  '@botharness/core',
  '@botharness/ui',
  'deepseekbot',
].map((name) => ({
  name,
  version: name.endsWith('im-provider') ? '4.32.0-botharness.3' : '0.1.0-alpha.1',
  integrity: `sha512-${name}`,
}));
const remote = (artifact) => ({ ...artifact, dist: { integrity: artifact.integrity } });

describe('reviewed partial npm recovery', () => {
  it('keeps the default current-main publication path', () => {
    expect(
      reviewedSource({ ...candidate, mainSha: sourceSha, checkoutSha: sourceSha }).recovery,
    ).toBe(false);
    expect(() => reviewedSource(candidate)).toThrow('Historical preparation');
  });
  it('permits explicit recovery of an ancestral reviewed source, never a branch publisher', () => {
    expect(reviewedSource({ ...candidate, resumePartial: true }).recovery).toBe(true);
    expect(() =>
      reviewedSource({ ...candidate, resumePartial: true, isAncestor: false }),
    ).toThrow();
    expect(() =>
      reviewedSource({ ...candidate, resumePartial: true, checkoutSha: 'c'.repeat(40) }),
    ).toThrow();
  });
  it.each([
    { path: '.github/workflows/ci.yml' },
    { event: 'pull_request' },
    { head_branch: 'feature' },
    { conclusion: 'failure' },
    { head_sha: mainSha },
  ])('refuses unrelated or unsuccessful preparation %j', (change) => {
    expect(() =>
      reviewedSource({ ...candidate, resumePartial: true, run: { ...run, ...change } }),
    ).toThrow();
  });
  it('requires a matching product component; a reused Provider alone is insufficient', async () => {
    await expect(requirePartialPublication(artifacts, async () => undefined)).rejects.toThrow(
      'already published',
    );
    await expect(
      requirePartialPublication(artifacts, async (a) =>
        a.name.endsWith('im-provider') ? remote(a) : undefined,
      ),
    ).rejects.toThrow('already published');
    await expect(
      requirePartialPublication(artifacts, async (a) =>
        a.name === '@botharness/core' ? remote(a) : undefined,
      ),
    ).resolves.toEqual(['@botharness/core']);
  });
  it('checks every existing artifact, refusing conflicting UI even after matching Core', async () => {
    await expect(
      requirePartialPublication(artifacts, async (a) => {
        if (a.name === '@botharness/core') return remote(a);
        if (a.name === '@botharness/ui') return { ...remote(a), dist: { integrity: 'different' } };
        return undefined;
      }),
    ).rejects.toThrow('different bytes');
  });
  it('propagates unavailable registry evidence instead of admitting recovery', async () => {
    await expect(
      requirePartialPublication(artifacts, async () => {
        throw new Error('registry unavailable');
      }),
    ).rejects.toThrow('registry unavailable');
  });
});
