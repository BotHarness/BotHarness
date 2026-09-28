import { describe, expect, it } from 'vitest';
import { memoryFileTree } from '../src/client/memory-file-tree-model.js';
import {
  groupedMemoryChanges,
  memoryChangeBadge,
} from '../src/client/memory-working-presentation.js';

describe('Memory navigation', () => {
  it('builds a sorted folder tree from checked-out file paths', () => {
    const tree = memoryFileTree(['note.md', 'topics/plan.md', 'topics/2026/day.md', 'a.md']);
    expect(tree.map((node) => node.name)).toEqual(['topics', 'a.md', 'note.md']);
    expect(tree[0]?.children.map((node) => node.name)).toEqual(['2026', 'plan.md']);
    expect(tree[0]?.children[0]?.children[0]?.path).toBe('topics/2026/day.md');
  });

  it('groups each current file once in memory mode and exposes Git phases when selected', () => {
    const changes = [
      { path: 'existing.md', kind: 'staged' as const, status: 'M' },
      { path: 'existing.md', kind: 'unstaged' as const, status: 'M' },
      { path: 'new.md', kind: 'untracked' as const, status: '?' },
      { path: 'removed.md', kind: 'staged' as const, status: 'D' },
    ];
    const memory = groupedMemoryChanges(changes, 'memory');
    expect(memory.map((group) => [group.id, group.changes.map((change) => change.path)])).toEqual([
      ['new', ['new.md']],
      ['updated', ['existing.md', 'removed.md']],
    ]);
    expect(memoryChangeBadge(memory[0]!.changes[0]!, 'memory')).toBe('new');
    expect(memoryChangeBadge(memory[1]!.changes[1]!, 'memory')).toBe('deleted');
    const git = groupedMemoryChanges(changes, 'git');
    expect(git.map((group) => [group.id, group.changes.length])).toEqual([
      ['unstaged', 1],
      ['staged', 2],
      ['untracked', 1],
    ]);
    expect(memoryChangeBadge(git[2]!.changes[0]!, 'git')).toBe('U');
  });
});
