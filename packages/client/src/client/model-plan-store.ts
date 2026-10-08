import type { ModelPlanView } from './bridge.js';

const plans = new Map<string, ModelPlanView | null>();
const listeners = new Set<() => void>();

export function rememberModelPlan(slug: string, plan: ModelPlanView | undefined): void {
  const previous = plans.get(slug);
  if (plan !== undefined && (previous?.revision ?? 0) > plan.revision) return;
  if (plan === undefined && previous !== undefined && previous !== null) return;
  const next = plan ?? null;
  if (previous === next) return;
  plans.set(slug, next);
  for (const listener of listeners) listener();
}

export function modelPlanOf(slug: string | undefined): ModelPlanView | null | undefined {
  return slug === undefined ? undefined : plans.get(slug);
}

export function subscribeModelPlans(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
