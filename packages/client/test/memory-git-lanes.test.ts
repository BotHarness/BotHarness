import { describe, expect, it } from 'vitest';
import { layoutMemoryGitLanes, memoryGraphRailPath } from '../src/client/memory-git-lanes.js';
import type { MemoryGitCommit } from '../src/client/bridge.js';

function commit(sha: string, parents: string[]): MemoryGitCommit {
  return {
    sha,
    parents,
    subject: sha,
    authoredAt: '2026-09-25T00:00:00Z',
    branches: [],
    status: 'pending',
  };
}

describe('Memory Git graph lanes', () => {
  it('connects two local branch heads to their shared parent', () => {
    const rows = layoutMemoryGitLanes([
      commit('branch-a', ['base']),
      commit('branch-b', ['base']),
      commit('base', []),
    ]);
    expect(rows.map((row) => row.lane)).toEqual([0, 1, 0]);
    expect(rows[1]?.toParents).toEqual([1]);
    expect(rows[2]?.joins).toEqual([1]);
    expect(rows.map((row) => row.fromAbove)).toEqual([false, false, true]);
  });

  it('keeps both parents of a merge visible through their shared ancestor', () => {
    const rows = layoutMemoryGitLanes([
      commit('merge', ['main', 'side']),
      commit('main', ['base']),
      commit('side', ['base']),
      commit('base', []),
    ]);
    expect(rows[0]?.toParents).toEqual([0, 1]);
    expect(rows[1]?.through).toEqual([1]);
    expect(rows[2]?.lane).toBe(1);
    expect(rows[3]?.joins).toEqual([1]);
  });

  it('draws continuous stems and rounded branch joins', () => {
    expect(memoryGraphRailPath(0, 0, 'outgoing')).toBe('M 6 12 V 46.5');
    expect(memoryGraphRailPath(1, 0, 'outgoing')).toContain('A 5 5');
    expect(memoryGraphRailPath(1, 0, 'incoming')).toContain('H 6');
  });
});
