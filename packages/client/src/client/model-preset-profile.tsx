import { useCallback, useRef, useState, type ReactElement } from 'react';
import { Button, IconChevronRightOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type {
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelPlanView,
  ModelPlanStateView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';

function routeLabel(route: ModelRouteView, defaultLabel: string): string {
  return `${route.provider} / ${route.model} · ${route.reasoningEffort ?? defaultLabel}`;
}

const modelKey = (route: Pick<ModelRouteView, 'provider' | 'model'>): string =>
  JSON.stringify([route.provider, route.model]);

function assignmentDraftOf(plan: ModelPlanView): AssignmentModelOptionView[] {
  return (
    plan.assignmentModels ?? [
      {
        provider: plan.assignmentDefault.provider,
        model: plan.assignmentDefault.model,
        allowedEfforts: [plan.assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: plan.assignmentDefault.reasoningEffort ?? '',
      },
    ]
  ).map((option) => ({ ...option, allowedEfforts: [...option.allowedEfforts] }));
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
  const [repair, setRepair] = useState<ModelPlanStateView['repair']>();
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
  const [assignmentModels, setAssignmentModels] = useState<AssignmentModelOptionView[]>([]);
  const [defaultAssignmentKey, setDefaultAssignmentKey] = useState('');
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
      void Promise.all([actions.modelPlanState(slug), actions.modelPresets()]).then(
        ([state, saved]) => {
          if (planRequest.current !== request) return;
          const current = state.plan;
          setRepair(state.repair);
          setPlan((previous) =>
            (previous?.revision ?? 0) > (current?.revision ?? 0) ? previous : current,
          );
          if (current !== undefined) {
            setAssignmentModels(assignmentDraftOf(current));
            setDefaultAssignmentKey(modelKey(current.assignmentDefault));
          }
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
    setError(undefined);
    try {
      const [models, saved, state] = await Promise.all([
        actions.modelCatalog(),
        actions.modelPresets(),
        actions.modelPlanState(slug),
      ]);
      if (planRequest.current !== request) return;
      const current = state.plan;
      setRepair(state.repair);
      setCatalog(models);
      setPresets(saved);
      setSelectedPreset(
        saved.find((preset) => preset.id === current?.sourcePresetId)?.id ??
          saved.find((preset) => preset.id === selectedPreset)?.id ??
          '',
      );
      if (current !== undefined) setCustomDraft(models, current.orchestrator);
      if (current !== undefined) {
        setAssignmentModels(assignmentDraftOf(current));
        setDefaultAssignmentKey(modelKey(current.assignmentDefault));
      }
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
      planRequest.current += 1;
      setPlan(applied);
      setRepair(undefined);
      if (catalog !== undefined) setCustomDraft(catalog, applied.orchestrator);
      setAssignmentModels(assignmentDraftOf(applied));
      setDefaultAssignmentKey(modelKey(applied.assignmentDefault));
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
      planRequest.current += 1;
      setPlan(applied);
      setRepair(undefined);
      if (catalog !== undefined) setCustomDraft(catalog, applied.orchestrator);
      else void load();
      setAssignmentModels(assignmentDraftOf(applied));
      setDefaultAssignmentKey(modelKey(applied.assignmentDefault));
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

  const refreshRepair = async (): Promise<void> => {
    const request = planRequest.current;
    const state = await actions.modelPlanState(slug);
    if (planRequest.current === request) setRepair(state.repair);
  };

  const customize = async (): Promise<void> => {
    if (busy || selectedCustom === undefined || plan === undefined) return;
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const applied = await actions.customizeModelPlan(slug, routeOf(selectedCustom, customEffort));
      planRequest.current += 1;
      setPlan(applied);
      setSelectedPreset('');
      await refreshRepair();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const saveAssignmentModels = async (): Promise<void> => {
    if (busy || plan === undefined) return;
    const chosen = assignmentModels.find((option) => modelKey(option) === defaultAssignmentKey);
    if (chosen === undefined) return;
    const assignmentDefault: ModelRouteView = {
      provider: chosen.provider,
      model: chosen.model,
      ...(chosen.defaultEffort === '' ? {} : { reasoningEffort: chosen.defaultEffort }),
    };
    setBusy(true);
    setError(undefined);
    setNotice(undefined);
    try {
      const applied = await actions.setModelPlanAssignments(
        slug,
        plan.revision,
        assignmentDefault,
        assignmentModels,
      );
      planRequest.current += 1;
      setPlan(applied);
      setSelectedPreset('');
      setAssignmentModels(assignmentDraftOf(applied));
      setDefaultAssignmentKey(modelKey(applied.assignmentDefault));
      await refreshRepair();
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
              {repair !== undefined
                ? t('modelPreset.repairNeeded')
                : hasPlanError
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
                <span>
                  {t('modelPreset.assignmentAllowed')}:{' '}
                  {assignmentDraftOf(plan)
                    .map(
                      (option) =>
                        `${option.provider} / ${option.model} (${option.allowedEfforts.map((effort) => effort || t('modelPreset.providerDefault')).join(', ')})`,
                    )
                    .join(' · ')}
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
                {plan !== undefined && (
                  <div className="bh-model-preset-assignment">
                    <strong>{t('modelPreset.assignmentAllowed')}</strong>
                    <span className="bh-note">{t('modelPreset.assignmentHint')}</span>
                    {catalog.map((entry) => {
                      const key = modelKey(entry);
                      const option = assignmentModels.find((item) => modelKey(item) === key);
                      return (
                        <div key={key} className="bh-model-preset-assignment-row">
                          <label>
                            <input
                              type="checkbox"
                              checked={option !== undefined}
                              onChange={(event) => {
                                const next = event.target.checked
                                  ? [
                                      ...assignmentModels,
                                      {
                                        provider: entry.provider,
                                        model: entry.model,
                                        allowedEfforts: [
                                          entry.defaultEffort ?? entry.efforts[0]?.id ?? '',
                                        ],
                                        defaultEffort:
                                          entry.defaultEffort ?? entry.efforts[0]?.id ?? '',
                                      },
                                    ]
                                  : assignmentModels.filter((item) => modelKey(item) !== key);
                                setAssignmentModels(next);
                                if (!next.some((item) => modelKey(item) === defaultAssignmentKey))
                                  setDefaultAssignmentKey(
                                    next[0] === undefined ? '' : modelKey(next[0]),
                                  );
                              }}
                            />
                            {entry.providerName} / {entry.modelName}
                          </label>
                          {option !== undefined && (
                            <div className="bh-model-preset-assignment-efforts">
                              <span>{t('modelPreset.allowedEfforts')}</span>
                              {[
                                { id: '', name: t('modelPreset.providerDefault') },
                                ...entry.efforts,
                              ].map((effort) => (
                                <label key={effort.id}>
                                  <input
                                    type="checkbox"
                                    checked={option.allowedEfforts.includes(effort.id)}
                                    disabled={
                                      option.allowedEfforts.length === 1 &&
                                      option.allowedEfforts.includes(effort.id)
                                    }
                                    onChange={(event) => {
                                      const allowedEfforts = event.target.checked
                                        ? [...option.allowedEfforts, effort.id]
                                        : option.allowedEfforts.filter((id) => id !== effort.id);
                                      if (allowedEfforts.length === 0) return;
                                      setAssignmentModels((current) =>
                                        current.map((item) =>
                                          modelKey(item) === key
                                            ? {
                                                ...item,
                                                allowedEfforts,
                                                defaultEffort: allowedEfforts.includes(
                                                  item.defaultEffort,
                                                )
                                                  ? item.defaultEffort
                                                  : allowedEfforts[0]!,
                                              }
                                            : item,
                                        ),
                                      );
                                    }}
                                  />
                                  {effort.name}
                                </label>
                              ))}
                              <label>
                                {t('modelPreset.defaultEffort')}
                                <select
                                  className="bh-profile-policy-select"
                                  value={option.defaultEffort}
                                  onChange={(event) =>
                                    setAssignmentModels((current) =>
                                      current.map((item) =>
                                        modelKey(item) === key
                                          ? { ...item, defaultEffort: event.target.value }
                                          : item,
                                      ),
                                    )
                                  }
                                >
                                  {option.allowedEfforts.map((effort) => (
                                    <option key={effort} value={effort}>
                                      {entry.efforts.find((candidate) => candidate.id === effort)
                                        ?.name ?? t('modelPreset.providerDefault')}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <label>
                      {t('modelPreset.assignment')}
                      <select
                        className="bh-profile-policy-select"
                        value={defaultAssignmentKey}
                        onChange={(event) => setDefaultAssignmentKey(event.target.value)}
                      >
                        {assignmentModels.length === 0 && (
                          <option value="">{t('modelPreset.chooseAssignment')}</option>
                        )}
                        {assignmentModels.map((option) => (
                          <option key={modelKey(option)} value={modelKey(option)}>
                            {option.provider} / {option.model}
                          </option>
                        ))}
                      </select>
                    </label>
                    <Button
                      variant="outline"
                      disabled={
                        busy || assignmentModels.length === 0 || defaultAssignmentKey === ''
                      }
                      onClick={() => void saveAssignmentModels()}
                    >
                      {t('modelPreset.saveAssignment')}
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </details>
      {repair !== undefined && (
        <span className="bh-profile-error" role="alert">
          {repair.code === 'legacy-ambiguous'
            ? t('modelPreset.legacyAmbiguous', { model: repair.legacyModel ?? '' })
            : repair.code === 'legacy-missing'
              ? t('modelPreset.legacyMissing', { model: repair.legacyModel ?? '' })
              : t('modelPreset.routeRepair')}
        </span>
      )}
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
