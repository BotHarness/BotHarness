import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  type Dirent,
} from 'node:fs';
import { isAbsolute, join } from 'node:path';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { deriveAvatarAppearance } from './avatar-snapshot.js';
import {
  isPersonaBotAvatar,
  isPersonaBotRecord,
  isUsableAvatarAppearance,
  type CreatePersonaBotInput,
  type CreatePersonaBotResult,
  type PersonaBotPatch,
  type PersonaBotRecord,
  type RemovePersonaBotOptions,
  type UpdatePersonaBotResult,
} from './persona-bot.js';
import { readSharedPresentation } from './shared-presentation.js';
import { isValidSlug } from './slug.js';
import type { MemoryCloneResult } from '../memory/clone.js';
import { migrateLegacySoul, seedStandingFiles } from '../memory/soul.js';
import type { TelemetryCapture } from '../telemetry/service.js';
import type {
  AssignmentModelOption,
  ModelPreset,
  ModelRoute,
  PersonaBotModelPlan,
} from '../models/presets.js';

export interface MemoryRepositoryInitialization {
  ok: boolean;
  code?: 'git-not-found';
  message?: string;
}

export interface PersonaBotRegistryOptions {
  rootDir: string;
  database: OperationalDatabaseOwner;
  onImport?: (event: { phase: 'complete' | 'failed'; count?: number; durationMs: number }) => void;
  now?: () => Date;
  onDisplayNameChanged?: () => void;

  initializeMemory?: (memoryDir: string) => MemoryRepositoryInitialization;
  cloneMemory?: (destination: string, url: string) => Promise<MemoryCloneResult>;
  onPurge?: (slug: string, removeFiles: () => void) => void;
  capture?: TelemetryCapture;
  syncDescriptor?: (
    memoryDir: string,
    record: PersonaBotRecord,
    options: { onlyIfMissing: boolean },
  ) => void;
}

export interface PersonaBotRegistry {
  rootDir: string;
  create(input: CreatePersonaBotInput): CreatePersonaBotResult;
  createFromGit(
    input: Omit<CreatePersonaBotInput, 'memoryDir'> & { gitUrl: string },
  ): Promise<CreatePersonaBotResult>;
  get(slug: string): PersonaBotRecord | undefined;
  list(): PersonaBotRecord[];
  findByWorkspace(workspace: string): PersonaBotRecord | undefined;
  remove(slug: string, options?: RemovePersonaBotOptions): boolean;
  memoryDirFor(slug: string): string | undefined;
  update(slug: string, patch: PersonaBotPatch): UpdatePersonaBotResult;
  setAppearance(slug: string, recipe: unknown): UpdatePersonaBotResult;
  setPaused(slug: string, paused: boolean): UpdatePersonaBotResult;
  setComputerAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserAccess(slug: string, enabled: boolean): UpdatePersonaBotResult;
  setBrowserProfile(slug: string, profile: string): UpdatePersonaBotResult;
  applyModelPreset(slug: string, preset: ModelPreset): UpdatePersonaBotResult;
  migrateLegacyModel(
    slug: string,
    expectedModel: string,
    route: ModelRoute,
  ): UpdatePersonaBotResult;
  customizeModelPlan(
    slug: string,
    orchestrator: PersonaBotModelPlan['orchestrator'],
    expectedRevision: number,
  ): UpdatePersonaBotResult;
  setAssignmentModels(
    slug: string,
    assignmentDefault: ModelRoute,
    assignmentModels: AssignmentModelOption[],
    expectedRevision: number,
  ): UpdatePersonaBotResult;
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

  const port = attachOperationalModule(options.database, 'bot-registry');
  const capture = (event: string): void => {
    try {
      options.capture?.(event);
    } catch {
      return;
    }
  };
  const recordSnapshot = (record: PersonaBotRecord): PersonaBotRecord => {
    const result: PersonaBotRecord = {
      slug: record.slug,
      displayName: record.displayName,
      workspaces: [...record.workspaces],
      createdAt: record.createdAt,
    };
    for (const key of [
      'roles',
      'tag',
      'description',
      'avatar',
      'appearance',
      'model',
      'preset',
      'memoryDir',
      'paused',
      'computerAccess',
      'browserAccess',
      'browserProfile',
    ] as const) {
      if (record[key] !== undefined) Object.assign(result, { [key]: record[key] });
    }
    const route = (value: ModelRoute): ModelRoute => ({
      provider: value.provider,
      model: value.model,
      ...(value.reasoningEffort === undefined ? {} : { reasoningEffort: value.reasoningEffort }),
    });
    const plan = record.modelPlan;
    if (plan !== undefined)
      result.modelPlan = {
        revision: plan.revision,
        sourcePresetId: plan.sourcePresetId,
        sourcePresetName: plan.sourcePresetName,
        appliedAt: plan.appliedAt,
        orchestrator: route(plan.orchestrator),
        assignmentDefault: route(plan.assignmentDefault),
        ...(plan.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: plan.assignmentModels.map((option) => ({
                provider: option.provider,
                model: option.model,
                allowedEfforts: [...option.allowedEfforts],
                defaultEffort: option.defaultEffort,
              })),
            }),
      };
    return result;
  };
  const decode = (text: string, slug: string): PersonaBotRecord => {
    const parsed: unknown = JSON.parse(text);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'appearance' in parsed &&
      !isUsableAvatarAppearance(parsed.appearance, (parsed as { avatar?: unknown }).avatar)
    )
      delete (parsed as { appearance?: unknown }).appearance;
    if (!isPersonaBotRecord(parsed, slug)) throw new Error('Invalid PersonaBot Registry record');
    return recordSnapshot(parsed);
  };
  const read = (slug: string): PersonaBotRecord | undefined => {
    if (!isValidSlug(slug)) return undefined;
    return port.read((database) => {
      const row = database.prepare('SELECT body FROM persona_bots WHERE slug = ?').get(slug);
      return row === undefined ? undefined : decode(String(row['body']), slug);
    });
  };
  const write = (record: PersonaBotRecord): void => {
    port.transaction(
      (database) => {
        database
          .prepare(`INSERT INTO persona_bots (slug, body) VALUES (?, ?)
        ON CONFLICT (slug) DO UPDATE SET body = excluded.body`)
          .run(record.slug, JSON.stringify(recordSnapshot(record)));
      },
      ['bot-registry'],
    );
  };
  const erase = (slug: string): void => {
    port.transaction(
      (database) => {
        database.prepare('DELETE FROM persona_bots WHERE slug = ?').run(slug);
      },
      ['bot-registry'],
    );
  };
  const list = (): PersonaBotRecord[] =>
    port.read((database) =>
      database
        .prepare('SELECT slug, body FROM persona_bots')
        .all()
        .map((row) => decode(String(row['body']), String(row['slug'])))
        .sort((left, right) => left.slug.localeCompare(right.slug)),
    );
  if (
    options.database.mode === 'ready' &&
    !port.read((database) =>
      database.prepare('SELECT singleton FROM persona_bots_import WHERE singleton = 1').get(),
    )
  ) {
    const startedAt = performance.now();
    const report = (phase: 'complete' | 'failed', count?: number) => {
      try {
        options.onImport?.({
          phase,
          ...(count === undefined ? {} : { count }),
          durationMs: performance.now() - startedAt,
        });
      } catch {}
    };
    try {
      let entries: Dirent[];
      try {
        entries = readdirSync(rootDir, { withFileTypes: true });
      } catch (error) {
        if (!isMissing(error)) throw error;
        entries = [];
      }
      const records: PersonaBotRecord[] = [];
      for (const entry of entries.filter(
        (entry) => entry.isDirectory() && isValidSlug(entry.name),
      )) {
        let text: string;
        try {
          text = readFileSync(botFile(entry.name), 'utf8');
        } catch (error) {
          if (isMissing(error)) continue;
          throw error;
        }
        records.push(decode(text, entry.name));
      }
      port.transaction(
        (database) => {
          if (database.prepare('SELECT slug FROM persona_bots LIMIT 1').get())
            throw new Error('PersonaBot Registry target is populated without an import marker');
          const insert = database.prepare('INSERT INTO persona_bots (slug, body) VALUES (?, ?)');
          for (const record of records) insert.run(record.slug, JSON.stringify(record));
          database
            .prepare('INSERT INTO persona_bots_import (singleton, imported_at) VALUES (1, ?)')
            .run(now().toISOString());
        },
        ['bot-registry'],
      );
      report('complete', records.length);
    } catch {
      report('failed');
      throw new Error(
        'PersonaBot Registry import failed; repair retained legacy records before retry',
      );
    }
  }

  const memoryDirOf = (record: PersonaBotRecord): string =>
    record.memoryDir ?? defaultMemoryDir(record.slug);

  const applyOptionalText = (
    record: PersonaBotRecord,
    key: 'tag' | 'description' | 'avatar' | 'model' | 'preset',
    value: string | undefined,
  ): boolean => {
    if (value === undefined) return true;
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      delete record[key];
      return true;
    }
    if (key === 'avatar' && !isPersonaBotAvatar(trimmed)) return false;
    record[key] = trimmed;
    return true;
  };

  const normalizeRoles = (roles: readonly string[] | undefined): string[] => {
    if (roles === undefined) return [];
    return [...new Set(roles.map((role) => role.trim()).filter((role) => role.length > 0))];
  };

  const syncDescriptor = (record: PersonaBotRecord, onlyIfMissing = false): void => {
    try {
      options.syncDescriptor?.(memoryDirOf(record), record, { onlyIfMissing });
    } catch {}
  };

  const create = (input: CreatePersonaBotInput, sync: boolean): CreatePersonaBotResult => {
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
    if (avatar !== undefined && avatar.length > 0 && !isPersonaBotAvatar(avatar)) {
      return { ok: false, reason: 'invalid-input' };
    }
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
    const targetMemoryDir = memoryDirOf(record);
    const newBotDirectory = !existsSync(botDir(record.slug));
    mkdirSync(targetMemoryDir, { recursive: true });
    const seeded = seedStandingFiles(targetMemoryDir, {
      ...(input.persona === undefined ? {} : { soul: input.persona }),
      coreMemoryTemplate: sync,
    });
    const initialized = options.initializeMemory?.(targetMemoryDir) ?? { ok: true };
    if (!initialized.ok) {
      for (const file of seeded) rmSync(join(targetMemoryDir, file), { force: true });
      if (newBotDirectory && !memoryDir) {
        rmSync(botDir(record.slug), { recursive: true, force: true });
      }
      return {
        ok: false,
        reason: initialized.code === 'git-not-found' ? 'git-not-found' : 'memory-unavailable',
        ...(initialized.message === undefined ? {} : { detail: initialized.message }),
      };
    }
    write(record);
    if (sync) syncDescriptor(record);
    return { ok: true, record };
  };

  return {
    rootDir,
    create(input) {
      const result = create(input, true);
      if (result.ok) capture('bot_created');
      return result;
    },
    async createFromGit(input) {
      if (!isValidSlug(input.slug)) return { ok: false, reason: 'invalid-slug' };
      if (read(input.slug) !== undefined || existsSync(botDir(input.slug))) {
        return { ok: false, reason: 'duplicate' };
      }
      if (options.cloneMemory === undefined) return { ok: false, reason: 'memory-unavailable' };

      let staging: string | undefined;
      let ownsBotDir = false;
      let created = false;
      try {
        mkdirSync(rootDir, { recursive: true });
        staging = mkdtempSync(join(rootDir, '.git-import-'));
        const cloned = await options.cloneMemory(staging, input.gitUrl);
        if (!cloned.ok) return { ok: false, reason: cloned.code };
        if (read(input.slug) !== undefined || existsSync(botDir(input.slug)))
          return { ok: false, reason: 'duplicate' };

        mkdirSync(botDir(input.slug));
        ownsBotDir = true;
        renameSync(staging, defaultMemoryDir(input.slug));
        staging = undefined;
        try {
          migrateLegacySoul(defaultMemoryDir(input.slug));
        } catch {}
        const { gitUrl, ...recordInput } = input;
        void gitUrl;
        const result = create(recordInput, false);
        created = result.ok;
        if (!result.ok) return result;
        capture('bot_created');
        const presentation = readSharedPresentation(defaultMemoryDir(input.slug));
        if (presentation === undefined) {
          syncDescriptor(result.record, true);
          return result;
        }
        const presented = { ...result.record, ...presentation };
        try {
          write(presented);
        } catch {
          syncDescriptor(result.record, true);
          return result;
        }
        syncDescriptor(presented, true);
        return { ok: true, record: presented };
      } catch {
        return { ok: false, reason: 'memory-unavailable' };
      } finally {
        if (staging !== undefined) rmSync(staging, { recursive: true, force: true });
        if (ownsBotDir && !created && options.database.mode === 'ready') {
          try {
            if (read(input.slug) === undefined)
              rmSync(botDir(input.slug), { recursive: true, force: true });
          } catch {}
        }
      }
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
      if (!isValidSlug(slug)) return false;
      const record = read(slug);
      const exists = record !== undefined || existsSync(botDir(slug));
      if (removeOptions?.purge === true) {
        const removeFiles = () => {
          if (exists) rmSync(botDir(slug), { recursive: true, force: true });
        };
        if (options.onPurge === undefined) removeFiles();
        else options.onPurge(slug, removeFiles);
        erase(slug);
        if (record !== undefined) capture('bot_deleted');
        return exists;
      }
      if (!exists) return false;
      erase(slug);
      if (record !== undefined) capture('bot_deleted');
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
      const previousName = record.displayName;
      const previousAvatar = record.avatar;
      const previousProfile = JSON.stringify([record.roles, record.tag, record.avatar]);
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
      if (!applyOptionalText(record, 'avatar', patch.avatar)) {
        return { ok: false, reason: 'invalid-input' };
      }
      if (patch.avatar !== undefined) delete record.appearance;
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
      if (record.displayName !== previousName) options.onDisplayNameChanged?.();
      if (patch.avatar !== undefined && record.avatar !== previousAvatar) capture('avatar_edited');
      if (
        record.displayName !== previousName ||
        JSON.stringify([record.roles, record.tag, record.avatar]) !== previousProfile
      )
        syncDescriptor(record);
      return { ok: true, record };
    },
    setAppearance(slug, recipe) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const derived = deriveAvatarAppearance(recipe);
      if (derived === undefined) return { ok: false, reason: 'invalid-input' };
      const updated = { ...record, ...derived };
      write(updated);
      syncDescriptor(updated);
      capture('avatar_edited');
      return { ok: true, record: updated };
    },
    setPaused(slug, paused) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const archiving = paused && record.paused !== true;
      if (paused) record.paused = true;
      else delete record.paused;
      write(record);
      if (archiving) capture('bot_archived');
      return { ok: true, record };
    },
    setComputerAccess(slug, enabled) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (enabled) record.computerAccess = true;
      else delete record.computerAccess;
      write(record);
      return { ok: true, record };
    },
    setBrowserAccess(slug, enabled) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (enabled) record.browserAccess = true;
      else delete record.browserAccess;
      write(record);
      return { ok: true, record };
    },
    setBrowserProfile(slug, profile) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const trimmed = profile.trim();
      if (trimmed === '') delete record.browserProfile;
      else record.browserProfile = trimmed;
      write(record);
      return { ok: true, record };
    },
    applyModelPreset(slug, preset) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      const plan: PersonaBotModelPlan = {
        revision: (record.modelPlan?.revision ?? 0) + 1,
        sourcePresetId: preset.id,
        sourcePresetName: preset.name,
        orchestrator: { ...preset.orchestrator },
        assignmentDefault: { ...preset.assignmentDefault },
        ...(preset.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: preset.assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
        appliedAt: now().toISOString(),
      };
      record.modelPlan = plan;
      delete record.model;
      write(record);
      return { ok: true, record };
    },
    migrateLegacyModel(slug, expectedModel, route) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan !== undefined) return { ok: true, record };
      if (record.model !== expectedModel) return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...route },
        assignmentDefault: { ...route },
        appliedAt: now().toISOString(),
      };
      delete record.model;
      write(record);
      return { ok: true, record };
    },
    customizeModelPlan(slug, orchestrator, expectedRevision) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan === undefined) return { ok: false, reason: 'invalid-input' };
      if (record.modelPlan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        ...record.modelPlan,
        revision: record.modelPlan.revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: { ...orchestrator },
        appliedAt: now().toISOString(),
      };
      write(record);
      return { ok: true, record };
    },
    setAssignmentModels(slug, assignmentDefault, assignmentModels, expectedRevision) {
      const record = read(slug);
      if (record === undefined) return { ok: false, reason: 'not-found' };
      if (record.modelPlan === undefined || record.modelPlan.revision !== expectedRevision)
        return { ok: false, reason: 'invalid-input' };
      record.modelPlan = {
        ...record.modelPlan,
        revision: record.modelPlan.revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        assignmentDefault: { ...assignmentDefault },
        assignmentModels: assignmentModels.map((option) => ({
          ...option,
          allowedEfforts: [...option.allowedEfforts],
        })),
        appliedAt: now().toISOString(),
      };
      write(record);
      return { ok: true, record };
    },
  };
}
