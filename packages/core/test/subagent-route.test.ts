import { describe, expect, it } from 'vitest';
import { ReasoningEffortId } from '@deepseek-ai/dsh-llm';

import type { PersonaBotModelPlan } from '../src/models/presets.js';
import { resolveSubagentRoute } from '../src/models/subagent-route.js';

const plan: PersonaBotModelPlan = {
  revision: 2,
  sourcePresetId: 'preset',
  sourcePresetName: 'QA',
  appliedAt: '2026-09-30T00:00:00.000Z',
  orchestrator: { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' },
  assignmentDefault: { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' },
  assignmentModels: [
    { provider: 'deepseek', model: 'flash', allowedEfforts: ['low'], defaultEffort: 'low' },
    { provider: 'deepseek', model: 'pro', allowedEfforts: ['off', 'high'], defaultEffort: 'off' },
  ],
};

describe('Subagent route from current PersonaBot plan', () => {
  it('inherits an allowed parent model and effort exactly', () => {
    expect(
      resolveSubagentRoute(
        plan,
        { provider: 'deepseek', model: 'pro', reasoningEffort: ReasoningEffortId('high') },
        {},
      ),
    ).toEqual({ route: { provider: 'deepseek', model: 'pro', reasoningEffort: 'high' } });
  });

  it('uses the current Assignment default and explains it when the parent route was excluded', () => {
    const result = resolveSubagentRoute(
      plan,
      { provider: 'old-provider', model: 'old-model', reasoningEffort: ReasoningEffortId('high') },
      {},
    );
    expect(result.route).toEqual(plan.assignmentDefault);
    expect(result.notice).toContain('old-provider/old-model');
    expect(result.notice).toContain('deepseek/flash');
  });

  it('rejects an explicit excluded route or effort without substituting a model', () => {
    expect(() =>
      resolveSubagentRoute(
        plan,
        { provider: 'deepseek', model: 'flash' },
        {
          provider: 'old-provider',
          model: 'old-model',
        },
      ),
    ).toThrow('not allowed');
    expect(() =>
      resolveSubagentRoute(
        plan,
        { provider: 'deepseek', model: 'pro', reasoningEffort: ReasoningEffortId('high') },
        {
          reasoning_effort: 'medium',
        },
      ),
    ).toThrow('not allowed');
  });

  it('applies the selected model default effort when the explicit route changes', () => {
    expect(
      resolveSubagentRoute(
        plan,
        { provider: 'deepseek', model: 'flash', reasoningEffort: ReasoningEffortId('low') },
        { provider: 'deepseek', model: 'pro' },
      ).route,
    ).toEqual({ provider: 'deepseek', model: 'pro', reasoningEffort: 'off' });
  });
});
