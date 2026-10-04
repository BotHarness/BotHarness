import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assertGroupShellProof } from '../e2e-group-shell-proof.mjs';
function recorded() {
  return JSON.parse(
    readFileSync(
      new URL('../../docs/assets/pr/124-group-shell/runtime-proof.json', import.meta.url),
      'utf8',
    ),
  );
}
describe('Group shell evidence guard', () => {
  it('accepts real recorded proof', () => {
    expect(() => assertGroupShellProof(recorded())).not.toThrow();
  });
  it('rejects timeout-only separators', () => {
    const p = recorded();
    p.messages[8].at = new Date(Date.parse(p.messages[6].at) + 16000).toISOString();
    p.messages[9].at = new Date(Date.parse(p.messages[8].at) + 1000).toISOString();
    expect(() => assertGroupShellProof(p)).toThrow('separator proof');
  });
  it('rejects a duplicate identity header', () => {
    const p = recorded();
    p.rendered[0].headers = 2;
    expect(() => assertGroupShellProof(p)).toThrow();
  });
  it('rejects merged groups across system events', () => {
    const p = recorded();
    p.rendered[8].groupIds = [
      p.messages[5].id,
      p.messages[6].id,
      p.messages[8].id,
      p.messages[9].id,
    ];
    expect(() => assertGroupShellProof(p)).toThrow('isolated consecutive pair');
  });
  it('rejects failed native sends', () => {
    const p = recorded();
    p.native[0].isError = true;
    expect(() => assertGroupShellProof(p)).toThrow();
  });
  it('rejects missing custom-avatar persistence', () => {
    const p = recorded();
    p.pinnedReload.custom.sourceMatches = false;
    expect(() => assertGroupShellProof(p)).toThrow();
  });
});
