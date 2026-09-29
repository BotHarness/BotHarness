import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogEntryView,
  ModelPlanView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

function routeLabel(route: ModelRouteView, defaultLabel: string): string {
  return `${route.provider} / ${route.model} · ${route.reasoningEffort ?? defaultLabel}`;
}

export function ModelPresetProfile({
  slug,
  actions,
  t,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [catalog, setCatalog] = useState<ModelCatalogEntryView[]>();
  const [presets, setPresets] = useState<ModelPresetView[]>([]);
  const [plan, setPlan] = useState<ModelPlanView>();
  const [planLoadError, setPlanLoadError] = useState(false);
  const planRequest = useRef(0);
  const [selectedPreset, setSelectedPreset] = useState('');
  const [name, setName] = useState('');
  const [orchestratorIndex, setOrchestratorIndex] = useState(0);
  const [orchestratorEffort, setOrchestratorEffort] = useState('');
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [assignmentEffort, setAssignmentEffort] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const loadPlanOnMount = useCallback(
    (element: HTMLElement | null): void => {
      const request = ++planRequest.current;
      if (element === null) return;
      void actions.modelPlan(slug).then(
        (current) => {
          if (planRequest.current === request)
            setPlan((previous) =>
              (previous?.revision ?? 0) > (current?.revision ?? 0) ? previous : current,
            );
        },
        () => {
          if (planRequest.current === request) setPlanLoadError(true);
        },
      );
    },
    [actions, slug],
  );

  const load = async (): Promise<void> => {
    const request = planRequest.current;
    setCatalog(undefined);
    setError(undefined);
    try {
      const [models, saved, current] = await Promise.all([
        actions.modelCatalog(),
        actions.modelPresets(),
        actions.modelPlan(slug),
      ]);
      if (planRequest.current !== request) return;
      setCatalog(models);
      setPresets(saved);
      setSelectedPreset(
        saved.find((preset) => preset.id === current?.sourcePresetId)?.id ?? saved[0]?.id ?? '',
      );
      setPlan((previous) =>
        (previous?.revision ?? 0) > (current?.revision ?? 0) ? previous : current,
      );
      setPlanLoadError(false);
    } catch (failure) {
      if (planRequest.current === request) setError(errorMessage(failure));
    }
  };

  const selectedOrchestrator = catalog?.[orchestratorIndex];
  const selectedAssignment = catalog?.[assignmentIndex];
  const hasPlanError = planLoadError && plan === undefined;
  const routeOf = (entry: ModelCatalogEntryView, effort: string): ModelRouteView => ({
    provider: entry.provider,
    model: entry.model,
    ...(effort === '' ? {} : { reasoningEffort: effort }),
  });

  const createAndApply = async (): Promise<void> => {
    if (busy || selectedOrchestrator === undefined || selectedAssignment === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const preset = await actions.createModelPreset(
        name,
        routeOf(selectedOrchestrator, orchestratorEffort),
        routeOf(selectedAssignment, assignmentEffort),
      );
      setPresets((current) => [...current, preset]);
      setSelectedPreset(preset.id);
      setName('');
      const applied = await actions.applyModelPreset(slug, preset.id);
      setPlan(applied);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const applySelected = async (): Promise<void> => {
    if (busy || selectedPreset === '') return;
    setBusy(true);
    setError(undefined);
    try {
      setPlan(await actions.applyModelPreset(slug, selectedPreset));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      ref={loadPlanOnMount}
      className="bh-profile-section bh-profile-policy-section"
      aria-label={t('modelPreset.title')}
    >
      <details
        className="bh-profile-policy-details"
        onToggle={(event) => {
          if (event.currentTarget.open) void load();
        }}
      >
        <summary className="bh-profile-policy-summary">
          <span className="bh-profile-policy-summary-text">
            <strong>{t('modelPreset.title')}</strong>
            <span>
              {hasPlanError
                ? t('modelPreset.loadFailed')
                : plan === undefined
                  ? t('modelPreset.noPlan')
                  : `${plan.sourcePresetName} · ${routeLabel(plan.orchestrator, t('modelPreset.providerDefault'))} · ${t('modelPreset.revision', { revision: plan.revision })}`}
            </span>
          </span>
          <IconChevronRightOutlineRegular />
        </summary>
        <div className="bh-profile-cards">
          <div className="bh-profile-card">
            {plan === undefined ? null : (
              <div className="bh-model-preset-effective">
                <strong>{t('modelPreset.effective')}</strong>
                <span>
                  {t('modelPreset.orchestrator')}:{' '}
                  {routeLabel(plan.orchestrator, t('modelPreset.providerDefault'))}
                </span>
                <span>
                  {t('modelPreset.assignment')}:{' '}
                  {routeLabel(plan.assignmentDefault, t('modelPreset.providerDefault'))}
                </span>
              </div>
            )}
            {catalog === undefined ? (
              <span className="bh-note">{t('modelPreset.loading')}</span>
            ) : catalog.length === 0 ? (
              <span className="bh-note">{t('modelPreset.emptyCatalog')}</span>
            ) : (
              <>
                {presets.length > 0 && (
                  <div className="bh-model-preset-apply">
                    <label>
                      {t('modelPreset.saved')}
                      <select
                        className="bh-profile-policy-select"
                        value={selectedPreset}
                        onChange={(event) => setSelectedPreset(event.target.value)}
                      >
                        {presets.map((preset) => (
                          <option key={preset.id} value={preset.id}>
                            {preset.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button variant="outline" disabled={busy} onClick={() => void applySelected()}>
                      {t('modelPreset.apply')}
                    </Button>
                  </div>
                )}
                <div className="bh-model-preset-form">
                  <strong>{t('modelPreset.create')}</strong>
                  <label>
                    {t('modelPreset.name')}
                    <input
                      className="bh-profile-policy-select"
                      value={name}
                      maxLength={100}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <label>
                    {t('modelPreset.orchestrator')}
                    <select
                      className="bh-profile-policy-select"
                      value={orchestratorIndex}
                      onChange={(event) => {
                        setOrchestratorIndex(Number(event.target.value));
                        setOrchestratorEffort('');
                      }}
                    >
                      {catalog.map((entry, index) => (
                        <option key={`${entry.provider}/${entry.model}`} value={index}>
                          {entry.providerName} / {entry.modelName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('modelPreset.effort')}
                    <select
                      className="bh-profile-policy-select"
                      value={orchestratorEffort}
                      onChange={(event) => setOrchestratorEffort(event.target.value)}
                    >
                      <option value="">{t('modelPreset.providerDefault')}</option>
                      {selectedOrchestrator?.efforts.map((effort) => (
                        <option key={effort.id} value={effort.id}>
                          {effort.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('modelPreset.assignment')}
                    <select
                      className="bh-profile-policy-select"
                      value={assignmentIndex}
                      onChange={(event) => {
                        setAssignmentIndex(Number(event.target.value));
                        setAssignmentEffort('');
                      }}
                    >
                      {catalog.map((entry, index) => (
                        <option key={`${entry.provider}/${entry.model}`} value={index}>
                          {entry.providerName} / {entry.modelName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('modelPreset.effort')}
                    <select
                      className="bh-profile-policy-select"
                      value={assignmentEffort}
                      onChange={(event) => setAssignmentEffort(event.target.value)}
                    >
                      <option value="">{t('modelPreset.providerDefault')}</option>
                      {selectedAssignment?.efforts.map((effort) => (
                        <option key={effort.id} value={effort.id}>
                          {effort.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    variant="outline"
                    disabled={busy || name.trim() === ''}
                    onClick={() => void createAndApply()}
                  >
                    {t('modelPreset.createApply')}
                  </Button>
                </div>
              </>
            )}
            {error === undefined ? null : (
              <span className="bh-profile-error" role="alert">
                {error}
              </span>
            )}
            {hasPlanError ? (
              <span className="bh-profile-error" role="alert">
                {t('modelPreset.loadFailed')}
              </span>
            ) : null}
          </div>
        </div>
      </details>
    </section>
  );
}
