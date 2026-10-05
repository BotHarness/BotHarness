import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  checkPackage,
  existingArtifact,
  prereleaseVersion,
  publicationOrder,
  verifyRelease,
} from '../npm-prerelease.mjs';
import { productImProvider } from '../product-artifacts.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'npm-prerelease-test-'));
  roots.push(root);
  const runtime = { runtimeFiles: 1, runtimeSha256: 'a'.repeat(64) };
  const artifacts = publicationOrder.map((name, index) => {
    const dir = join(root, String(index));
    mkdirSync(join(dir, 'package'), { recursive: true });
    const version = name === productImProvider.name ? productImProvider.version : '0.1.0-alpha.1';
    const manifest = { name, version, license: 'MIT', main: './index.js' };
    if (name === 'deepseekbot') {
      manifest.dependencies = Object.fromEntries(
        publicationOrder
          .slice(0, -1)
          .map((n) => [n, n === productImProvider.name ? productImProvider.version : version]),
      );
      manifest.dsh = { bundle: { patch: './cordis.im.patch.yml' } };
      writeFileSync(
        join(dir, 'package/cordis.im.patch.yml'),
        "- insert:\n    - id: xmanrui-dsh-im\n      name: '@botharness/im-provider'\n    - id: botharness-core\n      name: '@botharness/core'\n    - id: botharness-client\n      name: '@botharness/ui'\n",
      );
    }
    if (name === productImProvider.name)
      writeFileSync(
        join(dir, 'package/PROVENANCE.json'),
        JSON.stringify({ source: productImProvider.upstream.source, compiledOutput: runtime }),
      );
    writeFileSync(join(dir, 'package/package.json'), JSON.stringify(manifest));
    writeFileSync(join(dir, 'package/index.js'), 'export const apply = () => {};');
    writeFileSync(join(dir, 'package/LICENSE'), 'MIT');
    const filename = `${index}.tgz`;
    execFileSync('tar', ['-czf', join(root, filename), '-C', dir, 'package']);
    return {
      name,
      version,
      filename,
      integrity: `sha512-${createHash('sha512')
        .update(readFileSync(join(root, filename)))
        .digest('base64')}`,
    };
  });
  writeFileSync(
    join(root, 'artifacts.json'),
    JSON.stringify({
      productVersion: '0.1.0-alpha.1',
      dsh: productImProvider.upstream.dsh,
      providerRuntime: runtime,
      artifacts,
    }),
  );
  const plan = {
    productVersion: '0.1.0-alpha.1',
    sourceSha: 'b'.repeat(40),
    sourceDirty: false,
    providerSource: productImProvider.upstream.source,
    dsh: productImProvider.upstream.dsh,
    distTag: 'next',
    publicationOrder,
    artifactsSha256: sha256(readFileSync(join(root, 'artifacts.json'))),
  };
  writeFileSync(join(root, 'release-plan.json'), JSON.stringify(plan));
  return { root, plan };
}

describe('reviewed npm prerelease', () => {
  it.each(['1.0.0', '0.0.0-test.824', 'v0.1.0-alpha.1', 'latest', ''])(
    'refuses unintended public version %s',
    (v) => expect(() => prereleaseVersion(v)).toThrow(),
  );
  it('verifies real tarballs and dependency order with source/plan agreement', () => {
    const { root } = fixture();
    const result = verifyRelease(root, {
      version: '0.1.0-alpha.1',
      sourceSha: 'b'.repeat(40),
      clean: true,
      planSha256: sha256(readFileSync(join(root, 'release-plan.json'))),
    });
    expect(result.packages.map((p) => p.artifact.name)).toEqual(publicationOrder);
    expect(result.packages.at(-1).manifest.dependencies['@botharness/core']).toBe('0.1.0-alpha.1');
  });
  it.each([
    { sourceSha: 'c'.repeat(40) },
    { version: '0.2.0-alpha.1' },
    { planSha256: '0'.repeat(64) },
  ])('refuses mismatched review evidence %j', (expected) => {
    const { root } = fixture();
    expect(() => verifyRelease(root, expected)).toThrow('Reviewed release plan');
  });
  it.each(['sourceDirty', 'distTag', 'publicationOrder', 'providerSource'])(
    'refuses altered plan %s',
    (key) => {
      const { root, plan } = fixture();
      plan[key] = key === 'sourceDirty' ? true : 'wrong';
      writeFileSync(join(root, 'release-plan.json'), JSON.stringify(plan));
      expect(() => verifyRelease(root, { clean: true })).toThrow('Reviewed release plan');
    },
  );
  it('does not accept a changed tarball even when its filename remains the same', () => {
    const { root } = fixture();
    writeFileSync(join(root, '0.tgz'), 'changed');
    expect(() => verifyRelease(root)).toThrow('Product artifact changed');
  });
  it('rejects local dependencies and absent executable files', () => {
    const artifact = { name: '@botharness/core', version: '0.1.0-alpha.1' };
    const manifest = {
      ...artifact,
      license: 'MIT',
      main: './dist/index.mjs',
      dependencies: { other: 'link:../other' },
    };
    expect(() => checkPackage(manifest, artifact, ['package/LICENSE'], [artifact])).toThrow(
      'Non-registry dependency',
    );
    delete manifest.dependencies;
    expect(() => checkPackage(manifest, artifact, ['package/LICENSE'], [artifact])).toThrow(
      'Missing packed entry',
    );
  });
  it('recovers a partial publication only when the existing version has identical bytes', () => {
    const artifact = { name: 'deepseekbot', version: '0.1.0-alpha.1', integrity: 'sha512-test' };
    expect(existingArtifact(artifact, undefined)).toBe(false);
    expect(
      existingArtifact(artifact, { ...artifact, dist: { integrity: artifact.integrity } }),
    ).toBe(true);
    expect(() =>
      existingArtifact(artifact, { ...artifact, dist: { integrity: 'different' } }),
    ).toThrow('different bytes');
  });
});
