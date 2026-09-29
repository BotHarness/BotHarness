import { ReasoningEffortId, type LlmRuntime } from '@deepseek-ai/dsh-llm';

import type { ModelRoute } from './presets.js';

export interface ModelCatalogEntry {
  provider: string;
  providerName: string;
  model: string;
  modelName: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
}

export interface ModelCatalog {
  list(): Promise<ModelCatalogEntry[]>;
  validate(route: ModelRoute): Promise<void>;
}

export function createModelCatalog(
  llm: Pick<LlmRuntime, 'listProviders' | 'listModels' | 'resolveModelInfo' | 'resolveCallConfig'>,
): ModelCatalog {
  return {
    async list() {
      const providers = llm.listProviders();
      const groups = await Promise.all(
        providers.map(async (provider) => {
          const models = await llm.listModels(provider.id);
          return Promise.all(
            models.map(async (model): Promise<ModelCatalogEntry> => {
              const exact = await llm.resolveModelInfo(provider.id, model.id);
              return {
                provider: provider.id,
                providerName: provider.name,
                model: model.id,
                modelName: model.name,
                efforts: (exact.reasoning?.efforts ?? []).map((effort) => ({
                  id: effort.id,
                  name: effort.name,
                })),
                ...(exact.reasoning?.defaultEffort === undefined
                  ? {}
                  : { defaultEffort: exact.reasoning.defaultEffort }),
              };
            }),
          );
        }),
      );
      return groups.flat();
    },
    async validate(route) {
      if (route.provider.trim() !== route.provider || route.model.trim() !== route.model) {
        throw new Error('Invalid model route');
      }
      const provider = llm.listProviders().find((candidate) => candidate.id === route.provider);
      if (provider === undefined) throw new Error(`Provider ${route.provider} is unavailable`);
      const models = await llm.listModels(route.provider);
      if (!models.some((candidate) => candidate.id === route.model)) {
        throw new Error(`Model ${route.provider}/${route.model} is unavailable`);
      }
      await llm.resolveCallConfig({
        provider: route.provider,
        model: route.model,
        ...(route.reasoningEffort === undefined
          ? {}
          : { reasoningEffort: ReasoningEffortId(route.reasoningEffort) }),
      });
    },
  };
}
