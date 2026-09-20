import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';
import {
  isPersonaBotRecord,
  type CreatePersonaBotInput,
  type CreatePersonaBotResult,
  type PersonaBotPatch,
  type PersonaBotRecord,
  type RemovePersonaBotOptions,
  type UpdatePersonaBotResult,
} from './persona-bot.js';
import { isValidSlug } from './slug.js';

export interface PersonaBotRegistryOptions {
  rootDir: string;
  now?: () => Date;
}

export interface PersonaBotRegistry {
  rootDir: string;
  create(input: CreatePersonaBotInput): CreatePersonaBotResult;
  get(slug: string): PersonaBotRecord | undefined;
  list(): PersonaBotRecord[];
  findByWorkspace(workspace: string): PersonaBotRecord | undefined;
  remove(slug: string, options?: RemovePersonaBotOptions): boolean;
  memoryDirFor(slug: string): string | undefined;
  update(slug: string, patch: PersonaBotPatch): UpdatePersonaBotResult;
  setPaused(slug: string, paused: boolean): UpdatePersonaBotResult;
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT';
}

function normalizeWorkspacePath(path: string): string {
  let normalized = path.trim();
  while (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }
  try {
    return realpathSync.native(normalized);
  } catch {
    return normalized;
  }
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
    atomicWriteFile(botFile(record.slug), `${JSON.stringify(record, null, 2)}\n`);
  };

  const list = (): PersonaBotRecord[] => {
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
  };

  const memoryDirOf = (record: PersonaBotRecord): string =>
    record.memoryDir ?? defaultMemoryDir(record.slug);

  const ensurePersonaFile = (memoryDir: string, body: string): void => {
    mkdirSync(memoryDir, { recursive: true });
    try {
      writeFileSync(join(memoryDir, 'PERSONA.md'), body, { encoding: 'utf8', flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  };

  const applyOptionalText = (
    record: PersonaBotRecord,
    key: 'tag' | 'description' | 'avatar' | 'model' | 'preset',
    value: string | undefined,
  ): void => {
    if (value === undefined) return;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      delete record[key];
      return;
    }
    record[key] = trimmed;
  };

  const normalizeRoles = (roles: readonly string[] | undefined): string[] => {
    if (roles === undefined) return [];
    return [...new Set(roles.map((role) => role.trim()).filter((role) => role.length > 0))];
  };

  return {
    rootDir,
    create(input) {
      if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
      if (read(input.slug) !== undefined) return { ok: false, reason: 'duplicate' };

      const memoryDir = input.memoryDir?.trim();
      if (memoryDir !== undefined && memoryDir.length > 0 && !isAbsolute(memoryDir)) {
        return { ok: false, reason: 'invalid-memory-dir' };
      }

      const displayName = input.displayName.trim();
      const roles = normalizeRoles(input.roles);
      const description = input.description?.trim();
      const avatar = input.avatar?.trim();
      const model = input.model?.trim();
      const preset = input.preset?.trim();
      const record: PersonaBotRecord = {
        slug: input.slug,
        displayName: displayName.length > 0 ? displayName : input.slug,
        workspaces: input.workspaces ?? [],
        createdAt: now().toISOString(),
        ...(roles.length > 0 ? { roles } : {}),
        ...(description ? { description } : {}),
        ...(avatar ? { avatar } : {}),
        ...(model ? { model } : {}),
        ...(preset ? { preset } : {}),
        ...(memoryDir ? { memoryDir } : {}),
      };
      write(record);
      const persona = input.persona;
      ensurePersonaFile(
        memoryDirOf(record),
        persona !== undefined && persona.trim().length > 0 ? persona : `# ${record.displayName}\n`,
      );
      return { ok: true, record };
    },
    get(slug) {
      return read(slug);
    },
    list,
    findByWorkspace(workspace) {
      const target = normalizeWorkspacePath(workspace);
      if (target.length === 0) return undefined;
      return list().find((record) =>
        record.workspaces.some((candidate) => normalizeWorkspacePath(candidate) === target),
      );
    },
    remove(slug, removeOptions) {
      if (!isValidSlug(slug) || !existsSync(botDir(slug))) return false;
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
      return memoryDirOf(record);
    },
    update(slug, patch) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (patch.displayName !== undefined) {
        const displayName = patch.displayName.trim();
        if (displayName.length === 0) return { ok: false, reason: 'invalid-input' };
        record.displayName = displayName;
      }
      if (patch.roles !== undefined) {
        if (!Array.isArray(patch.roles) || !patch.roles.every((role) => typeof role === 'string')) {
          return { ok: false, reason: 'invalid-input' };
        }
        const roles = normalizeRoles(patch.roles);
        if (roles.length === 0) delete record.roles;
        else record.roles = roles;
        delete record.tag;
      }
      applyOptionalText(record, 'description', patch.description);
      applyOptionalText(record, 'avatar', patch.avatar);
      applyOptionalText(record, 'model', patch.model);
      applyOptionalText(record, 'preset', patch.preset);
      if (patch.workspaces !== undefined) {
        if (
          !Array.isArray(patch.workspaces) ||
          !patch.workspaces.every((workspace) => typeof workspace === 'string')
        ) {
          return { ok: false, reason: 'invalid-input' };
        }
        record.workspaces = [...patch.workspaces];
      }
      write(record);
      return { ok: true, record };
    },
    setPaused(slug, paused) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (paused) record.paused = true;
      else delete record.paused;
      write(record);
      return { ok: true, record };
    },
  };
}
