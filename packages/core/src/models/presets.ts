import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';

export interface ModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface AssignmentModelOption {
  provider: string;
  model: string;
  allowedEfforts: string[];
  defaultEffort: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
  createdAt: string;
}

export interface PersonaBotModelPlan {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  assignmentModels?: AssignmentModelOption[];
  appliedAt: string;
}

export interface ModelPresetStore {
  list(): ModelPreset[];
  get(id: string): ModelPreset | undefined;
  create(input: {
    name: string;
    orchestrator: ModelRoute;
    assignmentDefault: ModelRoute;
    assignmentModels?: AssignmentModelOption[];
  }): ModelPreset;
  update(
    id: string,
    input: {
      expectedRevision: number;
      name: string;
      orchestrator: ModelRoute;
      assignmentDefault: ModelRoute;
      assignmentModels?: AssignmentModelOption[];
    },
  ): ModelPreset | undefined;
}

export function isModelRoute(value: unknown): value is ModelRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route['provider'] === 'string' &&
    route['provider'].trim().length > 0 &&
    typeof route['model'] === 'string' &&
    route['model'].trim().length > 0 &&
    (route['reasoningEffort'] === undefined ||
      (typeof route['reasoningEffort'] === 'string' && route['reasoningEffort'].trim().length > 0))
  );
}

export function isAssignmentModelChoice(value: unknown): value is ModelRoute {
  if (typeof value !== 'object' || value === null) return false;
  const route = value as Record<string, unknown>;
  return (
    typeof route['provider'] === 'string' &&
    route['provider'].trim().length > 0 &&
    typeof route['model'] === 'string' &&
    route['model'].trim().length > 0 &&
    (route['reasoningEffort'] === undefined || typeof route['reasoningEffort'] === 'string')
  );
}

export function isAssignmentModelOption(value: unknown): value is AssignmentModelOption {
  if (typeof value !== 'object' || value === null) return false;
  const option = value as Record<string, unknown>;
  const efforts = option['allowedEfforts'];
  return (
    typeof option['provider'] === 'string' &&
    option['provider'].trim().length > 0 &&
    typeof option['model'] === 'string' &&
    option['model'].trim().length > 0 &&
    Array.isArray(efforts) &&
    efforts.length > 0 &&
    efforts.length <= 16 &&
    efforts.every((effort) => typeof effort === 'string') &&
    new Set(efforts).size === efforts.length &&
    typeof option['defaultEffort'] === 'string' &&
    efforts.includes(option['defaultEffort'])
  );
}

export function assignmentModelsOf(
  plan: Pick<PersonaBotModelPlan, 'assignmentDefault' | 'assignmentModels'>,
): AssignmentModelOption[] {
  return (
    plan.assignmentModels ?? [
      {
        provider: plan.assignmentDefault.provider,
        model: plan.assignmentDefault.model,
        allowedEfforts: [plan.assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: plan.assignmentDefault.reasoningEffort ?? '',
      },
    ]
  );
}

export function validateAssignmentModels(
  assignmentDefault: ModelRoute,
  assignmentModels: AssignmentModelOption[],
): void {
  if (
    assignmentModels.length === 0 ||
    assignmentModels.length > 20 ||
    !assignmentModels.every(isAssignmentModelOption)
  )
    throw new Error('Choose between 1 and 20 valid Assignment models');
  const keys = assignmentModels.map((option) => `${option.provider}\0${option.model}`);
  if (new Set(keys).size !== keys.length) throw new Error('Assignment models must be unique');
  const selected = assignmentModels.find(
    (option) =>
      option.provider === assignmentDefault.provider && option.model === assignmentDefault.model,
  );
  if (
    selected === undefined ||
    selected.defaultEffort !== (assignmentDefault.reasoningEffort ?? '')
  )
    throw new Error('Assignment default must match one model and its default effort');
}

export function selectAssignmentRoute(
  plan: PersonaBotModelPlan,
  requested?: ModelRoute,
): ModelRoute {
  if (requested === undefined) return { ...plan.assignmentDefault };
  const option = assignmentModelsOf(plan).find(
    (candidate) => candidate.provider === requested.provider && candidate.model === requested.model,
  );
  if (option === undefined)
    throw new Error(`Assignment model ${requested.provider}/${requested.model} is not allowed`);
  const effort = requested.reasoningEffort ?? option.defaultEffort;
  if (!option.allowedEfforts.includes(effort))
    throw new Error(
      `Assignment effort ${effort || 'provider default'} is not allowed for ${requested.provider}/${requested.model}`,
    );
  return {
    provider: option.provider,
    model: option.model,
    ...(effort === '' ? {} : { reasoningEffort: effort }),
  };
}

export function isPersonaBotModelPlan(value: unknown): value is PersonaBotModelPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(plan['revision']) &&
    (plan['revision'] as number) > 0 &&
    typeof plan['sourcePresetId'] === 'string' &&
    typeof plan['sourcePresetName'] === 'string' &&
    typeof plan['appliedAt'] === 'string' &&
    isModelRoute(plan['orchestrator']) &&
    isModelRoute(plan['assignmentDefault']) &&
    (plan['assignmentModels'] === undefined ||
      isAssignmentModelsForDefault(plan['assignmentDefault'], plan['assignmentModels']))
  );
}

function isAssignmentModelsForDefault(defaultRoute: ModelRoute, value: unknown): boolean {
  if (!Array.isArray(value)) return false;
  try {
    validateAssignmentModels(defaultRoute, value);
    return true;
  } catch {
    return false;
  }
}

function isModelPreset(value: unknown): value is ModelPreset {
  if (typeof value !== 'object' || value === null) return false;
  const preset = value as Record<string, unknown>;
  return (
    typeof preset['id'] === 'string' &&
    typeof preset['name'] === 'string' &&
    Number.isSafeInteger(preset['revision']) &&
    typeof preset['createdAt'] === 'string' &&
    isModelRoute(preset['orchestrator']) &&
    isModelRoute(preset['assignmentDefault']) &&
    (preset['assignmentModels'] === undefined ||
      isAssignmentModelsForDefault(preset['assignmentDefault'], preset['assignmentModels']))
  );
}

export function createModelPresetStore(rootDir: string, now = () => new Date()): ModelPresetStore {
  const file = join(rootDir, 'model-presets.json');
  const read = (): ModelPreset[] => {
    let body: string;
    try {
      body = readFileSync(file, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
    const parsed: unknown = JSON.parse(body);
    if (!Array.isArray(parsed) || !parsed.every(isModelPreset)) {
      throw new Error('Invalid Model Preset store');
    }
    return parsed;
  };
  return {
    list: read,
    get: (id) => read().find((preset) => preset.id === id),
    create(input) {
      if (input.assignmentModels !== undefined)
        validateAssignmentModels(input.assignmentDefault, input.assignmentModels);
      const name = input.name.trim();
      if (name.length === 0 || name.length > 100) throw new Error('Model Preset name is required');
      const presets = read();
      if (presets.some((preset) => preset.name.toLowerCase() === name.toLowerCase())) {
        throw new Error('Model Preset name already exists');
      }
      const preset: ModelPreset = {
        id: randomUUID(),
        name,
        revision: 1,
        orchestrator: { ...input.orchestrator },
        assignmentDefault: { ...input.assignmentDefault },
        ...(input.assignmentModels === undefined
          ? {}
          : {
              assignmentModels: input.assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
        createdAt: now().toISOString(),
      };
      mkdirSync(dirname(file), { recursive: true });
      atomicWriteFile(file, `${JSON.stringify([...presets, preset], null, 2)}\n`);
      return preset;
    },
    update(id, input) {
      const name = input.name.trim();
      if (name.length === 0 || name.length > 100) throw new Error('Model Preset name is required');
      const presets = read();
      const index = presets.findIndex((preset) => preset.id === id);
      if (index < 0) return undefined;
      const current = presets[index]!;
      if (current.revision !== input.expectedRevision) {
        throw new Error('Model Preset changed; select Edit selected preset again before saving');
      }
      const assignmentModels = input.assignmentModels ?? current.assignmentModels;
      if (assignmentModels !== undefined)
        validateAssignmentModels(input.assignmentDefault, assignmentModels);
      if (
        presets.some(
          (preset) => preset.id !== id && preset.name.toLowerCase() === name.toLowerCase(),
        )
      ) {
        throw new Error('Model Preset name already exists');
      }
      const updated: ModelPreset = {
        ...current,
        name,
        revision: current.revision + 1,
        orchestrator: { ...input.orchestrator },
        assignmentDefault: { ...input.assignmentDefault },
        ...(assignmentModels === undefined
          ? {}
          : {
              assignmentModels: assignmentModels.map((option) => ({
                ...option,
                allowedEfforts: [...option.allowedEfforts],
              })),
            }),
      };
      presets[index] = updated;
      atomicWriteFile(file, `${JSON.stringify(presets, null, 2)}\n`);
      return updated;
    },
  };
}
