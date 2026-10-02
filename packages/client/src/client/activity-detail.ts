import { isPublicToolDetail } from '../../../core/src/state/tool-activity.js';
import type { PersonaBotToolActivity } from '../../../core/src/state/tool-activity.js';

export function parsePublicToolActivity(detail: unknown): PersonaBotToolActivity | undefined {
  if (typeof detail !== 'object' || detail === null) return undefined;
  const row = detail as Record<string, unknown>;
  const kind = ['read', 'edit', 'delete', 'move', 'search', 'execute', 'fetch', 'other'].find(
    (value) => value === row['toolKind'],
  );
  const effect = ['thinking-dots', 'searching', 'coding', 'executing', 'generic-working'].find(
    (value) => value === row['effect'],
  );
  if (
    (row['publicDetail'] !== undefined && !isPublicToolDetail(row['publicDetail'])) ||
    kind === undefined ||
    effect === undefined ||
    typeof row['startedAt'] !== 'number' ||
    !Number.isSafeInteger(row['startedAt']) ||
    row['startedAt'] < 0 ||
    typeof row['activeToolCount'] !== 'number' ||
    !Number.isSafeInteger(row['activeToolCount']) ||
    row['activeToolCount'] < 1 ||
    (row['toolName'] !== undefined &&
      (typeof row['toolName'] !== 'string' || !/^[A-Za-z0-9_.:/-]{1,80}$/.test(row['toolName'])))
  )
    return undefined;
  let sources: PersonaBotToolActivity['sources'];
  if (row['sources'] !== undefined) {
    if (!Array.isArray(row['sources']) || row['sources'].length < 1 || row['sources'].length > 3)
      return undefined;
    const roles = new Set<string>();
    sources = [];
    for (const source of row['sources']) {
      if (typeof source !== 'object' || source === null) return undefined;
      const role = (['orchestrator', 'assignment', 'subagent'] as const).find(
        (candidate) => candidate === source.role,
      );
      if (
        role === undefined ||
        roles.has(role) ||
        !Number.isSafeInteger(source.count) ||
        source.count < 1
      )
        return undefined;
      roles.add(role);
      sources = [...sources, { role, count: source.count }];
    }
    if (sources.reduce((total, source) => total + source.count, 0) > row['activeToolCount'])
      return undefined;
  }
  return {
    toolKind: kind as PersonaBotToolActivity['toolKind'],
    effect: effect as PersonaBotToolActivity['effect'],
    startedAt: row['startedAt'],
    activeToolCount: row['activeToolCount'],
    ...(row['toolName'] === undefined ? {} : { toolName: row['toolName'] as string }),
    ...(row['publicDetail'] === undefined ? {} : { publicDetail: row['publicDetail'] as string }),
    ...(sources === undefined ? {} : { sources }),
  };
}
