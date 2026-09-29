import type { MemoryWorkingChange } from './bridge.js';
import type { MemoryTerminology } from './channel-sidebar-prefs.js';

export type MemoryChangeGroup = 'new' | 'updated' | 'unstaged' | 'staged' | 'untracked';

export function currentMemoryChanges(
  changes: readonly MemoryWorkingChange[],
): MemoryWorkingChange[] {
  const byPath = new Map<string, MemoryWorkingChange[]>();
  for (const change of changes) {
    byPath.set(change.path, [...(byPath.get(change.path) ?? []), change]);
  }
  return [...byPath.entries()]
    .filter(
      ([, phases]) =>
        !(
          phases.some((phase) => phase.kind === 'staged' && phase.status === 'A') &&
          phases.some((phase) => phase.kind === 'unstaged' && phase.status === 'D')
        ),
    )
    .map(([path, phases]) => ({
      path,
      kind: 'current' as const,
      status: phases.some((phase) => phase.kind === 'untracked' || phase.status === 'A')
        ? 'A'
        : phases.some((phase) => phase.status === 'D')
          ? 'D'
          : phases.some((phase) => phase.status === 'R')
            ? 'R'
            : 'M',
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function groupedMemoryChanges(
  changes: readonly MemoryWorkingChange[],
  terminology: MemoryTerminology,
): { id: MemoryChangeGroup; changes: MemoryWorkingChange[] }[] {
  if (terminology === 'memory') {
    const current = currentMemoryChanges(changes);
    return [
      { id: 'new', changes: current.filter((change) => change.status === 'A') },
      { id: 'updated', changes: current.filter((change) => change.status !== 'A') },
    ];
  }
  return (['unstaged', 'staged', 'untracked'] as const).map((id) => ({
    id,
    changes: changes.filter((change) => change.kind === id),
  }));
}

export function memoryChangeBadge(
  change: MemoryWorkingChange,
  terminology: MemoryTerminology,
): string {
  if (terminology === 'git') return change.kind === 'untracked' ? 'U' : change.status;
  if (change.status === 'A') return 'new';
  if (change.status === 'D') return 'deleted';
  return 'updated';
}
