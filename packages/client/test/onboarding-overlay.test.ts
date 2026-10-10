// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const tour = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => () => {}),
);
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props),
  Checkbox: () => null,
  Tag: ({ children, ...props }: Record<string, unknown> & { children?: unknown }) =>
    createElement('span', props, children as never),
}));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/onboarding-memory.js', () => ({ OnboardingMemory: () => null }));
vi.mock('../src/client/onboarding-binding.js', () => ({ OnboardingAppBinding: () => null }));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettings: vi.fn() }));
vi.mock('../src/client/internal-tour.js', () => ({ startInternalTour: tour }));

import type { OnboardingSnapshot, TutorialAction } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { ModelCatalogEntryView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingOverlay } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  tour.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setMode('bot');
  store.setConversation({ sending: false });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function harness(tutorial: OnboardingSnapshot['tutorial'], completed = false) {
  const shared: OnboardingSnapshot = {
    profileId: 'overlay',
    completed,
    preparation: 'ready',
    tutorial,
    channelId: 'dm-ada',
  };
  const actions = {
    onboarding: vi.fn(async (_slug?: string, action?: TutorialAction) => {
      if (action === 'start') shared.tutorial = 'active';
      if (action === 'pause') shared.tutorial = 'paused';
      if (action === 'skip') shared.tutorial = 'skipped';
      return { ...shared };
    }),
    load: vi.fn(async () => {}),
    openChannel: vi.fn(async () => {}),
    modelCatalog: vi.fn(
      async (): Promise<{
        default: { provider: string; model: string };
        models: ModelCatalogEntryView[];
      }> => ({
        default: { provider: 'deepseek', model: 'chat' },
        models: [
          {
            provider: 'deepseek',
            model: 'chat',
            providerName: 'DeepSeek',
            modelName: 'Chat',
            efforts: [],
          },
        ],
      }),
    ),
    modelPlanState: vi.fn(async () => ({ revision: 0 })),
    onboardingModel: vi.fn(async () => {}),
    send: vi.fn(async () => true),
  };
  const bridge = actions as unknown as BridgeActions;
  const render = async () => {
    await act(async () => {
      root.render(createElement(OnboardingOverlay, { actions: bridge, t: zhTranslate }));
      await Promise.resolve();
    });
  };
  return { actions, bridge, render, controller: onboardingFor(bridge) };
}
it('auto-starts the interface walkthrough on the first Bot-mode entry', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'start');
  expect(actions.load).toHaveBeenCalled();
  expect(actions.openChannel).toHaveBeenCalledWith('dm-ada');
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: true,
    receipt: { tutorial: 'active' },
  });
  expect(tour).toHaveBeenCalledOnce();
  const specs = tour.mock.calls[0]![0] as { selector: string }[];
  expect(specs.map((spec) => spec.selector)).toEqual([
    '[data-onboarding-welcome]',
    '[data-bh-tour="roster"]',
    '[data-bh-tour="inbox"]',
    '[data-bh-tour="bot-settings"]',
    '[data-bh-tour="topbar"]',
    '[data-bh-tour="composer"]',
    '[data-bh-tour="channel-sidebar"]',
    '[data-bh-tour="companion"]',
  ]);
  const options = tour.mock.calls[0]![1] as {
    skipLabel: string;
    onSkip(): void;
    onClosed(): void;
  };
  expect(options.skipLabel).toBe(zhTranslate('onboarding.skip'));
  await act(async () => {
    options.onSkip();
  });
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'skip');
  expect(controller.getSnapshot().guideOpen).toBe(false);
});
it.each(['paused', 'skipped'] as const)(
  'stays quiet when the shared tutorial is %s',
  async (tutorial) => {
    const { actions, render } = harness(tutorial);
    await render();
    expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
    expect(tour).not.toHaveBeenCalled();
  },
);
it('stays quiet when onboarding is already complete', async () => {
  const { actions, render } = harness('active', true);
  await render();
  expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
  expect(tour).not.toHaveBeenCalled();
});
it('pauses the shared receipt when the walkthrough is closed', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  const options = tour.mock.calls[0]![1] as { onClosed(): void };
  await act(async () => {
    options.onClosed();
  });
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'pause');
  expect(controller.getSnapshot().guideOpen).toBe(false);
});
it('pauses the shared receipt when the walkthrough is finished', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  const options = tour.mock.calls[0]![1] as { onFinished(): void };
  await act(async () => {
    options.onFinished();
  });
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'pause');
  expect(controller.getSnapshot().guideOpen).toBe(false);
});
