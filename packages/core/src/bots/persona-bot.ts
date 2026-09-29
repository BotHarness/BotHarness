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
  /** Per-PersonaBot Computer tool opt-in; absent means off (ADR-0080). */
  computerAccess?: boolean;
  browserAccess?: boolean;
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
        | 'invalid-input'
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
  computerAccess?: boolean;
  browserAccess?: boolean;
}

export type UpdatePersonaBotResult =
  | { ok: true; record: PersonaBotRecord }
  | { ok: false; reason: 'not-found' | 'invalid-input' };

/** Decoded custom-avatar budget: 512×512 WebP with room for detailed images (ADR-0086). */
export const MAX_PERSONA_BOT_AVATAR_BYTES = 131_072;
const MAX_PERSONA_BOT_AVATAR_CHARS = 175_000;

/**
 * A stored custom avatar is a bounded image data URL; remote URLs and seed-like
 * strings are rejected on write. Blobatar media needs no stored value at all.
 */
export function isPersonaBotAvatar(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_PERSONA_BOT_AVATAR_CHARS) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/u.exec(value);
  if (match === null) return false;
  const bytes = Buffer.from(match[2]!, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_PERSONA_BOT_AVATAR_BYTES) return false;
  return match[1] === 'png'
    ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    : match[1] === 'jpeg'
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';
}

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
  if (record['computerAccess'] !== undefined && typeof record['computerAccess'] !== 'boolean')
    return false;
  if (record['browserAccess'] !== undefined && typeof record['browserAccess'] !== 'boolean')
    return false;
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
