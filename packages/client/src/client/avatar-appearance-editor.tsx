import { useState, type ReactElement } from 'react';
import {
  DEFAULT_ILLUSTRATED_RECIPE,
  type IllustratedAvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import { PersonaBotAvatar, normalizePersonaBotActivity } from './avatar.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

export function AvatarAppearanceEditor({
  bot,
  channelId,
  onSave,
  t,
}: {
  bot: BotSummary;
  channelId: string;
  onSave(channelId: string, recipe: IllustratedAvatarRecipe): Promise<boolean>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [draft, setDraft] = useState<IllustratedAvatarRecipe>();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const start = () => {
    setDraft({ ...(bot.appearance?.recipe ?? DEFAULT_ILLUSTRATED_RECIPE) });
    setFailed(false);
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    const saved = await onSave(channelId, draft);
    setBusy(false);
    setFailed(!saved);
    if (saved) setDraft(undefined);
  };
  const state = normalizePersonaBotActivity(bot.aggregateState);
  const recipe = draft ?? bot.appearance?.recipe;
  return (
    <section className="bh-avatar-editor" aria-label={t('profile.avatar.design')}>
      <div className="bh-avatar-editor-preview" data-avatar-preview>
        <PersonaBotAvatar
          personaBotId={bot.slug}
          name={bot.displayName}
          src={bot.avatar}
          appearance={
            recipe ? { recipe, revision: bot.appearance?.revision ?? '0'.repeat(64) } : undefined
          }
          size={160}
          state={state}
          activity={bot.activity}
          attention={bot.attention}
          t={t}
        />
      </div>
      <div className="bh-avatar-editor-controls">
        <h3>{t('profile.avatar.design')}</h3>
        <p>{t('profile.avatar.designDescription')}</p>
        {draft ? (
          <fieldset disabled={busy} className="bh-avatar-editor-fields">
            {(['head', 'hair', 'accessory'] as const).map((key) => (
              <label key={key}>
                {t(`profile.avatar.${key}`)}
                <select
                  name={key}
                  value={draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.currentTarget.value })}
                >
                  {(key === 'head'
                    ? (['soft', 'long'] as const)
                    : key === 'hair'
                      ? (['sweep', 'crop', 'bob'] as const)
                      : (['none', 'glasses'] as const)
                  ).map((value) => (
                    <option key={value} value={value}>
                      {t(`profile.avatar.part.${value}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            {(['skinColor', 'hairColor', 'shirtColor'] as const).map((key) => (
              <label key={key}>
                {t(`profile.avatar.${key}`)}
                <input
                  name={key}
                  type="color"
                  value={draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.currentTarget.value })}
                />
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="bh-profile-avatar-actions">
          {draft ? (
            <>
              <button
                data-avatar-save
                type="button"
                className="bh-profile-action bh-profile-action-primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {t('profile.save')}
              </button>
              <button
                data-avatar-cancel
                type="button"
                className="bh-profile-action"
                disabled={busy}
                onClick={() => {
                  setDraft(undefined);
                  setFailed(false);
                }}
              >
                {t('common.cancel')}
              </button>
            </>
          ) : (
            <button data-avatar-edit type="button" className="bh-profile-action" onClick={start}>
              {t('profile.avatar.design')}
            </button>
          )}
        </div>
        {failed ? (
          <p role="alert" className="bh-error">
            {t('profile.avatar.failed')}
          </p>
        ) : null}
      </div>
    </section>
  );
}
