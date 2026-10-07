// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => createElement('button', { onClick, disabled }, children),
  Tag: ({ children }: { children: ReactNode }) => createElement('span', null, children),
  Modal: ({
    open,
    title,
    description,
    children,
  }: {
    open: boolean;
    title: string;
    description?: string;
    children?: ReactNode;
  }) =>
    open
      ? createElement('div', { role: 'dialog', 'aria-label': title }, description, children)
      : null,
}));

import type { BridgeActions } from '../src/client/actions.js';
import { en } from '../src/client/locale.js';
import { ModelPresetProfile } from '../src/client/model-preset-profile.js';

function translate(key: string, params?: Record<string, unknown>): string {
  let text = (en as Record<string, string>)[key] ?? key;
  for (const [name, value] of Object.entries(params ?? {}))
    text = text.replace(`{${name}}`, String(value));
  return text;
}

const summary = (container: HTMLElement): string =>
  container.querySelector('.bh-model-entry .bh-card-list')?.textContent ?? '';

const openEditor = async (container: HTMLElement): Promise<void> => {
  await act(async () => {
    container.querySelector<HTMLButtonElement>('.bh-model-entry button.bh-card-main')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
};

describe('Model Preset Profile', () => {
  it.each([false, true])(
    'refreshes repair guidance after Assignment updates (resolved: %s)',
    async (resolved) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const route = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
      let plan = {
        revision: 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator: route,
        assignmentDefault: route,
        appliedAt: '',
      };
      const repair = { code: 'route-unavailable', message: 'Orchestrator route cannot run' };
      let updated = false;
      const modelPlanState = vi.fn(async () => ({
        plan,
        repair: updated && resolved ? undefined : repair,
      }));
      const actions = {
        modelPlanState,
        modelPresets: vi.fn(async () => []),
        modelCatalog: vi.fn(async () => [
          {
            provider: 'deepseek',
            providerName: 'DeepSeek',
            model: 'flash',
            modelName: 'Flash',
            efforts: [{ id: 'low', name: 'Low' }],
          },
        ]),
        setModelPlanAssignments: vi.fn(async () => {
          updated = true;
          plan = { ...plan, revision: 2 };
          return plan;
        }),
      } as unknown as BridgeActions;
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate })),
        );
        await openEditor(container);
        const before = modelPlanState.mock.calls.length;
        const save = Array.from(container.querySelectorAll('button')).find(
          (button) => button.textContent === 'Save Assignment model choices',
        )!;
        await act(async () => save.click());
        expect(modelPlanState.mock.calls.length).toBeGreaterThan(before);
        expect(container.querySelector('[role="alert"]')?.textContent ?? '').toContain(
          resolved ? '' : 'The current model cannot run',
        );
        if (resolved) expect(container.querySelector('[role="alert"]')).toBeNull();
        expect(summary(container)).toContain(resolved ? 'Revision 2' : 'Select an available model');
      } finally {
        await act(async () => root.unmount());
        container.remove();
      }
    },
  );

  it('explains an ambiguous legacy model before the settings are expanded', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const actions = {
      modelPlanState: vi.fn(async () => ({
        repair: {
          code: 'legacy-ambiguous',
          legacyModel: 'shared-model',
          message: 'Choose a provider',
        },
      })),
      modelPresets: vi.fn(async () => []),
    } as unknown as BridgeActions;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate })),
      );
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(summary(container)).toContain('Select an available model');
      expect(container.querySelector('[role="alert"]')?.textContent).toContain(
        'shared-model matches multiple providers',
      );
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('keeps a switched plan and its custom draft when an older detail load finishes later', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const high = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const assignment = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const presets = [
      { id: 'high', name: 'High', revision: 1, orchestrator: high, assignmentDefault: assignment },
      { id: 'low', name: 'Economy', revision: 1, orchestrator: low, assignmentDefault: assignment },
    ];
    let plan = {
      revision: 1,
      sourcePresetId: 'high',
      sourcePresetName: 'High',
      orchestrator: high,
      assignmentDefault: assignment,
      appliedAt: '',
    };
    const originalPlan = plan;
    let finishStaleLoad!: (value: typeof plan) => void;
    const staleLoad = new Promise<typeof plan>((resolve) => {
      finishStaleLoad = resolve;
    });
    let planReads = 0;
    const actions = {
      modelPlanState: vi.fn(async () => ({ plan: await (++planReads === 2 ? staleLoad : plan) })),
      modelPresets: vi.fn(async () => presets),
      modelCatalog: vi.fn(async () => [
        {
          provider: 'deepseek',
          providerName: 'DeepSeek',
          model: 'flash',
          modelName: 'Flash',
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'high', name: 'High' },
          ],
        },
      ]),
      applyModelPreset: vi.fn(async (_slug: string, id: string) => {
        plan = {
          ...plan,
          revision: 2,
          sourcePresetId: id,
          sourcePresetName: 'Economy',
          orchestrator: low,
        };
        return plan;
      }),
    } as unknown as BridgeActions;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate })),
      );
      await openEditor(container);
      expect(planReads).toBe(2);

      const quick = container.querySelector<HTMLSelectElement>('.bh-model-preset-quick select')!;
      await act(async () => {
        quick.value = 'low';
        quick.dispatchEvent(new Event('change', { bubbles: true }));
      });
      const switchButton = Array.from(container.querySelectorAll('button')).find(
        (button) => button.textContent === 'Switch',
      )!;
      await act(async () => switchButton.click());
      expect(summary(container)).toContain('Economy');

      await act(async () => finishStaleLoad(originalPlan));
      expect(quick.value).toBe('low');
      expect(
        container.querySelectorAll<HTMLSelectElement>('.bh-model-preset-custom select')[1]?.value,
      ).toBe('low');
      expect(summary(container)).toContain('Revision 2');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it('switches a Bot quickly, edits only the template, and saves a custom Bot snapshot', async () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const high = { provider: 'deepseek', model: 'flash', reasoningEffort: 'high' };
    const low = { provider: 'deepseek', model: 'flash', reasoningEffort: 'low' };
    const assignment = { provider: 'deepseek', model: 'pro', reasoningEffort: 'off' };
    const presets = [
      {
        id: 'high',
        name: 'High',
        revision: 1,
        orchestrator: high,
        assignmentDefault: assignment,
        createdAt: '',
      },
      {
        id: 'low',
        name: 'Economy',
        revision: 1,
        orchestrator: low,
        assignmentDefault: assignment,
        createdAt: '',
      },
    ];
    let plan = {
      revision: 1,
      sourcePresetId: 'high',
      sourcePresetName: 'High',
      orchestrator: high,
      assignmentDefault: assignment,
      appliedAt: '',
    };
    const applyModelPreset = vi.fn(async (_slug: string, id: string) => {
      const preset = presets.find((item) => item.id === id)!;
      plan = {
        ...plan,
        revision: plan.revision + 1,
        sourcePresetId: id,
        sourcePresetName: preset.name,
        orchestrator: preset.orchestrator,
      };
      return plan;
    });
    const updateModelPreset = vi.fn(
      async (id: string, revision: number, name: string, orchestrator: typeof high) => {
        const index = presets.findIndex((item) => item.id === id);
        if (presets[index]?.revision !== revision) {
          throw new Error('Model Preset changed; select Edit selected preset again before saving');
        }
        presets[index] = { ...presets[index]!, name, revision: revision + 1, orchestrator };
        return presets[index]!;
      },
    );
    const customizeModelPlan = vi.fn(async (_slug: string, orchestrator: typeof high) => {
      plan = {
        ...plan,
        revision: plan.revision + 1,
        sourcePresetId: '',
        sourcePresetName: '',
        orchestrator,
      };
      return plan;
    });
    const setModelPlanAssignments = vi.fn(
      async (
        _slug: string,
        _revision: number,
        assignmentDefault: typeof assignment,
        assignmentModels: Array<{
          provider: string;
          model: string;
          allowedEfforts: string[];
          defaultEffort: string;
        }>,
      ) => {
        plan = {
          ...plan,
          revision: plan.revision + 1,
          sourcePresetId: '',
          sourcePresetName: '',
          assignmentDefault,
        };
        return { ...plan, assignmentModels };
      },
    );
    const modelPlan = vi.fn(async () => plan);
    const actions = {
      modelPlan,
      modelPlanState: vi.fn(async () => ({ plan: await modelPlan() })),
      modelPresets: vi.fn(async () => presets),
      modelCatalog: vi.fn(async () => [
        {
          provider: 'deepseek',
          providerName: 'DeepSeek',
          model: 'flash',
          modelName: 'Flash',
          efforts: [
            { id: 'low', name: 'Low' },
            { id: 'high', name: 'High' },
          ],
        },
        {
          provider: 'deepseek',
          providerName: 'DeepSeek',
          model: 'pro',
          modelName: 'Pro',
          efforts: [{ id: 'off', name: 'Off' }],
        },
      ]),
      applyModelPreset,
      updateModelPreset,
      customizeModelPlan,
      setModelPlanAssignments,
    } as unknown as BridgeActions;
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const button = (text: string): HTMLButtonElement => {
      const found = Array.from(container.querySelectorAll('button')).find(
        (item) => item.textContent === text,
      );
      if (found === undefined) throw new Error(`Missing button: ${text}`);
      return found;
    };
    try {
      await act(async () =>
        root.render(createElement(ModelPresetProfile, { slug: 'ada', actions, t: translate })),
      );
      expect(container.querySelector('.bh-model-preset-quick')).not.toBeNull();
      expect(summary(container)).toContain('High');
      const quick = container.querySelector<HTMLSelectElement>('.bh-model-preset-quick select')!;
      await act(async () => {
        quick.value = 'low';
        quick.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => button('Switch').click());
      expect(applyModelPreset).toHaveBeenCalledWith('ada', 'low');
      expect(summary(container)).toContain('Revision 2');

      await openEditor(container);
      await act(async () => button('Edit selected preset').click());
      expect(container.querySelector<HTMLInputElement>('.bh-model-preset-form input')?.value).toBe(
        'Economy',
      );
      await act(async () => button('Save preset revision').click());
      expect(updateModelPreset).toHaveBeenCalledWith('low', 1, 'Economy', low, assignment);
      expect(summary(container)).toContain('Revision 2');
      expect(container.textContent).toContain('existing Bot snapshots are unchanged');

      await act(async () => button('Edit selected preset').click());
      presets[1] = { ...presets[1]!, name: 'Updated elsewhere', revision: 3 };
      await act(async () => button('Save preset revision').click());
      expect(container.textContent).toContain('Model Preset changed;');
      await act(async () => button('Edit selected preset').click());
      expect(container.querySelector<HTMLInputElement>('.bh-model-preset-form input')?.value).toBe(
        'Updated elsewhere',
      );

      const beforeCustom = plan;
      let finishRefresh!: (value: typeof plan) => void;
      const pendingRefresh = new Promise<typeof plan>((resolve) => {
        finishRefresh = resolve;
      });
      modelPlan.mockImplementationOnce(async () => pendingRefresh);
      await openEditor(container);
      expect(container.querySelector('.bh-model-preset-custom')).not.toBeNull();
      await act(async () => button('Save custom snapshot').click());
      await act(async () => finishRefresh(beforeCustom));
      expect(customizeModelPlan).toHaveBeenCalledWith('ada', low);
      expect(summary(container)).toContain('Custom snapshot');
      expect(summary(container)).toContain('Revision 3');
      expect(quick.value).toBe('');
      expect(quick.selectedOptions[0]?.textContent).toBe('Choose a preset to switch to');
      expect(button('Switch').disabled).toBe(true);

      const flashChoice = container.querySelector<HTMLInputElement>(
        '.bh-model-preset-assignment-row input[type="checkbox"]',
      )!;
      await act(async () => flashChoice.click());
      const flashEfforts = container
        .querySelector('.bh-model-preset-assignment-row')!
        .querySelectorAll<HTMLInputElement>(
          '.bh-model-preset-assignment-efforts input[type="checkbox"]',
        );
      await act(async () => flashEfforts[2]!.click());
      await act(async () => button('Save Assignment model choices').click());
      expect(setModelPlanAssignments).toHaveBeenCalledWith(
        'ada',
        3,
        assignment,
        expect.arrayContaining([
          {
            provider: 'deepseek',
            model: 'flash',
            allowedEfforts: ['low', 'high'],
            defaultEffort: 'low',
          },
        ]),
      );
      expect(summary(container)).toContain('Revision 4');
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
