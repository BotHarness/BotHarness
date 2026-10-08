import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button, Checkbox } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type { ModelCatalogEntryView, ModelRouteView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { ModelPicker } from './model-picker.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { Modal } from './modal.js';
import { openModelsSettings } from './bot-settings-open.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { onboardingFor, requestBotCreation } from './onboarding.js';
import { store } from './store.js';
import type { WindowCompanions } from './window-companions.js';
import { highlightInternalControl } from './internal-tour.js';

export function OnboardingModelDialog({
  actions,
  slug,
  title,
  onClose,
  onConfirm,
  t,
  globalOnly = false,
  request,
}: {
  actions: BridgeActions;
  slug?: string;
  title: string;
  onClose(): void;
  onConfirm(route: ModelRouteView, globalDefault: boolean, revision: number): Promise<void>;
  t: BotHarnessTranslate;
  globalOnly?: boolean;
  request?: string | undefined;
}): ReactElement {
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
  const [route, setRoute] = useState<ModelRouteView>();
  const [revision, setRevision] = useState(0);
  const [globalDefault, setGlobalDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const load = async (): Promise<void> => {
    setError(undefined);
    try {
      const [catalog, state] = await Promise.all([
        actions.modelCatalog(),
        slug ? actions.modelPlanState(slug) : Promise.resolve(undefined),
      ]);
      setModels(catalog.models);
      setRevision(state?.revision ?? state?.plan?.revision ?? 0);
      const selected = state?.plan?.orchestrator ?? catalog.default;
      setRoute(
        (previous) =>
          previous ??
          selected ??
          (catalog.models.find((model) => model.credential === undefined)
            ? {
                provider: catalog.models.find((model) => model.credential === undefined)!.provider,
                model: catalog.models.find((model) => model.credential === undefined)!.model,
              }
            : undefined),
      );
      setLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions, slug]);
  const selected = models.find(
    (model) => model.provider === route?.provider && model.model === route.model,
  );
  const confirm = async (): Promise<void> => {
    if (!route || busy || !selected || selected.credential !== undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(route, globalDefault, revision);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={title}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={busy || !selected || selected.credential !== undefined}
          onClick={() => void confirm()}
        >
          {t(globalOnly ? 'onboarding.saveDefault' : 'onboarding.saveModel')}
        </Button>
      }
    >
      <div ref={mount} className="bh-root bh-onboarding-model-form">
        {request ? (
          <div className="bh-onboarding-request">
            <span className="bh-note">{t('onboarding.requestLabel')}</span>
            <p>{request}</p>
          </div>
        ) : null}
        <ModelPicker
          title={t('onboarding.model')}
          hint={t(globalOnly ? 'onboarding.defaultDescription' : 'onboarding.modelHint')}
          choice={{
            key: route ? JSON.stringify([route.provider, route.model]) : '',
            effort: route?.reasoningEffort ?? '',
          }}
          catalog={models}
          options={models.map((model) => ({
            value: JSON.stringify([model.provider, model.model]),
            label: model.modelName,
            hint: model.providerName + (model.credential ? ' · ' + t('onboarding.needsKey') : ''),
          }))}
          onChange={({ key, effort }) => {
            const [provider, model] = JSON.parse(key) as [string, string];
            setRoute({ provider, model, ...(effort ? { reasoningEffort: effort } : {}) });
          }}
          disabled={busy}
          t={t}
        />
        {!loaded ? <p role="status">{t('modelPreset.loading')}</p> : null}
        <SidebarCardList label={t('failure.openModels')}>
          <SidebarCardRow
            icon="settings"
            title={t('failure.openModels')}
            meta={
              selected?.credential || (loaded && models.length === 0)
                ? t('onboarding.keyHint')
                : t('onboarding.providerSettingsHint')
            }
            disabled={busy}
            onClick={() => {
              onClose();
              openModelsSettings();
            }}
          />
        </SidebarCardList>
        <Button variant="ghost" disabled={busy} onClick={() => void load()}>
          {t('onboarding.refreshModels')}
        </Button>
        <div className="bh-onboarding-model-scope">
          {!globalOnly ? (
            <Checkbox
              checked={globalDefault}
              onChange={setGlobalDefault}
              label={t('onboarding.globalCheckbox')}
              disabled={busy}
            />
          ) : null}
          <p className="bh-note">{t('onboarding.globalHint')}</p>
        </div>
        {error ? (
          <p role="alert" className="bh-error">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function OnboardingWelcome({
  actions,
  channelId,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const [modelLabel, setModelLabel] = useState('');
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const slug = store.getSnapshot().conversation.channel?.botSlug;
    void Promise.all([
      actions.modelCatalog(),
      slug ? actions.modelPlanState(slug) : Promise.resolve(undefined),
    ])
      .then(([catalog, plan]) => {
        const route = plan?.plan?.orchestrator ?? catalog.default;
        const model = catalog.models.find(
          (entry) => entry.provider === route?.provider && entry.model === route.model,
        );
        if (active)
          setModelLabel(
            route
              ? `${model?.modelName ?? route.model} · ${model?.providerName ?? route.provider}`
              : t('modelPreset.noPlan'),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [actions, channelId, state.modelOpen]);
  return (
    <div ref={mount} className="bh-onboarding-welcome" data-onboarding-welcome>
      <div className="bh-note">{t('onboarding.productMessage')}</div>
      <div className="bh-onboarding-welcome-heading">
        <strong>{t('onboarding.welcome')}</strong>
        <p>{t('onboarding.prompt')}</p>
      </div>
      <SidebarCardList className="bh-message-card-list" label={t('onboarding.prompt')}>
        {(
          [
            'onboarding.firstRequest',
            'onboarding.newsRequest',
            'onboarding.dailyRequest',
            'onboarding.testRequest',
          ] as const
        ).map((key) => (
          <SidebarCardRow
            key={key}
            title={t(key)}
            disabled={state.busy || store.getSnapshot().conversation.sending}
            onClick={() => void controller.request(channelId, t(key))}
          />
        ))}
      </SidebarCardList>
      <p className="bh-note">{t('onboarding.freeform')}</p>
      <SidebarCardList className="bh-message-card-list" label={t('onboarding.model')}>
        <SidebarCardRow
          icon="bot"
          title={t('onboarding.chooseModel')}
          meta={modelLabel || t('modelPreset.loading')}
          disabled={state.busy}
          dialog
          onClick={() => {
            const slug = store.getSnapshot().conversation.channel?.botSlug;
            if (slug) controller.chooseModel(channelId, slug);
          }}
        />
      </SidebarCardList>
      <Button variant="outline" className="bh-onboarding-create" onClick={requestBotCreation}>
        {t('roster.menu.createBot')}
      </Button>
    </div>
  );
}

export function OnboardingSurface({
  actions,
  companion,
  t,
}: {
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    let key = '';
    void controller.enter(companion);
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      const channel = snapshot.conversation.channel;
      const next = `${channel?.id}:${snapshot.conversation.revision}:${snapshot.git?.available}`;
      if (!active || key === next || snapshot.mode !== 'bot') return;
      key = next;
      if (controller.getSnapshot().receipt && channel?.botSlug)
        void controller.refresh(channel.botSlug);
      else if (snapshot.git?.available && controller.getSnapshot().error === 'git-not-found')
        void controller.enter(companion);
    });
    const timer = setInterval(() => {
      if (active && store.getSnapshot().mode === 'bot' && !controller.getSnapshot().busy)
        void controller.refresh(store.getSnapshot().conversation.channel?.botSlug);
    }, 5000);
    return () => {
      active = false;
      controller.pauseGuide();
      unsubscribe();
      clearInterval(timer);
    };
  }, [actions, companion]);
  const tourMount = useMountedResource<HTMLSpanElement>(() => {
    if (
      !state.guideOpen ||
      state.receipt?.tutorial !== 'active' ||
      state.modelOpen ||
      state.sendOpen
    )
      return;
    const welcome = document.querySelector('[data-onboarding-welcome]');
    if (!welcome) return;
    return highlightInternalControl(
      welcome,
      t('onboarding.tourTitle'),
      t('onboarding.tourHint'),
      t('common.close'),
      () => {
        controller.pauseGuide();
      },
    );
  }, [
    state.guideOpen,
    state.receipt?.tutorial,
    state.receipt?.completed,
    state.modelOpen,
    state.sendOpen,
  ]);
  const receipt = state.receipt;
  return (
    <div
      ref={mount}
      className="bh-root bh-onboarding"
      data-onboarding-state={receipt?.completed ? 'complete' : (receipt?.tutorial ?? 'preparing')}
    >
      <span ref={tourMount} hidden />
      {state.error ? (
        <div role="alert">
          {state.error}
          <Button variant="ghost" onClick={() => void controller.enter(companion)}>
            {t('onboarding.retryPrepare')}
          </Button>
        </div>
      ) : null}
      {receipt ? (
        <div className="bh-onboarding-actions">
          {receipt.completed ? (
            <span role="status">{t('onboarding.completed')}</span>
          ) : (
            <span>{t('onboarding.goal')}</span>
          )}
          {!receipt.completed && receipt.tutorial === 'not-started' ? (
            <>
              <Button variant="outline" onClick={() => void controller.refresh(undefined, 'start')}>
                {t('onboarding.start')}
              </Button>
            </>
          ) : null}
          {!receipt.completed &&
          (receipt.tutorial === 'paused' || (receipt.tutorial === 'active' && !state.guideOpen)) ? (
            <Button variant="ghost" onClick={() => void controller.refresh(undefined, 'continue')}>
              {t('onboarding.continue')}
            </Button>
          ) : null}
          {!receipt.completed && receipt.tutorial !== 'skipped' ? (
            <Button variant="ghost" onClick={() => void controller.refresh(undefined, 'skip')}>
              {t('onboarding.skip')}
            </Button>
          ) : null}
          {receipt.completed || receipt.tutorial !== 'not-started' ? (
            <Button variant="ghost" onClick={() => void controller.refresh(undefined, 'restart')}>
              {t('onboarding.restart')}
            </Button>
          ) : null}
          {state.pending ? (
            <Button variant="outline" onClick={() => controller.reviewPending()}>
              {t('onboarding.unsent')}
            </Button>
          ) : null}
          {!receipt.channelId
            ? store
                .getSnapshot()
                .bots.filter((bot) => !bot.paused && !bot.deleted)
                .map((bot) => (
                  <Button
                    key={bot.slug}
                    variant="outline"
                    onClick={() => void controller.refresh(bot.slug, undefined, undefined, true)}
                  >
                    {bot.displayName}
                  </Button>
                ))
            : null}
          {!receipt.channelId ? (
            <Button variant="outline" onClick={requestBotCreation}>
              {t('roster.menu.createBot')}
            </Button>
          ) : null}
        </div>
      ) : !state.error ? (
        <span role="status">{t('onboarding.preparing')}</span>
      ) : null}
      {state.modelOpen && state.modelTarget ? (
        <OnboardingModelDialog
          actions={actions}
          slug={state.modelTarget.slug}
          request={
            state.pending?.channelId === state.modelTarget.channelId
              ? state.pending.body
              : undefined
          }
          title={t('onboarding.modelTitle')}
          t={t}
          onClose={() => controller.closeModel()}
          onConfirm={(route, globalDefault, revision) =>
            controller.saveModel(route, globalDefault, revision)
          }
        />
      ) : null}
      {state.sendOpen && state.pending ? (
        <Modal
          open
          title={t('onboarding.sendTitle')}
          closeLabel={t('common.close')}
          onClose={() => controller.closeSend()}
          footer={
            <Button
              variant="primary"
              disabled={state.busy}
              onClick={() => void controller.sendPending()}
            >
              {t('onboarding.confirmSend')}
            </Button>
          }
        >
          <div className="bh-root bh-onboarding-model-form">
            <p className="bh-note">{t('onboarding.sendHint')}</p>
            <div className="bh-onboarding-request">
              <span className="bh-note">{t('onboarding.requestLabel')}</span>
              <p>{state.pending.body}</p>
            </div>
            <Button
              variant="outline"
              disabled={state.busy}
              onClick={() => controller.chooseModel(state.pending!.channelId, state.pending!.slug)}
            >
              {t('onboarding.chooseModel')}
            </Button>
            {state.error ? (
              <p role="alert" className="bh-error">
                {state.error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

export function DefaultModelSettings({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const mount = useMountedResource<HTMLDivElement>(() => {
    void actions
      .modelCatalog()
      .then((catalog) =>
        setLabel(
          catalog.default
            ? `${catalog.default.provider} / ${catalog.default.model}`
            : t('modelPreset.noPlan'),
        ),
      );
  }, [actions]);
  return (
    <div ref={mount} className="bh-settings-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('onboarding.defaultTitle')}</div>
        <div className="bh-settings-row-desc">{t('onboarding.defaultDescription')}</div>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label || t('onboarding.model')}
      </Button>
      {open ? (
        <OnboardingModelDialog
          actions={actions}
          title={t('onboarding.defaultTitle')}
          t={t}
          globalOnly
          onClose={() => setOpen(false)}
          onConfirm={async (route) => {
            await actions.onboardingModel(undefined, 0, route, true);
            setLabel(`${route.provider} / ${route.model}`);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
