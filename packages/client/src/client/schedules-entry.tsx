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

type CadenceUnit = 'minutes' | 'hours' | 'daily' | 'weekly' | 'once' | 'cron';

const WEEKDAYS = [
  [1, 'schedule.weekday.1'],
  [2, 'schedule.weekday.2'],
  [3, 'schedule.weekday.3'],
  [4, 'schedule.weekday.4'],
  [5, 'schedule.weekday.5'],
  [6, 'schedule.weekday.6'],
  [7, 'schedule.weekday.7'],
] as const;
const PREVIEW_DELAY_MS = 250;
const STARTED_MS = 4000;
const TIME = /^\d{2}:\d{2}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

export interface ScheduleForm {
  title: string;
  prompt: string;
  unit: CadenceUnit;
  every: string;
  time: string;
  timeZone: string;
  weekdays: number[];
  date: string;
  expression: string;
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

function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function emptyScheduleForm(
  timeZone = browserTimeZone(),
  now: Date = new Date(),
): ScheduleForm {
  return {
    title: '',
    prompt: '',
    unit: 'hours',
    every: '1',
    time: '09:00',
    timeZone,
    weekdays: [1, 2, 3, 4, 5],
    date: localDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    expression: '0 9 * * 1-5',
    locked: false,
  };
}

export function scheduleFormOf(schedule: BotScheduleView): ScheduleForm {
  const base = {
    ...emptyScheduleForm(),
    title: schedule.title,
    prompt: schedule.prompt,
    locked: schedule.locked,
  };
  const trigger = schedule.trigger;
  switch (trigger.kind) {
    case 'every': {
      const hours = trigger.everySeconds % 3600 === 0;
      return {
        ...base,
        unit: hours ? 'hours' : 'minutes',
        every: String(trigger.everySeconds / (hours ? 3600 : 60)),
      };
    }
    case 'daily':
      return { ...base, unit: 'daily', time: trigger.time, timeZone: trigger.timeZone };
    case 'weekly':
      return {
        ...base,
        unit: 'weekly',
        time: trigger.time,
        timeZone: trigger.timeZone,
        weekdays: [...trigger.weekdays],
      };
    case 'once':
      return {
        ...base,
        unit: 'once',
        date: trigger.date,
        time: trigger.time,
        timeZone: trigger.timeZone,
      };
    case 'cron':
      return { ...base, unit: 'cron', expression: trigger.expression, timeZone: trigger.timeZone };
  }
}

export function scheduleTriggerOf(form: ScheduleForm): BotScheduleTrigger | undefined {
  const timeZone = form.timeZone.trim();
  if (form.unit === 'minutes' || form.unit === 'hours') {
    const every = Number(form.every);
    if (!Number.isSafeInteger(every) || every < 1) return undefined;
    return { kind: 'every', everySeconds: every * (form.unit === 'hours' ? 3600 : 60) };
  }
  if (timeZone.length === 0) return undefined;
  if (form.unit === 'cron') {
    const expression = form.expression.trim().replace(/\s+/gu, ' ');
    return expression.length === 0 ? undefined : { kind: 'cron', expression, timeZone };
  }
  if (!TIME.test(form.time)) return undefined;
  if (form.unit === 'daily') return { kind: 'daily', time: form.time, timeZone };
  if (form.unit === 'weekly')
    return form.weekdays.length === 0
      ? undefined
      : {
          kind: 'weekly',
          time: form.time,
          timeZone,
          weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
        };
  return DATE.test(form.date)
    ? { kind: 'once', date: form.date, time: form.time, timeZone }
    : undefined;
}

export function scheduleCadenceLabel(trigger: BotScheduleTrigger, t: BotHarnessTranslate): string {
  if (trigger.kind === 'daily') return t('schedule.cadence.daily', { time: trigger.time });
  if (trigger.kind === 'weekly')
    return t('schedule.cadence.weekly', {
      days: weekdayList(trigger.weekdays, t),
      time: trigger.time,
    });
  if (trigger.kind === 'once')
    return t('schedule.cadence.once', { time: `${trigger.date.slice(5)} ${trigger.time}` });
  if (trigger.kind === 'cron')
    return t('schedule.cadence.cron', { expression: trigger.expression });
  if (trigger.everySeconds % 3600 === 0) {
    const n = trigger.everySeconds / 3600;
    return n === 1 ? t('schedule.cadence.hour') : t('schedule.cadence.hours', { n });
  }
  const n = Math.round(trigger.everySeconds / 60);
  return n === 1 ? t('schedule.cadence.minute') : t('schedule.cadence.minutes', { n });
}

function weekdayList(weekdays: number[], t: BotHarnessTranslate): string {
  const days = [...weekdays].sort((a, b) => a - b).join(',');
  if (days === '1,2,3,4,5') return t('schedule.weekdays.workdays');
  if (days === '6,7') return t('schedule.weekdays.weekend');
  if (days === '1,2,3,4,5,6,7') return t('schedule.weekdays.everyDay');
  return WEEKDAYS.filter(([day]) => weekdays.includes(day))
    .map(([, key]) => t(key))
    .join(t('schedule.weekdays.separator'));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSchedulePreview(iso: string): string {
  const at = new Date(iso);
  return `${localDate(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
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

function SchedulePreview({
  trigger,
  preview,
  t,
}: {
  trigger: BotScheduleTrigger | undefined;
  preview: (trigger: BotScheduleTrigger) => Promise<string[]>;
  t: BotHarnessTranslate;
}): ReactElement {
  const key = trigger === undefined ? '' : JSON.stringify(trigger);
  const [result, setResult] = useState<{
    key: string;
    occurrences?: string[];
    error?: string;
  }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (trigger === undefined) return;
    let live = true;
    const timer = setTimeout(() => {
      void preview(trigger)
        .then((occurrences) => {
          if (live) setResult({ key, occurrences });
        })
        .catch((cause: unknown) => {
          if (live) setResult({ key, error: errorMessage(cause) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, preview]);
  const current = result?.key === key ? result : undefined;
  return (
    <div ref={mount} className="bh-schedule-preview" aria-live="polite" data-schedule-preview="">
      <span className="bh-schedule-preview-label">{t('schedule.preview')}</span>
      {trigger === undefined ? (
        <span className="bh-schedule-muted">{t('schedule.preview.incomplete')}</span>
      ) : current === undefined ? (
        <span className="bh-schedule-muted">{t('schedule.preview.loading')}</span>
      ) : current.error !== undefined ? (
        <span className="bh-schedule-error" role="alert">
          {t('schedule.preview.invalid', { reason: current.error })}
        </span>
      ) : (
        <ol>
          {current.occurrences!.map((occurrence) => (
            <li key={occurrence}>{formatSchedulePreview(occurrence)}</li>
          ))}
        </ol>
      )}
    </div>
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
  preview,
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
  preview: (trigger: BotScheduleTrigger) => Promise<string[]>;
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
            { value: 'weekly', label: t('schedule.form.unit.weekly') },
            { value: 'once', label: t('schedule.form.unit.once') },
            { value: 'cron', label: t('schedule.form.unit.cron') },
          ]}
          onChange={(unit) => set({ unit })}
        />
        {form.unit === 'minutes' || form.unit === 'hours' ? (
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
        ) : null}
        {form.unit === 'weekly' ? (
          <div
            className="bh-schedule-weekdays"
            role="group"
            aria-label={t('schedule.form.weekdays')}
          >
            {WEEKDAYS.map(([day, key]) => {
              const on = form.weekdays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  className="bh-schedule-weekday"
                  aria-pressed={on}
                  onClick={() =>
                    set({
                      weekdays: on
                        ? form.weekdays.filter((value) => value !== day)
                        : [...form.weekdays, day].sort((a, b) => a - b),
                    })
                  }
                >
                  {t(key)}
                </button>
              );
            })}
          </div>
        ) : null}
        {form.unit === 'cron' ? (
          <label className="bh-schedule-field">
            <span>{t('schedule.form.cron')}</span>
            <Input
              value={form.expression}
              spellCheck={false}
              placeholder="0 9 * * 1-5"
              className="bh-schedule-cron"
              onChange={(event) => set({ expression: event.target.value })}
            />
            <small className="bh-schedule-muted">{t('schedule.form.cronHint')}</small>
          </label>
        ) : null}
        {form.unit === 'minutes' || form.unit === 'hours' ? null : (
          <div className="bh-schedule-row">
            {form.unit === 'once' ? (
              <label className="bh-schedule-field">
                <span>{t('schedule.form.date')}</span>
                <Input
                  type="date"
                  value={form.date}
                  onChange={(event) => set({ date: event.target.value })}
                />
              </label>
            ) : null}
            {form.unit === 'cron' ? null : (
              <label className="bh-schedule-field">
                <span>{t('schedule.form.time')}</span>
                <Input
                  type="time"
                  value={form.time}
                  onChange={(event) => set({ time: event.target.value })}
                />
              </label>
            )}
            <label className="bh-schedule-field bh-schedule-zone">
              <span>{t('schedule.form.timeZone')}</span>
              <Input
                value={form.timeZone}
                onChange={(event) => set({ timeZone: event.target.value })}
              />
            </label>
          </div>
        )}
        {form.unit === 'once' ? (
          <p className="bh-schedule-muted">{t('schedule.form.onceHint')}</p>
        ) : null}
        <SchedulePreview trigger={trigger} preview={preview} t={t} />
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
        preview={actions.botSchedulePreview}
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
  const [started, setStarted] = useState<string | undefined>();
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

  const runNow = (schedule: BotScheduleView): void => {
    setToggling(schedule.id);
    setLoadError(undefined);
    void actions
      .runBotScheduleNow(botSlug, schedule.id)
      .then(() => {
        setStarted(schedule.id);
        setTimeout(
          () => setStarted((current) => (current === schedule.id ? undefined : current)),
          STARTED_MS,
        );
        return refresh(botSlug);
      })
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
                started === schedule.id
                  ? t('schedule.runNow.started')
                  : schedule.enabled && schedule.nextRunAt !== undefined
                    ? t('schedule.next', { time: formatScheduleTime(schedule.nextRunAt) })
                    : schedule.trigger.kind === 'once' && schedule.lastFiring !== undefined
                      ? t('schedule.done')
                      : t('schedule.paused')
              }
              trailing={
                <>
                  <button
                    type="button"
                    className="bh-card-action bh-schedule-run-now"
                    disabled={toggling !== undefined}
                    title={t('schedule.runNow', { title: schedule.title })}
                    aria-label={t('schedule.runNow', { title: schedule.title })}
                    onClick={() => runNow(schedule)}
                  >
                    <ChannelSidebarIcon name="play" size={14} />
                  </button>
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
