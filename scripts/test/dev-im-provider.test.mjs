import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { developmentProfileManifest } from '../dev-profile.mjs';
import {
  providerRuntimeDigest,
  qualifiedImProvider,
  verifyQualifiedImProvider,
  withQualifiedImProvider,
} from '../dev-im-provider.mjs';

const directories = [];
function artifact() {
  const profile = mkdtempSync(join(tmpdir(), 'bh-im-pin-'));
  directories.push(profile);
  const root = join(profile, 'node_modules', '@xmanrui', 'dsh-im');
  for (const directory of ['lib', 'plugin-src', 'src'])
    mkdirSync(join(root, directory), { recursive: true });
  writeFileSync(join(root, 'lib/index.js'), 'export const contractVersion = 1;');
  writeFileSync(join(root, 'src/consumer.mjs'), 'export const inboundVersion = 1;');
  writeFileSync(join(root, 'cordis.patch.yml'), '- insert: []');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({
      name: qualifiedImProvider.package,
      version: qualifiedImProvider.packageVersion,
      main: './lib/index.js',
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }),
  );
  writeFileSync(join(profile, 'package.json'), JSON.stringify(withQualifiedImProvider({})));
  const pin = { ...qualifiedImProvider, ...providerRuntimeDigest(root) };
  return { profile, root, pin };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe('qualified optional IM provider adoption', () => {
  it('pins one optional Bundle without losing other dependencies or promoting umbrella members', () => {
    const previous = {
      dependencies: { another: '1.2.3' },
      dsh: {
        profile: {
          bundles: [
            'another',
            '@botharness/browser',
            '@botharness/computer',
            '@botharness/core',
            '@botharness/ui',
          ],
        },
      },
    };
    const composed = withQualifiedImProvider(developmentProfileManifest(previous, '/fixture'));
    expect(composed.dependencies.another).toBe('1.2.3');
    expect(composed.dependencies[qualifiedImProvider.package]).toBe(qualifiedImProvider.spec);
    expect(composed.dsh.profile.bundles).toContain('another');
    expect(composed.dsh.profile.bundles).not.toContain('@botharness/browser');
    expect(composed.dsh.profile.bundles).not.toContain('@botharness/computer');
    expect(composed.dsh.profile.bundles).not.toContain('@botharness/core');
    expect(composed.dsh.profile.bundles).not.toContain('@botharness/ui');
    expect(withQualifiedImProvider(composed)).toEqual(composed);
    expect(previous.dsh.profile.bundles).toContain('@botharness/browser');
    expect(previous.dsh.profile.bundles).toContain('@botharness/computer');
    expect(previous.dsh.profile.bundles).toContain('@botharness/core');
  });

  it('verifies installed runtime bytes and reports the unreleased source honestly', () => {
    const f = artifact();
    expect(verifyQualifiedImProvider(f.profile, f.pin)).toMatchObject({
      source: qualifiedImProvider.source,
      runtimeSha256: f.pin.runtimeSha256,
      upstreamReleased: false,
    });
  });

  it('refuses a changed runtime despite unchanged package name and version', () => {
    const f = artifact();
    writeFileSync(join(f.root, 'src/consumer.mjs'), 'export const inboundVersion = 0;');
    expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('refusing to boot');
  });

  it('refuses a legacy or branch dependency instead of silently treating it as the pin', () => {
    for (const spec of ['4.32.0', 'github:DoodleBears/dsh-im#main']) {
      const f = artifact();
      const manifest = JSON.parse(readFileSync(join(f.profile, 'package.json'), 'utf8'));
      manifest.dependencies[qualifiedImProvider.package] = spec;
      writeFileSync(join(f.profile, 'package.json'), JSON.stringify(manifest));
      expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('qualified source');
    }
  });

  it('refuses altered package entrypoints or a disabled Bundle', () => {
    const f = artifact();
    const manifest = JSON.parse(readFileSync(join(f.root, 'package.json'), 'utf8'));
    manifest.main = './src/unqualified.mjs';
    writeFileSync(join(f.root, 'package.json'), JSON.stringify(manifest));
    expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('metadata differs');
    writeFileSync(
      join(f.profile, 'package.json'),
      JSON.stringify({
        dependencies: { [qualifiedImProvider.package]: qualifiedImProvider.spec },
        dsh: { profile: { bundles: [] } },
      }),
    );
    expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('qualified source');
  });

  it('refuses injected files and runtime links outside the packaged code tree', () => {
    const f = artifact();
    writeFileSync(join(f.root, 'src/extra.mjs'), 'unexpected');
    expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('refusing to boot');
    rmSync(join(f.root, 'src/extra.mjs'));
    symlinkSync(join(f.root, 'lib/index.js'), join(f.root, 'src/link.mjs'));
    expect(() => verifyQualifiedImProvider(f.profile, f.pin)).toThrow('symbolic link');
  });
});
