import type { OnboardingSnapshot, TutorialAction } from '../../../core/src/onboarding/types.js';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelRouteView } from './bridge.js';
import { store } from './store.js';
import type { WindowCompanions } from './window-companions.js';

export interface PendingWelcomeRequest {
  channelId: string;
  slug: string;
  body: string;
}
export interface OnboardingViewState {
  receipt?: OnboardingSnapshot | undefined;
  pending?: PendingWelcomeRequest | undefined;
  modelOpen: boolean;
  modelTarget?: { channelId: string; slug: string } | undefined;
  sendOpen: boolean;
  guideOpen: boolean;
  busy: boolean;
  error?: string | undefined;
}
export class OnboardingController {
  private state: OnboardingViewState = {
    modelOpen: false,
    sendOpen: false,
    guideOpen: false,
    busy: false,
  };
  private listeners = new Set<() => void>();
  private entering: Promise<void> | undefined;
  constructor(readonly actions: BridgeActions) {}
  getSnapshot = (): OnboardingViewState => this.state;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  private update(change: Partial<OnboardingViewState>): void {
    this.state = { ...this.state, ...change };
    for (const listener of this.listeners) listener();
  }
  async enter(companion?: WindowCompanions): Promise<void> {
    if (this.entering) return this.entering;
    this.entering = this.refresh(undefined, undefined, companion).finally(() => {
      this.entering = undefined;
    });
    return this.entering;
  }
  async refresh(
    slug?: string,
    action?: TutorialAction,
    companion?: WindowCompanions,
    select = false,
  ): Promise<void> {
    try {
      const receipt = await this.actions.onboarding(slug, action);
      const first = this.state.receipt === undefined;
      this.update({
        receipt,
        error: undefined,
        guideOpen:
          receipt.completed || receipt.tutorial !== 'active'
            ? false
            : action === 'start' || action === 'continue' || action === 'restart'
              ? true
              : this.state.guideOpen,
      });
      if (first) {
        try {
          const saved = sessionStorage.getItem(`botharness/onboarding-draft/${receipt.profileId}`);
          if (saved) {
            const draft = JSON.parse(saved) as PendingWelcomeRequest;
            if (
              typeof draft.channelId === 'string' &&
              typeof draft.slug === 'string' &&
              typeof draft.body === 'string'
            )
              this.update({ pending: draft });
          }
        } catch {}
      }
      if (first || select) {
        await this.actions.load();
        if (receipt.defaultBotSlug) {
          await companion?.start();
          companion?.initializeDefault(receipt.defaultBotSlug);
        }
        if (receipt.channelId && (select || store.getSnapshot().selection === undefined))
          await this.actions.openChannel(receipt.channelId);
      }
    } catch (error) {
      this.update({ error: errorMessage(error) });
    }
  }
  private savePending(pending: PendingWelcomeRequest | undefined): void {
    this.update({ pending });
    try {
      const profileId = this.state.receipt?.profileId;
      if (!profileId) return;
      const key = `botharness/onboarding-draft/${profileId}`;
      if (pending) sessionStorage.setItem(key, JSON.stringify(pending));
      else sessionStorage.removeItem(key);
    } catch {}
  }
  markSubmitted(channelId: string, body: string): void {
    if (this.state.pending?.channelId === channelId && this.state.pending.body === body)
      this.savePending(undefined);
  }
  pauseGuide(): void {
    this.update({ guideOpen: false });
    if (this.state.receipt?.tutorial === 'active' && !this.state.receipt.completed)
      void this.refresh(undefined, 'pause');
  }
  prepareSend(channelId: string, slug: string, body: string): boolean | Promise<boolean> {
    this.pauseGuide();
    if (!this.state.receipt || this.state.receipt.completed) return true;
    return this.inspectSend(channelId, slug, body).catch((error: unknown) => {
      this.savePending({ channelId, slug, body });
      this.update({ error: errorMessage(error) });
      return false;
    });
  }
  private async inspectSend(channelId: string, slug: string, body: string): Promise<boolean> {
    const [{ models, default: fallback }, state] = await Promise.all([
      this.actions.modelCatalog(),
      this.actions.modelPlanState(slug),
    ]);
    const route = state.plan?.orchestrator ?? fallback;
    if (
      !state.repair &&
      route &&
      models.some(
        (model) =>
          model.provider === route.provider &&
          model.model === route.model &&
          model.credential === undefined,
      )
    )
      return true;
    this.savePending({ channelId, slug, body });
    this.update({
      modelOpen: true,
      modelTarget: { channelId, slug },
      sendOpen: false,
      error: undefined,
    });
    return false;
  }
  async request(channelId: string, body: string): Promise<void> {
    if (this.state.busy || store.getSnapshot().conversation.sending) return;
    this.update({ busy: true, error: undefined });
    try {
      if (store.getSnapshot().conversation.channel?.id !== channelId)
        await this.actions.openChannel(channelId);
      await this.actions.send(body);
    } catch (error) {
      this.update({ error: errorMessage(error) });
    } finally {
      this.update({ busy: false });
    }
  }
  chooseModel(channelId: string, slug: string, body?: string): void {
    if (this.state.busy || store.getSnapshot().conversation.sending) return;
    this.pauseGuide();
    if (body !== undefined) this.savePending({ channelId, slug, body });
    this.update({
      modelOpen: true,
      modelTarget: { channelId, slug },
      sendOpen: false,
      error: undefined,
    });
  }
  reviewPending(): void {
    if (this.state.pending) {
      this.pauseGuide();
      this.update({ sendOpen: true, modelOpen: false, error: undefined });
    }
  }
  closeModel(): void {
    this.update({ modelOpen: false, modelTarget: undefined });
  }
  closeSend(): void {
    this.update({ sendOpen: false });
  }
  async saveModel(
    route: ModelRouteView,
    globalDefault: boolean,
    expectedRevision: number,
  ): Promise<void> {
    const target = this.state.modelTarget;
    if (!target || this.state.busy) return;
    this.update({ busy: true, error: undefined });
    try {
      await this.actions.onboardingModel(target.slug, expectedRevision, route, globalDefault);
      this.update({
        modelOpen: false,
        modelTarget: undefined,
        sendOpen: this.state.pending?.channelId === target.channelId,
      });
    } catch (error) {
      this.update({ error: errorMessage(error) });
      throw error;
    } finally {
      this.update({ busy: false });
    }
  }
  async sendPending(): Promise<void> {
    const pending = this.state.pending;
    if (!pending || this.state.busy) return;
    this.update({ busy: true, error: undefined, sendOpen: false });
    try {
      if (store.getSnapshot().conversation.channel?.id !== pending.channelId)
        await this.actions.openChannel(pending.channelId);
      if (await this.actions.send(pending.body)) this.savePending(undefined);
    } catch (error) {
      this.update({ error: errorMessage(error) });
    } finally {
      this.update({ busy: false, sendOpen: Boolean(this.state.pending) && !this.state.modelOpen });
    }
  }
}
const controllers = new WeakMap<BridgeActions, OnboardingController>();
export function onboardingFor(actions: BridgeActions): OnboardingController {
  let controller = controllers.get(actions);
  if (!controller) {
    controller = new OnboardingController(actions);
    controllers.set(actions, controller);
  }
  return controller;
}
export function requestBotCreation(): void {
  document.dispatchEvent(new Event('botharness/create-bot'));
}
