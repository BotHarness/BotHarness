import { useId, useState, type ReactElement } from 'react';
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import { errorMessage } from './bridge.js';
import type { BotHarnessTranslate } from './locale.js';
import type { BotSummary, StandingLimitsView } from './store.js';

export const DEFAULT_STANDING_LIMITS: StandingLimitsView = { soul: 5000, coreMemory: 3000 };
export const MIN_STANDING_LIMIT = 500;
export const MAX_STANDING_LIMIT = 50_000;
const CHARACTERS_PER_ENGLISH_WORD = 6;

const formatCount = (value: number): string => value.toLocaleString('en-US');

function parseLimit(text: string): number | undefined {
  if (!/^\d+$/u.test(text.trim())) return undefined;
  const value = Number(text.trim());
  return value >= MIN_STANDING_LIMIT && value <= MAX_STANDING_LIMIT ? value : undefined;
}

function LimitField({
  label,
  file,
  value,
  disabled,
  invalid,
  onChange,
  t,
}: {
  label: string;
  file: string;
  value: string;
  disabled: boolean;
  invalid: boolean;
  onChange: (value: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const parsed = parseLimit(value);
  return (
    <div className="bh-standing-limit-field">
      <label className="bh-standing-limit-label" htmlFor={id}>
        <span>{label}</span>
        <code>{file}</code>
      </label>
      <div className="bh-standing-limit-input">
        <Input
          id={id}
          type="number"
          min={MIN_STANDING_LIMIT}
          max={MAX_STANDING_LIMIT}
          step={100}
          value={value}
          disabled={disabled}
          aria-describedby={`${id}-hint`}
          aria-invalid={invalid ? true : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className="bh-standing-limit-unit">{t('standingLimits.unit')}</span>
      </div>
      <div className="bh-settings-row-desc" id={`${id}-hint`}>
        {parsed === undefined
          ? t('standingLimits.range', {
              min: formatCount(MIN_STANDING_LIMIT),
              max: formatCount(MAX_STANDING_LIMIT),
            })
          : t('standingLimits.size', {
              chinese: formatCount(parsed),
              words: formatCount(Math.round(parsed / CHARACTERS_PER_ENGLISH_WORD / 10) * 10),
            })}
      </div>
    </div>
  );
}

export function StandingLimitsProfile({
  bot,
  actions,
  t,
}: {
  bot: BotSummary;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [saved, setSaved] = useState<StandingLimitsView>(
    bot.standingLimits ?? DEFAULT_STANDING_LIMITS,
  );
  const [soul, setSoul] = useState(String(saved.soul));
  const [coreMemory, setCoreMemory] = useState(String(saved.coreMemory));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState(false);

  const soulLimit = parseLimit(soul);
  const coreMemoryLimit = parseLimit(coreMemory);
  const valid = soulLimit !== undefined && coreMemoryLimit !== undefined;
  const changed = valid && (soulLimit !== saved.soul || coreMemoryLimit !== saved.coreMemory);

  const edit = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setError(undefined);
    setNotice(false);
  };

  const submit = async (): Promise<void> => {
    if (!valid) return;
    setBusy(true);
    setError(undefined);
    try {
      const updated = await actions.setStandingLimits(bot.slug, {
        soul: soulLimit,
        coreMemory: coreMemoryLimit,
      });
      const next = updated.standingLimits ?? { soul: soulLimit, coreMemory: coreMemoryLimit };
      setSaved(next);
      setSoul(String(next.soul));
      setCoreMemory(String(next.coreMemory));
      setNotice(true);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className="bh-profile-section bh-profile-policy-section bh-standing-limits"
      aria-label={t('standingLimits.title')}
    >
      <h2 className="bh-profile-section-title">{t('standingLimits.title')}</h2>
      <p className="bh-settings-row-desc">{t('standingLimits.description')}</p>
      <form
        className="bh-standing-limits-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <LimitField
          label={t('standingLimits.soul')}
          file="SOUL.md"
          value={soul}
          disabled={busy}
          invalid={soulLimit === undefined}
          onChange={edit(setSoul)}
          t={t}
        />
        <LimitField
          label={t('standingLimits.coreMemory')}
          file="MEMORY.md"
          value={coreMemory}
          disabled={busy}
          invalid={coreMemoryLimit === undefined}
          onChange={edit(setCoreMemory)}
          t={t}
        />
        <div className="bh-standing-limits-actions">
          <Button type="submit" size="sm" variant="primary" disabled={busy || !changed}>
            {t(busy ? 'standingLimits.saving' : 'standingLimits.save')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={
              busy ||
              (soul === String(DEFAULT_STANDING_LIMITS.soul) &&
                coreMemory === String(DEFAULT_STANDING_LIMITS.coreMemory))
            }
            onClick={() => {
              edit(setSoul)(String(DEFAULT_STANDING_LIMITS.soul));
              setCoreMemory(String(DEFAULT_STANDING_LIMITS.coreMemory));
            }}
          >
            {t('standingLimits.reset')}
          </Button>
          {notice && (
            <span className="bh-settings-row-desc" role="status">
              {t('standingLimits.saved')}
            </span>
          )}
          {error && (
            <span className="bh-assignment-limit-error" role="alert">
              {error}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
