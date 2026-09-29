import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { atomicWriteFile } from '../fs/atomic-write.js';

export interface ModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  revision: number;
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  createdAt: string;
}

export interface PersonaBotModelPlan {
  revision: number;
  sourcePresetId: string;
  sourcePresetName: string;
  orchestrator: ModelRoute;
  assignmentDefault: ModelRoute;
  appliedAt: string;
}

export interface ModelPresetStore {
  list(): ModelPreset[];
  get(id: string): ModelPreset | undefined;
  create(input: {
    name: string;
    orchestrator: ModelRoute;
    assignmentDefault: ModelRoute;
  }): ModelPreset;
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
    isModelRoute(plan['assignmentDefault'])
  );
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
    isModelRoute(preset['assignmentDefault'])
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
        createdAt: now().toISOString(),
      };
      mkdirSync(dirname(file), { recursive: true });
      atomicWriteFile(file, `${JSON.stringify([...presets, preset], null, 2)}\n`);
      return preset;
    },
  };
}
