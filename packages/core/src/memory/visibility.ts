import type { MemoryDocument } from './front-matter.js';

export type MemoryScope = { kind: 'group' } | { kind: 'dm'; owner: string };

export const GROUP_SCOPE: MemoryScope = { kind: 'group' };

export function isVisibleInScope(document: MemoryDocument, scope: MemoryScope): boolean {
  if (document.visibility === 'shared') return true;
  return scope.kind === 'dm' && document.owner !== undefined && document.owner === scope.owner;
}
