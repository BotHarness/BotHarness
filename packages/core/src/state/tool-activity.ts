import type { ToolCallKind, ToolCallView } from '@deepseek-ai/dsh-tools';

export type ActivityEffect =
  | 'thinking-dots'
  | 'searching'
  | 'coding'
  | 'executing'
  | 'generic-working';

export interface PersonaBotToolActivity {
  effect: ActivityEffect;
  toolKind: ToolCallKind;
  toolName?: string;
  startedAt: number;
  activeToolCount: number;
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
  return {
    effect: activityEffectForToolKind(toolKind),
    toolKind,
    ...(name === undefined ? {} : { toolName: name }),
    startedAt: Math.min(...items.map((item) => item.startedAt)),
    activeToolCount: items.reduce((count, item) => count + item.activeToolCount, 0),
  };
}
