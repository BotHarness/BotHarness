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
  const [editingPresetId, setEditingPresetId] = useState('');
  const [editingPresetRevision, setEditingPresetRevision] = useState<number>();
  const [name, setName] = useState('');
  const [orchestratorIndex, setOrchestratorIndex] = useState(0);
  const [orchestratorEffort, setOrchestratorEffort] = useState('');
  const [assignmentIndex, setAssignmentIndex] = useState(0);
  const [assignmentEffort, setAssignmentEffort] = useState('');
  const [customIndex, setCustomIndex] = useState(-1);
  const [customEffort, setCustomEffort] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const routeIndex = (models: ModelCatalogEntryView[], route: ModelRouteView): number =>
    models.findIndex((entry) => entry.provider === route.provider && entry.model === route.model);

  const setCustomDraft = (models: ModelCatalogEntryView[], route: ModelRouteView): void => {
    setCustomIndex(routeIndex(models, route));
    setCustomEffort(route.reasoningEffort ?? '');
  };

  const loadPlanOnMount = useCallback(
    (element: HTMLElement | null): void => {
      const request = ++planRequest.current;
      if (element === null) return;
      void Promise.all([actions.modelPlan(slug), actions.modelPresets()]).then(
        ([current, saved]) => {
          if (planRequest.current !== request) return;
          setPlan((previous) =>
            (previous?.revision ?? 0) > (current?.revision ?? 0) ? previous : current,
          );
          setPresets(saved);
          setSelectedPreset(
            saved.find((preset) => preset.id === current?.sourcePresetId)?.id ?? '',
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
        saved.find((preset) => preset.id === current?.sourcePresetId)?.id ??
          saved.find((preset) => preset.id === selectedPreset)?.id ??
          '',
      );
      if (current !== undefined) setCustomDraft(models, current.orchestrator);
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
  const selectedCustom = catalog?.[customIndex];
  const hasPlanError = planLoadError && plan === undefined;
  const planLabel = plan?.sourcePresetId === '' ? t('modelPreset.custom') : plan?.sourcePresetName;
  const routeOf = (entry: ModelCatalogEntryView, effort: string): ModelRouteView => ({
    provider: entry.provider,
    model: entry.model,
    ...(effort === '' ? {} : { reasoningEffort: effort }),
  });

  const createAndApply = async (): Promise<void> => {
    if (
      busy ||
      selectedOrchestrator === undefined ||
      selectedAssignment === undefined ||
      (editingPresetId !== '' && editingPresetRevision === undefined)
    )
      return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      if (editingPresetId !== '') {
        if (editingPresetRevision === undefined) return;
        const updated = await actions.updateModelPreset(
          editingPresetId,
          editingPresetRevision,
          name,
          routeOf(selectedOrchestrator, orchestratorEffort),
          routeOf(selectedAssignment, assignmentEffort),
        );
        setPresets((current) =>
          current.map((preset) => (preset.id === updated.id ? updated : preset)),
        );
        setEditingPresetId('');
        setEditingPresetRevision(undefined);
        setName('');
        setNotice(t('modelPreset.futureOnly'));
        return;
      }
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
      if (catalog !== undefined) setCustomDraft(catalog, applied.orchestrator);
    } catch (failure) {
      const message = errorMessage(failure);
      setError(message);
      if (editingPresetId !== '' && message.includes('Model Preset changed;')) {
        const fresh = await actions.modelPresets().catch(() => undefined);
        if (fresh !== undefined) setPresets(fresh);
      }
    } finally {
      setBusy(false);
    }
  };

  const applySelected = async (): Promise<void> => {
    if (busy || selectedPreset === '') return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const applied = await actions.applyModelPreset(slug, selectedPreset);
      setPlan(applied);
      if (catalog !== undefined) setCustomDraft(catalog, applied.orchestrator);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const editSelected = (): void => {
    const preset = presets.find((item) => item.id === selectedPreset);
    if (preset === undefined || catalog === undefined) return;
    const orchestrator = routeIndex(catalog, preset.orchestrator);
    const assignment = routeIndex(catalog, preset.assignmentDefault);
    if (orchestrator < 0 || assignment < 0) {
      setError(t('modelPreset.routeUnavailable'));
      return;
    }
    setEditingPresetId(preset.id);
    setEditingPresetRevision(preset.revision);
    setName(preset.name);
    setOrchestratorIndex(orchestrator);
    setOrchestratorEffort(preset.orchestrator.reasoningEffort ?? '');
    setAssignmentIndex(assignment);
    setAssignmentEffort(preset.assignmentDefault.reasoningEffort ?? '');
    setError(undefined);
    setNotice(undefined);
  };

  const customize = async (): Promise<void> => {
    if (busy || selectedCustom === undefined || plan === undefined) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      setPlan(await actions.customizeModelPlan(slug, routeOf(selectedCustom, customEffort)));
      setSelectedPreset('');
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
      {presets.length > 0 && (
        <div className="bh-model-preset-quick">
          <label>
            {t('modelPreset.quickSwitch')}
            <select
              className="bh-profile-policy-select"
              value={selectedPreset}
              onChange={(event) => setSelectedPreset(event.target.value)}
            >
              <option value="" disabled>
                {t('modelPreset.choosePreset')}
              </option>
              {presets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name} · {t('modelPreset.revision', { revision: preset.revision })}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="outline"
            disabled={busy || selectedPreset === ''}
            onClick={() => void applySelected()}
          >
            {t('modelPreset.switch')}
          </Button>
        </div>
      )}
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
                  : `${planLabel} · ${routeLabel(plan.orchestrator, t('modelPreset.providerDefault'))} · ${t('modelPreset.revision', { revision: plan.revision })}`}
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
                  <div className="bh-model-preset-edit-preset">
                    <Button
                      variant="outline"
                      disabled={busy || selectedPreset === ''}
                      onClick={editSelected}
                    >
                      {t('modelPreset.editSelected')}
                    </Button>
                  </div>
                )}
                <div className="bh-model-preset-form">
                  <strong>
                    {editingPresetId === '' ? t('modelPreset.create') : t('modelPreset.edit')}
                  </strong>
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
                    {editingPresetId === ''
                      ? t('modelPreset.createApply')
                      : t('modelPreset.saveTemplate')}
                  </Button>
                  {editingPresetId !== '' && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setEditingPresetId('');
                        setEditingPresetRevision(undefined);
                        setName('');
                      }}
                    >
                      {t('common.cancel')}
                    </Button>
                  )}
                </div>
                {plan !== undefined && (
                  <div className="bh-model-preset-custom">
                    <strong>{t('modelPreset.customize')}</strong>
                    <span className="bh-note">{t('modelPreset.customizeHint')}</span>
                    <label>
                      {t('modelPreset.orchestrator')}
                      <select
                        className="bh-profile-policy-select"
                        value={customIndex}
                        onChange={(event) => {
                          setCustomIndex(Number(event.target.value));
                          setCustomEffort('');
                        }}
                      >
                        {customIndex < 0 && (
                          <option value={-1}>{t('modelPreset.routeUnavailable')}</option>
                        )}
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
                        value={customEffort}
                        onChange={(event) => setCustomEffort(event.target.value)}
                      >
                        <option value="">{t('modelPreset.providerDefault')}</option>
                        {selectedCustom?.efforts.map((effort) => (
                          <option key={effort.id} value={effort.id}>
                            {effort.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      disabled={busy || selectedCustom === undefined}
                      onClick={() => void customize()}
                    >
                      {t('modelPreset.saveCustom')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </details>
      {notice !== undefined && <span className="bh-note">{notice}</span>}
      {error !== undefined && (
        <span className="bh-profile-error" role="alert">
          {error}
        </span>
      )}
      {hasPlanError && (
        <span className="bh-profile-error" role="alert">
          {t('modelPreset.loadFailed')}
        </span>
      )}
    </section>
  );
}
