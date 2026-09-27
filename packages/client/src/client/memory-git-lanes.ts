import type { MemoryGitCommit } from './bridge.js';

export interface MemoryGitLaneRow {
  lane: number;
  fromAbove: boolean;
  through: number[];
  joins: number[];
  toParents: number[];
  width: number;
}

/** Lay out the reachable DAG in the order returned by git log --topo-order. */
export function layoutMemoryGitLanes(commits: readonly MemoryGitCommit[]): MemoryGitLaneRow[] {
  const active: (string | null)[] = [];
  const rows: MemoryGitLaneRow[] = [];
  const slot = (): number => {
    const free = active.indexOf(null);
    return free >= 0 ? free : active.length;
  };
  for (const commit of commits) {
    let lane = active.indexOf(commit.sha);
    const fromAbove = lane >= 0;
    if (lane < 0) lane = slot();
    const joins = active.flatMap((sha, index) =>
      sha === commit.sha && index !== lane ? [index] : [],
    );
    const through = active.flatMap((sha, index) =>
      sha !== null && sha !== commit.sha ? [index] : [],
    );
    for (const index of joins) active[index] = null;
    active[lane] = null;
    const toParents: number[] = [];
    for (const [index, parent] of commit.parents.entries()) {
      // Keep the first-parent line in this commit's lane. A sibling line
      // pointing at that parent will join at the parent node below.
      let parentLane = index === 0 ? lane : active.indexOf(parent);
      if (parentLane < 0) parentLane = slot();
      active[parentLane] = parent;
      toParents.push(parentLane);
    }
    rows.push({
      lane,
      fromAbove,
      through,
      joins,
      toParents,
      width: Math.max(lane, ...through, ...joins, ...toParents, 0) + 1,
    });
  }
  return rows;
}

/** Matches the compact rail proportions used by the DSH workbench graph. */
export const MEMORY_GRAPH_LANE_WIDTH = 12;
export const MEMORY_GRAPH_ROW_HEIGHT = 46;
export const MEMORY_GRAPH_NODE_Y = 12;

export function memoryGraphLaneX(lane: number): number {
  return lane * MEMORY_GRAPH_LANE_WIDTH + MEMORY_GRAPH_LANE_WIDTH / 2;
}

/** Rounded branch/join elbows keep adjacent rows joined without a diagonal slash. */
export function memoryGraphRailPath(
  fromLane: number,
  toLane: number,
  direction: 'incoming' | 'outgoing',
): string {
  const from = memoryGraphLaneX(fromLane);
  const to = memoryGraphLaneX(toLane);
  const radius = Math.min(5, Math.abs(to - from) / 2);
  if (direction === 'outgoing') {
    if (from === to)
      return 'M ' + from + ' ' + MEMORY_GRAPH_NODE_Y + ' V ' + (MEMORY_GRAPH_ROW_HEIGHT + 0.5);
    const sign = to > from ? 1 : -1;
    const sweep = to > from ? 1 : 0;
    return (
      'M ' +
      from +
      ' ' +
      MEMORY_GRAPH_NODE_Y +
      ' H ' +
      (to - sign * radius) +
      ' A ' +
      radius +
      ' ' +
      radius +
      ' 0 0 ' +
      sweep +
      ' ' +
      to +
      ' ' +
      (MEMORY_GRAPH_NODE_Y + radius) +
      ' V ' +
      (MEMORY_GRAPH_ROW_HEIGHT + 0.5)
    );
  }
  if (from === to) return 'M ' + from + ' -0.5 V ' + MEMORY_GRAPH_NODE_Y;
  const sign = to > from ? 1 : -1;
  const sweep = to > from ? 0 : 1;
  return (
    'M ' +
    from +
    ' -0.5 V ' +
    (MEMORY_GRAPH_NODE_Y - radius) +
    ' A ' +
    radius +
    ' ' +
    radius +
    ' 0 0 ' +
    sweep +
    ' ' +
    (from + sign * radius) +
    ' ' +
    MEMORY_GRAPH_NODE_Y +
    ' H ' +
    to
  );
}
