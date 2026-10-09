// @vitest-environment jsdom
import { act, createElement, type ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const highlight = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => () => {}),
);
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) =>
    createElement('button', props),
  Checkbox: () => null,
}));
vi.mock('../src/client/model-picker.js', () => ({ ModelPicker: () => null }));
vi.mock('../src/client/onboarding-memory.js', () => ({ OnboardingMemory: () => null }));
vi.mock('../src/client/onboarding-binding.js', () => ({ OnboardingAppBinding: () => null }));
vi.mock('../src/client/modal.js', () => ({ Modal: () => null }));
vi.mock('../src/client/bot-settings-open.js', () => ({ openModelsSettings: vi.fn() }));
vi.mock('../src/client/internal-tour.js', () => ({ highlightInternalControl: highlight }));

import type { OnboardingSnapshot, TutorialAction } from '../../core/src/onboarding/types.js';
import type { BridgeActions } from '../src/client/actions.js';
import type { ModelCatalogEntryView } from '../src/client/bridge.js';
import { zhTranslate } from '../src/client/locale.js';
import { onboardingFor } from '../src/client/onboarding.js';
import { OnboardingWelcome } from '../src/client/onboarding-view.js';
import { store } from '../src/client/store.js';

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  sessionStorage.clear();
  highlight.mockClear();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  store.setConversation({
    channel: {
      id: 'dm-ada',
      botSlug: 'ada',
      type: 'dm',
      name: 'Ada',
      members: [],
      createdAt: '',
      updatedAt: '',
    },
    sending: false,
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
function harness(tutorial: OnboardingSnapshot['tutorial'], completed = false) {
  const shared: OnboardingSnapshot = {
    profileId: 'welcome',
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
  const render = async (channelId = 'dm-ada') => {
    await act(async () => {
      await onboardingFor(bridge).enter();
      root.render(createElement(OnboardingWelcome, { actions: bridge, channelId, t: zhTranslate }));
    });
  };
  return { actions, bridge, render, controller: onboardingFor(bridge) };
}
it('auto-starts the floating tour on the welcome card once the receipt is ready', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'start');
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: true,
    receipt: { tutorial: 'active' },
  });
  expect(highlight).toHaveBeenCalledTimes(1);
  const [target, title, hint, close, onClosed, skip] = highlight.mock.calls[0] as unknown as [
    Element,
    string,
    string,
    string,
    () => void,
    { label: string; onSkip(): void },
  ];
  expect(target.getAttribute('data-onboarding-welcome')).not.toBeNull();
  expect(title).toBe(zhTranslate('onboarding.tourTitle'));
  expect(hint).toBe(zhTranslate('onboarding.tourHint'));
  expect(close).toBe(zhTranslate('common.close'));
  expect(skip.label).toBe(zhTranslate('onboarding.skip'));
  await act(async () => {
    onClosed();
  });
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'pause');
});
it('keeps skipping and reopening explicit instead of restarting automatically', async () => {
  const { actions, render, controller } = harness('not-started');
  await render();
  const skip = (
    highlight.mock.calls[0] as unknown as [
      Element,
      string,
      string,
      string,
      () => void,
      {
        onSkip(): void;
      },
    ]
  )[5];
  await act(async () => {
    skip.onSkip();
  });
  expect(actions.onboarding).toHaveBeenCalledWith(undefined, 'skip');
  expect(controller.getSnapshot()).toMatchObject({
    guideOpen: false,
    receipt: { tutorial: 'skipped' },
  });
  expect(actions.onboarding.mock.calls.filter(([, action]) => action === 'start')).toHaveLength(1);
});
it.each(['paused', 'skipped'] as const)(
  'stays quiet when the shared tutorial is %s',
  async (tutorial) => {
    const { actions, render } = harness(tutorial);
    await render();
    expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
    expect(highlight).not.toHaveBeenCalled();
  },
);
it('stays quiet when onboarding is already complete', async () => {
  const { actions, render } = harness('active', true);
  await render();
  expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
  expect(highlight).not.toHaveBeenCalled();
});
it('does not auto-start from a welcome card outside the receipt channel', async () => {
  const { actions, render } = harness('not-started');
  await render('dm-other');
  expect(actions.onboarding).not.toHaveBeenCalledWith(undefined, 'start');
  expect(highlight).not.toHaveBeenCalled();
});
it('surfaces the retained unsent question from the welcome card', async () => {
  const { actions, bridge, render, controller } = harness('paused');
  await act(async () => {
    await controller.enter();
  });
  actions.modelCatalog.mockResolvedValueOnce({
    default: { provider: 'deepseek', model: 'chat' },
    models: [
      {
        provider: 'deepseek',
        model: 'chat',
        providerName: 'DeepSeek',
        modelName: 'Chat',
        efforts: [],
        credential: 'missing',
      },
    ],
  });
  await act(async () => {
    await controller.prepareSend('dm-ada', 'ada', 'Keep this question');
  });
  await act(async () => {
    root.render(
      createElement(OnboardingWelcome, { actions: bridge, channelId: 'dm-ada', t: zhTranslate }),
    );
  });
  const button = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === zhTranslate('onboarding.unsent'),
  );
  if (button === undefined) throw new Error('Missing unsent question entry');
  await act(async () => button.click());
  expect(controller.getSnapshot()).toMatchObject({
    sendOpen: true,
    pending: { body: 'Keep this question' },
  });
});
