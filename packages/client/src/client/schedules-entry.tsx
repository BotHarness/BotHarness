import { useId, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import {
  Button,
  IconPlusOutlineRegular,
  Input,
  SegmentedControl,
  Switch,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  errorMessage,
  type BotScheduleFiringView,
  type BotScheduleTrigger,
  type BotScheduleView,
} from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';

export const SCHEDULE_COST_WARNING_SECONDS = 15 * 60;
const REFRESH_MS = 30_000;

type CadenceUnit = 'minutes' | 'hours' | 'daily';

export interface ScheduleForm {
  title: string;
  prompt: string;
  unit: CadenceUnit;
  every: string;
  time: string;
  timeZone: string;
  locked: boolean;
}

const createRequests = new Map<string, number>();
const listeners = new Set<() => void>();
function requestCreate(slug: string): void {
  createRequests.set(slug, (createRequests.get(slug) ?? 0) + 1);
  for (const listener of listeners) listener();
}
function subscribeCreate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function emptyScheduleForm(timeZone = browserTimeZone()): ScheduleForm {
  return {
    title: '',
    prompt: '',
    unit: 'hours',
    every: '1',
    time: '09:00',
    timeZone,
    locked: false,
  };
}

export function scheduleFormOf(schedule: BotScheduleView): ScheduleForm {
  const base = { title: schedule.title, prompt: schedule.prompt, locked: schedule.locked };
  const trigger = schedule.trigger;
  if (trigger.kind === 'daily')
    return { ...base, unit: 'daily', every: '1', time: trigger.time, timeZone: trigger.timeZone };
  const hours = trigger.everySeconds % 3600 === 0;
  return {
    ...base,
    unit: hours ? 'hours' : 'minutes',
    every: String(trigger.everySeconds / (hours ? 3600 : 60)),
    time: '09:00',
    timeZone: browserTimeZone(),
  };
}

export function scheduleTriggerOf(form: ScheduleForm): BotScheduleTrigger | undefined {
  if (form.unit === 'daily')
    return /^\d{2}:\d{2}$/u.test(form.time) && form.timeZone.trim().length > 0
      ? { kind: 'daily', time: form.time, timeZone: form.timeZone.trim() }
      : undefined;
  const every = Number(form.every);
  if (!Number.isSafeInteger(every) || every < 1) return undefined;
  return { kind: 'every', everySeconds: every * (form.unit === 'hours' ? 3600 : 60) };
}

export function scheduleCadenceLabel(trigger: BotScheduleTrigger, t: BotHarnessTranslate): string {
  if (trigger.kind === 'daily') return t('schedule.cadence.daily', { time: trigger.time });
  if (trigger.everySeconds % 3600 === 0) {
    const n = trigger.everySeconds / 3600;
    return n === 1 ? t('schedule.cadence.hour') : t('schedule.cadence.hours', { n });
  }
  const n = Math.round(trigger.everySeconds / 60);
  return n === 1 ? t('schedule.cadence.minute') : t('schedule.cadence.minutes', { n });
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatScheduleTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === now.toDateString()
    ? clock
    : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`;
}

const STATE_TONE = {
  pending: 'warning',
  observed: 'info',
  handled: 'success',
  coalesced: 'neutral',
  skipped: 'quiet',
} as const;

function FiringTag({
  firing,
  t,
}: {
  firing: BotScheduleFiringView;
  t: BotHarnessTranslate;
}): ReactElement {
  return <Tag tone={STATE_TONE[firing.state]}>{t(`schedule.state.${firing.state}`)}</Tag>;
}

export function BotSchedulesHeaderAction({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <></>;
  return (
    <Tooltip label={t('schedule.add')} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-channel-sidebar-entry-action"
        aria-label={t('schedule.add')}
        aria-haspopup="dialog"
        onClick={() => requestCreate(botSlug)}
      >
        <IconPlusOutlineRegular size={16} />
      </button>
    </Tooltip>
  );
}

function ScheduleEditor({
  open,
  initial,
  editing,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
  history,
  onOpenSession,
  t,
}: {
  open: boolean;
  initial: ScheduleForm;
  editing: BotScheduleView | undefined;
  busy: boolean;
  error: string | undefined;
  onClose: () => void;
  onSave: (form: ScheduleForm) => void;
  onDelete: () => void;
  history: BotScheduleFiringView[] | undefined;
  onOpenSession: (sessionId: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trigger = scheduleTriggerOf(form);
  const costly = trigger?.kind === 'every' && trigger.everySeconds < SCHEDULE_COST_WARNING_SECONDS;
  const valid =
    trigger !== undefined && form.title.trim().length > 0 && form.prompt.trim().length > 0;
  const set = (patch: Partial<ScheduleForm>): void =>
    setForm((current) => ({ ...current, ...patch }));
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing === undefined ? t('schedule.add') : t('schedule.edit')}
      closeLabel={t('schedule.close')}
      className="bh-schedule-modal"
      footer={
        <div className="bh-schedule-modal-footer">
          {editing === undefined ? null : confirmDelete ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={onDelete}>
              {t('schedule.deleteConfirm')}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => setConfirmDelete(true)}
            >
              {t('schedule.delete')}
            </Button>
          )}
          <span className="bh-schedule-modal-spacer" />
          <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
            {t('schedule.cancel')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={busy || !valid}
            onClick={() => onSave(form)}
          >
            {editing === undefined ? t('schedule.create') : t('schedule.save')}
          </Button>
        </div>
      }
    >
      <div className="bh-schedule-form" data-schedule-form="">
        <label className="bh-schedule-field">
          <span>{t('schedule.form.title')}</span>
          <Input
            value={form.title}
            maxLength={120}
            placeholder={t('schedule.form.titlePlaceholder')}
            onChange={(event) => set({ title: event.target.value })}
          />
        </label>
        <label className="bh-schedule-field">
          <span>{t('schedule.form.prompt')}</span>
          <textarea
            rows={4}
            maxLength={4000}
            value={form.prompt}
            placeholder={t('schedule.form.promptPlaceholder')}
            onChange={(event) => set({ prompt: event.currentTarget.value })}
          />
        </label>
        <SegmentedControl
          id={`${id}-unit`}
          label={t('schedule.form.cadence')}
          value={form.unit}
          options={[
            { value: 'minutes', label: t('schedule.form.unit.minutes') },
            { value: 'hours', label: t('schedule.form.unit.hours') },
            { value: 'daily', label: t('schedule.form.unit.daily') },
          ]}
          onChange={(unit) => set({ unit })}
        />
        {form.unit === 'daily' ? (
          <div className="bh-schedule-row">
            <label className="bh-schedule-field">
              <span>{t('schedule.form.time')}</span>
              <Input
                type="time"
                value={form.time}
                onChange={(event) => set({ time: event.target.value })}
              />
            </label>
            <label className="bh-schedule-field bh-schedule-zone">
              <span>{t('schedule.form.timeZone')}</span>
              <Input
                value={form.timeZone}
                onChange={(event) => set({ timeZone: event.target.value })}
              />
            </label>
          </div>
        ) : (
          <label className="bh-schedule-field">
            <span>
              {form.unit === 'hours'
                ? t('schedule.form.everyHours')
                : t('schedule.form.everyMinutes')}
            </span>
            <Input
              type="number"
              min={1}
              step={1}
              value={form.every}
              onChange={(event) => set({ every: event.target.value })}
            />
          </label>
        )}
        <div className="bh-schedule-lock">
          <span className="bh-card-icon" aria-hidden="true">
            <ChannelSidebarIcon name={form.locked ? 'lock' : 'lock-open'} size={16} />
          </span>
          <span className="bh-card-body">
            <span className="bh-card-title">{t('schedule.form.lock')}</span>
            <span className="bh-card-meta">{t('schedule.form.lockHint')}</span>
          </span>
          <Switch
            checked={form.locked}
            label={t('schedule.form.lock')}
            onChange={(locked) => set({ locked })}
          />
        </div>
        {costly ? (
          <p className="bh-schedule-warning" role="note">
            {t('schedule.form.cost')}
          </p>
        ) : null}
        {error === undefined ? null : (
          <p className="bh-schedule-error" role="alert">
            {error}
          </p>
        )}
        {editing === undefined ? null : (
          <section className="bh-schedule-history" aria-label={t('schedule.history')}>
            <h4>{t('schedule.history')}</h4>
            {history === undefined ? (
              <LoadingSkeleton kind="sidebar" label={t('schedule.loading')} />
            ) : history.length === 0 ? (
              <p className="bh-schedule-muted">{t('schedule.historyEmpty')}</p>
            ) : (
              <ol>
                {history.map((firing) => (
                  <li key={firing.id} className="bh-schedule-firing">
                    <span className="bh-schedule-firing-time">
                      {formatScheduleTime(firing.occurrenceAt)}
                    </span>
                    {firing.trigger === 'manual' ? (
                      <Tag tone="outline">{t('schedule.history.manual')}</Tag>
                    ) : null}
                    <FiringTag firing={firing} t={t} />
                    {firing.sessionId === undefined ? null : (
                      <button
                        type="button"
                        className="bh-schedule-link"
                        onClick={() => onOpenSession(firing.sessionId!)}
                      >
                        {t('schedule.openSession')}
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

export function ScheduleDialog({
  botSlug,
  scheduleId,
  actions,
  t,
  onClose,
  onChanged,
}: {
  botSlug: string;
  scheduleId: string | undefined;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
  onClose: () => void;
  onChanged?: () => void;
}): ReactElement {
  const [schedule, setSchedule] = useState<BotScheduleView | null | undefined>(
    scheduleId === undefined ? null : undefined,
  );
  const [history, setHistory] = useState<BotScheduleFiringView[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (scheduleId === undefined) return;
    let live = true;
    void actions
      .botSchedules(botSlug)
      .then((rows) => {
        if (live) setSchedule(rows.find((row) => row.id === scheduleId) ?? null);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setSchedule(null);
        setError(errorMessage(cause));
      });
    void actions
      .botScheduleHistory(botSlug, scheduleId)
      .then((rows) => {
        if (live) setHistory(rows);
      })
      .catch(() => {
        if (live) setHistory([]);
      });
    return () => {
      live = false;
    };
  }, [actions, botSlug, scheduleId]);

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    void action()
      .then(() => {
        onChanged?.();
        onClose();
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  if (schedule === undefined)
    return (
      <>
        <span ref={mount} hidden />
      </>
    );
  if (schedule === null && scheduleId !== undefined)
    return (
      <>
        <span ref={mount} hidden />
        <Modal open onClose={onClose} title={t('schedule.edit')} closeLabel={t('schedule.close')}>
          <p className="bh-schedule-muted" role="status">
            {error ?? t('schedule.missing')}
          </p>
        </Modal>
      </>
    );
  const editing = schedule ?? undefined;
  return (
    <>
      <span ref={mount} hidden />
      <ScheduleEditor
        open
        initial={editing === undefined ? emptyScheduleForm() : scheduleFormOf(editing)}
        editing={editing}
        busy={busy}
        error={error}
        history={history}
        onClose={onClose}
        onSave={(form) => {
          const trigger = scheduleTriggerOf(form);
          if (trigger === undefined) return;
          run(() =>
            editing === undefined
              ? actions.createBotSchedule(botSlug, {
                  title: form.title,
                  prompt: form.prompt,
                  trigger,
                  ...(form.locked ? { locked: true } : {}),
                })
              : actions.updateBotSchedule(botSlug, editing.id, {
                  title: form.title,
                  prompt: form.prompt,
                  trigger,
                  ...(form.locked === editing.locked ? {} : { locked: form.locked }),
                }),
          );
        }}
        onDelete={() => {
          if (editing !== undefined) run(() => actions.deleteBotSchedule(botSlug, editing.id));
        }}
        onOpenSession={(sessionId) => {
          onClose();
          void actions.openSession(sessionId);
        }}
        t={t}
      />
    </>
  );
}

export function BotSchedulesEntry({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const [schedules, setSchedules] = useState<BotScheduleView[] | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [editor, setEditor] = useState<{ key: number; scheduleId: string | undefined }>();
  const [toggling, setToggling] = useState<string | undefined>();
  const active = useRef<string | undefined>(undefined);
  const editorKey = useRef(0);
  const createRevision = useSyncExternalStore(
    subscribeCreate,
    () => (botSlug === undefined ? 0 : (createRequests.get(botSlug) ?? 0)),
    () => 0,
  );
  const seenCreate = useRef(createRevision);
  if (seenCreate.current !== createRevision) {
    seenCreate.current = createRevision;
    editorKey.current += 1;
    setEditor({ key: editorKey.current, scheduleId: undefined });
  }

  const refresh = async (slug: string): Promise<void> => {
    try {
      const rows = await actions.botSchedules(slug);
      if (active.current !== slug) return;
      setSchedules(rows);
      setLoadError(undefined);
    } catch (cause) {
      if (active.current === slug) setLoadError(errorMessage(cause));
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    active.current = botSlug;
    setSchedules(undefined);
    setLoadError(undefined);
    if (botSlug === undefined) return;
    void refresh(botSlug);
    const timer = setInterval(() => void refresh(botSlug), REFRESH_MS);
    const unsubscribe = subscribeMessagingDefaults(() => void refresh(botSlug));
    return () => {
      clearInterval(timer);
      unsubscribe();
      active.current = undefined;
    };
  }, [actions, botSlug]);

  if (botSlug === undefined) return <div ref={mount} />;

  const openEditor = (scheduleId: string): void => {
    editorKey.current += 1;
    setEditor({ key: editorKey.current, scheduleId });
  };

  const change = (
    schedule: BotScheduleView,
    patch: { enabled?: boolean; locked?: boolean },
  ): void => {
    setToggling(schedule.id);
    setLoadError(undefined);
    void actions
      .updateBotSchedule(botSlug, schedule.id, patch)
      .then(() => refresh(botSlug))
      .catch((cause: unknown) => setLoadError(errorMessage(cause)))
      .finally(() => setToggling(undefined));
  };

  return (
    <div ref={mount} className="bh-schedules" data-bot-schedules="">
      {schedules === undefined && loadError === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('schedule.loading')} />
      ) : null}
      {loadError === undefined ? null : (
        <p className="bh-schedule-error" role="alert">
          {loadError}
        </p>
      )}
      {schedules !== undefined && schedules.length === 0 ? (
        <div className="bh-schedule-empty">
          <p className="bh-schedule-muted">{t('schedule.empty')}</p>
          <Button variant="outline" size="sm" onClick={() => requestCreate(botSlug)}>
            {t('schedule.add')}
          </Button>
        </div>
      ) : null}
      {schedules === undefined || schedules.length === 0 ? null : (
        <SidebarCardList label={t('entry.schedules')}>
          {schedules.map((schedule) => (
            <SidebarCardRow
              key={schedule.id}
              icon="alarm-clock"
              title={schedule.title}
              muted={!schedule.enabled}
              dialog
              onClick={() => openEditor(schedule.id)}
              chips={
                <>
                  <Tag tone={schedule.enabled ? 'info' : 'outline'}>
                    {scheduleCadenceLabel(schedule.trigger, t)}
                  </Tag>
                  {schedule.lastFiring === undefined ? null : (
                    <FiringTag firing={schedule.lastFiring} t={t} />
                  )}
                  <span
                    className="bh-card-glyph"
                    title={t(`schedule.creator.${schedule.creator}`)}
                    aria-label={t(`schedule.creator.${schedule.creator}`)}
                  >
                    <ChannelSidebarIcon
                      name={schedule.creator === 'human' ? 'user' : 'bot'}
                      size={12}
                    />
                  </span>
                </>
              }
              meta={
                schedule.enabled && schedule.nextRunAt !== undefined
                  ? t('schedule.next', { time: formatScheduleTime(schedule.nextRunAt) })
                  : t('schedule.paused')
              }
              trailing={
                <>
                  <button
                    type="button"
                    className="bh-card-action bh-schedule-lock-toggle"
                    data-locked={schedule.locked ? 'true' : undefined}
                    aria-pressed={schedule.locked}
                    disabled={toggling !== undefined}
                    title={
                      schedule.locked
                        ? t('schedule.locked')
                        : t('schedule.lock', { title: schedule.title })
                    }
                    aria-label={
                      schedule.locked
                        ? t('schedule.unlock', { title: schedule.title })
                        : t('schedule.lock', { title: schedule.title })
                    }
                    onClick={() => change(schedule, { locked: !schedule.locked })}
                  >
                    <ChannelSidebarIcon name={schedule.locked ? 'lock' : 'lock-open'} size={14} />
                  </button>
                  <Switch
                    checked={schedule.enabled}
                    disabled={toggling !== undefined}
                    label={t('schedule.enable', { title: schedule.title })}
                    onChange={(enabled) => change(schedule, { enabled })}
                  />
                </>
              }
            />
          ))}
        </SidebarCardList>
      )}
      {editor === undefined ? null : (
        <ScheduleDialog
          key={editor.key}
          botSlug={botSlug}
          scheduleId={editor.scheduleId}
          actions={actions}
          t={t}
          onClose={() => setEditor(undefined)}
          onChanged={() => void refresh(botSlug)}
        />
      )}
    </div>
  );
}
