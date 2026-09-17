import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_SLUG_LENGTH = 64;

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

export interface PersonaBotRegistryOptions {
  rootDir: string;
  now?: () => Date;
}

export interface PersonaBotRegistry {
  rootDir: string;
  create(input: CreatePersonaBotInput): CreatePersonaBotResult;
  get(slug: string): PersonaBotRecord | undefined;
  list(): PersonaBotRecord[];
  remove(slug: string, options?: RemovePersonaBotOptions): boolean;
  memoryDirFor(slug: string): string | undefined;
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= MAX_SLUG_LENGTH && SLUG_PATTERN.test(slug);
}

function isPersonaBotRecord(value: unknown, slug: string): value is PersonaBotRecord {
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

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

export function createPersonaBotRegistry(options: PersonaBotRegistryOptions): PersonaBotRegistry {
  const rootDir = options.rootDir;
  const now = options.now ?? (() => new Date());
  const botDir = (slug: string): string => join(rootDir, slug);
  const botFile = (slug: string): string => join(botDir(slug), 'bot.json');
  const defaultMemoryDir = (slug: string): string => join(botDir(slug), 'memory');

  const read = (slug: string): PersonaBotRecord | undefined => {
    if (!isValidSlug(slug)) return undefined;
    let text: string;
    try {
      text = readFileSync(botFile(slug), 'utf8');
    } catch (error) {
      if (isMissing(error)) return undefined;
      throw error;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return undefined;
    }
    return isPersonaBotRecord(parsed, slug) ? parsed : undefined;
  };

  const write = (record: PersonaBotRecord): void => {
    const dir = botDir(record.slug);
    mkdirSync(dir, { recursive: true });
    const target = botFile(record.slug);
    const temporary = `${target}.${randomUUID()}.tmp`;
    writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
    renameSync(temporary, target);
  };

  return {
    rootDir,
    create(input) {
      if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
      if (existsSync(botDir(input.slug)) || read(input.slug) !== undefined) {
        return { ok: false, reason: 'duplicate' };
      }

      const memoryDir = input.memoryDir?.trim();
      if (memoryDir !== undefined && memoryDir.length > 0 && !isAbsolute(memoryDir)) {
        return { ok: false, reason: 'invalid-memory-dir' };
      }

      const displayName = input.displayName.trim();
      const avatar = input.avatar?.trim();
      const model = input.model?.trim();
      const preset = input.preset?.trim();
      const record: PersonaBotRecord = {
        slug: input.slug,
        displayName: displayName.length > 0 ? displayName : input.slug,
        workspaces: input.workspaces ?? [],
        createdAt: now().toISOString(),
        ...(avatar ? { avatar } : {}),
        ...(model ? { model } : {}),
        ...(preset ? { preset } : {}),
        ...(memoryDir ? { memoryDir } : {}),
      };
      write(record);
      mkdirSync(memoryDir && memoryDir.length > 0 ? memoryDir : defaultMemoryDir(input.slug), {
        recursive: true,
      });
      return { ok: true, record };
    },
    get(slug) {
      return read(slug);
    },
    list() {
      let entries: Dirent[];
      try {
        entries = readdirSync(rootDir, { withFileTypes: true });
      } catch (error) {
        if (isMissing(error)) return [];
        throw error;
      }
      return entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => read(entry.name))
        .filter((record): record is PersonaBotRecord => record !== undefined)
        .sort((left, right) => left.slug.localeCompare(right.slug));
    },
    remove(slug, removeOptions) {
      if (read(slug) === undefined) return false;
      if (removeOptions?.purge === true) {
        rmSync(botDir(slug), { recursive: true, force: true });
        return true;
      }
      rmSync(botFile(slug), { force: true });
      return true;
    },
    memoryDirFor(slug) {
      const record = read(slug);
      if (record === undefined) return undefined;
      return record.memoryDir ?? defaultMemoryDir(slug);
    },
  };
}
