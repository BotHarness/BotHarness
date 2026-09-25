export interface PersonaBotRecord {
  slug: string;
  displayName: string;
  roles?: string[];
  /** Legacy v1.6 field; read for migration but never written by new code. */
  tag?: string;
  description?: string;
  avatar?: string;
  model?: string;
  preset?: string;
  memoryDir?: string;
  workspaces: string[];
  createdAt: string;
  paused?: boolean;
}

export interface CreatePersonaBotInput {
  slug: string;
  displayName: string;
  persona?: string;
  roles?: string[];
  description?: string;
  avatar?: string;
  model?: string;
  preset?: string;
  memoryDir?: string;
  workspaces?: string[];
}

export type CreatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord }
  | {
      ok: false;
      reason:
        | 'invalid-slug'
        | 'duplicate'
        | 'invalid-memory-dir'
        | 'git-not-found'
        | 'invalid-git-url'
        | 'git-clone-failed'
        | 'git-clone-timeout'
        | 'memory-unavailable';
      detail?: string;
    };

export interface PersonaBotPatch {
  displayName?: string;
  roles?: string[];
  description?: string;
  avatar?: string;
  model?: string;
  preset?: string;
  workspaces?: string[];
}

export type UpdatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord }
  | { ok: false; reason: 'not-found' | 'invalid-input' };

export interface RemovePersonaBotOptions {
  purge?: boolean;
}

export function isPersonaBotRecord(value: unknown, slug: string): value is PersonaBotRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['slug'] !== slug) return false;
  if (typeof record['displayName'] !== 'string') return false;
  if (typeof record['createdAt'] !== 'string') return false;
  if (record['paused'] !== undefined && typeof record['paused'] !== 'boolean') return false;
  if (!Array.isArray(record['workspaces'])) return false;
  if (!record['workspaces'].every((entry) => typeof entry === 'string')) return false;
  if (record['roles'] !== undefined) {
    if (!Array.isArray(record['roles'])) return false;
    if (!record['roles'].every((entry) => typeof entry === 'string')) return false;
  }
  for (const key of ['tag', 'description', 'avatar', 'model', 'preset', 'memoryDir'] as const) {
    const optional = record[key];
    if (optional !== undefined && typeof optional !== 'string') return false;
  }
  return true;
}
