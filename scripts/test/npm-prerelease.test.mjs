import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  awaitPublished,
  checkPackage,
  existingArtifact,
  distTagFor,
  publicationOrder,
  publicationWaves,
  publishInWaves,
  releaseVersion,
  verifyRelease,
} from '../npm-prerelease.mjs';
import { productImProvider } from '../product-artifacts.mjs';

const roots = [];
afterEach(() => roots.splice(0).forEach((r) => rmSync(r, { recursive: true, force: true })));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(productVersion = '0.1.0-alpha.1') {
  const root = mkdtempSync(join(tmpdir(), 'npm-prerelease-test-'));
  roots.push(root);
  const runtime = { runtimeFiles: 1, runtimeSha256: 'a'.repeat(64) };
  const artifacts = publicationOrder.map((name, index) => {
    const dir = join(root, String(index));
    mkdirSync(join(dir, 'package'), { recursive: true });
    const version = name === productImProvider.name ? productImProvider.version : productVersion;
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
      productVersion,
      dsh: productImProvider.upstream.dsh,
      providerRuntime: runtime,
      artifacts,
    }),
  );
  const plan = {
    productVersion,
    sourceSha: 'b'.repeat(40),
    sourceDirty: false,
    providerSource: productImProvider.upstream.source,
    dsh: productImProvider.upstream.dsh,
    distTag: distTagFor(productVersion),
    publicationOrder,
    artifactsSha256: sha256(readFileSync(join(root, 'artifacts.json'))),
  };
  writeFileSync(join(root, 'release-plan.json'), JSON.stringify(plan));
  return { root, plan };
}

describe('reviewed npm prerelease', () => {
  it.each(['0.0.0', '0.0.0-test.824', 'v0.1.0-alpha.1', 'latest', ''])(
    'refuses unintended public version %s',
    (v) => expect(() => releaseVersion(v)).toThrow(),
  );
  it.each([
    ['1.0.0', 'latest'],
    ['1.2.3', 'latest'],
    ['0.1.0-alpha.1', 'next'],
    ['1.1.0-rc.1', 'next'],
  ])('publishes %s to the %s dist-tag', (version, tag) => {
    expect(releaseVersion(version)).toBe(version);
    expect(distTagFor(version)).toBe(tag);
  });
  it('verifies a stable release planned for latest', () => {
    const { root } = fixture('1.0.0');
    const result = verifyRelease(root, { version: '1.0.0', clean: true });
    expect(result.plan.distTag).toBe('latest');
    expect(result.packages.at(-1).manifest.dependencies['@botharness/core']).toBe('1.0.0');
  });
  it('refuses a stable release planned for next', () => {
    const { root, plan } = fixture('1.0.0');
    writeFileSync(join(root, 'release-plan.json'), JSON.stringify({ ...plan, distTag: 'next' }));
    expect(() => verifyRelease(root)).toThrow('Reviewed release plan');
  });
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
  it('waits for a slow registry readback before confirming publication', async () => {
    const artifact = { name: 'deepseekbot', version: '1.0.0', integrity: 'sha512-test' };
    const published = { ...artifact, dist: { integrity: artifact.integrity } };
    const reads = [undefined, undefined, published];
    const read = async () => reads.shift();
    const sleep = async () => {};
    await expect(awaitPublished(artifact, { read, sleep, attempts: 5 })).resolves.toBe(3);
    await expect(
      awaitPublished(artifact, { read: async () => undefined, sleep, attempts: 2 }),
    ).resolves.toBe(0);
    await expect(
      awaitPublished(artifact, {
        read: async () => ({ ...artifact, dist: { integrity: 'different' } }),
        sleep,
      }),
    ).rejects.toThrow('different bytes');
  });
  it('publishes dependencies together and the product only after every dependency is confirmed', async () => {
    const entry = (name) => ({ artifact: { name } });
    const packages = publicationOrder.map(entry);
    const waves = publicationWaves(packages);
    expect(waves.map((wave) => wave.map(({ artifact }) => artifact.name))).toEqual([
      publicationOrder.slice(0, -1),
      ['deepseekbot'],
    ]);
    expect(publicationWaves([entry('deepseekbot')])).toHaveLength(1);
    const events = [];
    const pending = new Map();
    const run = publishInWaves(waves, ({ artifact }) => {
      events.push(`start ${artifact.name}`);
      return new Promise((done) => pending.set(artifact.name, done));
    });
    await Promise.resolve();
    expect(events).toEqual(publicationOrder.slice(0, -1).map((name) => `start ${name}`));
    for (const name of publicationOrder.slice(0, -1)) pending.get(name)();
    await new Promise((done) => setTimeout(done, 0));
    expect(events.at(-1)).toBe('start deepseekbot');
    pending.get('deepseekbot')();
    await run;
    const product = vi.fn();
    await expect(
      publishInWaves(waves, async ({ artifact }) => {
        if (artifact.name === '@botharness/core') throw new Error('core refused');
        if (artifact.name === 'deepseekbot') product();
      }),
    ).rejects.toThrow('core refused');
    expect(product).not.toHaveBeenCalled();
  });
});
