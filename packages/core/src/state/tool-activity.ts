import type { ToolCallKind, ToolCallView } from '@deepseek-ai/dsh-tools';

export type ActivityEffect =
  | 'thinking-dots'
  | 'searching'
  | 'coding'
  | 'executing'
  | 'generic-working';

export type ActivitySourceRole = 'orchestrator' | 'assignment' | 'subagent';

export interface ActivitySourceCount {
  role: ActivitySourceRole;
  count: number;
}

export interface PersonaBotToolActivity {
  effect: ActivityEffect;
  toolKind: ToolCallKind;
  toolName?: string;
  startedAt: number;
  activeToolCount: number;
  sources?: readonly ActivitySourceCount[];
}

const EFFECTS = {
  read: 'coding',
  edit: 'coding',
  delete: 'coding',
  move: 'coding',
  search: 'searching',
  fetch: 'searching',
  execute: 'executing',
  other: 'generic-working',
} satisfies Record<ToolCallKind, ActivityEffect>;

export function activityEffectForToolKind(kind: unknown): ActivityEffect {
  return typeof kind === 'string' && Object.hasOwn(EFFECTS, kind)
    ? EFFECTS[kind as ToolCallKind]
    : 'generic-working';
}

export function toolKindForView(view: ToolCallView | undefined): ToolCallKind {
  if (view?.card === 'terminal') return 'execute';
  if (view?.card === 'diff') return 'edit';
  const kind = view?.card === 'generic' ? view.kind : undefined;
  return typeof kind === 'string' && Object.hasOwn(EFFECTS, kind) ? kind : 'other';
}

export function aggregateToolActivity(
  items: readonly PersonaBotToolActivity[],
): PersonaBotToolActivity | undefined {
  if (items.length === 0) return undefined;
  const first = items[0]!;
  const toolKind = items.every((item) => item.toolKind === first.toolKind)
    ? first.toolKind
    : 'other';
  const name = items.every((item) => item.toolName === first.toolName) ? first.toolName : undefined;
  const counts = new Map<ActivitySourceRole, number>();
  const completeSources = items.every((item) => item.sources !== undefined);
  if (completeSources)
    for (const item of items)
      for (const source of item.sources ?? [])
        counts.set(source.role, (counts.get(source.role) ?? 0) + source.count);
  const sources = (['orchestrator', 'assignment', 'subagent'] as const)
    .filter((role) => counts.has(role))
    .map((role) => ({ role, count: counts.get(role)! }));
  return {
    effect: activityEffectForToolKind(toolKind),
    toolKind,
    ...(name === undefined ? {} : { toolName: name }),
    startedAt: Math.min(...items.map((item) => item.startedAt)),
    activeToolCount: items.reduce((count, item) => count + item.activeToolCount, 0),
    ...(completeSources ? { sources } : {}),
  };
}
