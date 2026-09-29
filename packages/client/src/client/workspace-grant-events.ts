export const WORKSPACE_GRANTS_CHANGED = 'botharness/workspace-grants-changed';

const revisions = new Map<string, number>();
const listeners = new Map<string, Set<() => void>>();

export function workspaceGrantRevision(slug: string): number {
  return revisions.get(slug) ?? 0;
}

export function subscribeWorkspaceGrantChanges(slug: string, listener: () => void): () => void {
  let scoped = listeners.get(slug);
  if (scoped === undefined) {
    scoped = new Set();
    listeners.set(slug, scoped);
  }
  scoped.add(listener);
  return () => {
    scoped.delete(listener);
    if (scoped.size === 0) {
      listeners.delete(slug);
      revisions.delete(slug);
    }
  };
}

export function publishWorkspaceGrantChange(slug: string): void {
  const scoped = listeners.get(slug);
  if (scoped !== undefined) {
    revisions.set(slug, workspaceGrantRevision(slug) + 1);
    scoped.forEach((listener) => listener());
  }
  window.dispatchEvent(new CustomEvent(WORKSPACE_GRANTS_CHANGED, { detail: { slug } }));
}
