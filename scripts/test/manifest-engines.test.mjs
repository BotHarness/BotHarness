import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import semver from 'semver';
import { describe, expect, it } from 'vitest';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const packages = ['core', 'client', 'computer', 'deepseekbot'];

function manifest(packageName) {
  return JSON.parse(readFileSync(join(root, 'packages', packageName, 'package.json'), 'utf8'));
}

describe('DSH engine declaration', () => {
  it('declares one shared SemVer range across every workspace package', () => {
    const ranges = packages.map((packageName) => manifest(packageName).engines?.dsh);
    expect(ranges.every((range) => typeof range === 'string')).toBe(true);
    expect(new Set(ranges).size).toBe(1);
    expect(semver.validRange(ranges[0])).not.toBeNull();
  });

  it('anchors the range floor to the pinned DSH devDependency', () => {
    const range = manifest('core').engines.dsh;
    const pinned = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).devDependencies[
      '@deepseek-ai/dsh'
    ];
    expect(semver.minVersion(range)?.version).toBe(pinned);
    expect(semver.satisfies(pinned, range)).toBe(true);
  });

  it('keeps the verified 0.2 line inside the range and older lines outside it', () => {
    const range = manifest('core').engines.dsh;
    expect(semver.satisfies('0.2.0-rc.1', range)).toBe(true);
    expect(semver.satisfies('0.2.0-rc.2', range)).toBe(true);
    expect(semver.satisfies('0.2.0', range)).toBe(true);
    expect(semver.satisfies('0.1.7-rc.2', range)).toBe(false);
    expect(semver.satisfies('0.3.0-rc.1', range)).toBe(false);
  });
});
