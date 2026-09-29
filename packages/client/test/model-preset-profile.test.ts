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
  IconChevronRightOutlineRegular: () => null,
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

describe('Model Preset Profile', () => {
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
    const actions = {
      modelPlan: vi.fn(async () => plan),
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
      expect(container.querySelector('summary')?.textContent).toContain('High');
      const quick = container.querySelector<HTMLSelectElement>('.bh-model-preset-quick select')!;
      await act(async () => {
        quick.value = 'low';
        quick.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await act(async () => button('Switch').click());
      expect(applyModelPreset).toHaveBeenCalledWith('ada', 'low');
      expect(container.querySelector('summary')?.textContent).toContain('Revision 2');

      const details = container.querySelector<HTMLDetailsElement>('details')!;
      await act(async () => {
        details.open = true;
        details.dispatchEvent(new Event('toggle'));
      });
      await act(async () => button('Edit selected preset').click());
      expect(container.querySelector<HTMLInputElement>('.bh-model-preset-form input')?.value).toBe(
        'Economy',
      );
      await act(async () => button('Save preset revision').click());
      expect(updateModelPreset).toHaveBeenCalledWith('low', 1, 'Economy', low, assignment);
      expect(container.querySelector('summary')?.textContent).toContain('Revision 2');
      expect(container.textContent).toContain('existing Bot snapshots are unchanged');

      await act(async () => button('Edit selected preset').click());
      presets[1] = { ...presets[1]!, name: 'Updated elsewhere', revision: 3 };
      await act(async () => button('Save preset revision').click());
      expect(container.textContent).toContain('Model Preset changed;');
      await act(async () => button('Edit selected preset').click());
      expect(container.querySelector<HTMLInputElement>('.bh-model-preset-form input')?.value).toBe(
        'Updated elsewhere',
      );

      await act(async () => button('Save custom snapshot').click());
      expect(customizeModelPlan).toHaveBeenCalledWith('ada', low);
      expect(container.querySelector('summary')?.textContent).toContain('Custom snapshot');
      expect(container.querySelector('summary')?.textContent).toContain('Revision 3');
      expect(quick.value).toBe('');
      expect(quick.selectedOptions[0]?.textContent).toBe('Choose a preset to switch to');
      expect(button('Switch').disabled).toBe(true);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });
});
