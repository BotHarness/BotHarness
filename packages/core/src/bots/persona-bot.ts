export interface PersonaBotRecord {
  slug: string;
  displayName: string;
  avatar?: string;
  model?: string;
  preset?: string;
  memoryDir?: string;
  workspaces: string[];
  createdAt: string;
}

export interface CreatePersonaBotInput {
  slug: string;
  displayName: string;
  avatar?: string;
  model?: string;
  preset?: string;
  memoryDir?: string;
  workspaces?: string[];
}

export type CreatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord }
  | { ok: false; reason: 'invalid-slug' | 'duplicate' | 'invalid-memory-dir' };

export interface RemovePersonaBotOptions {
  purge?: boolean;
}

export function isPersonaBotRecord(value: unknown, slug: string): value is PersonaBotRecord {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record['slug'] !== slug) return false;
  if (typeof record['displayName'] !== 'string') return false;
  if (typeof record['createdAt'] !== 'string') return false;
  if (!Array.isArray(record['workspaces'])) return false;
  if (!record['workspaces'].every((entry) => typeof entry === 'string')) return false;
  for (const key of ['avatar', 'model', 'preset', 'memoryDir'] as const) {
    const optional = record[key];
    if (optional !== undefined && typeof optional !== 'string') return false;
  }
  return true;
}
