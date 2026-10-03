import { useMemo, useState, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_PARTS,
  DEFAULT_ILLUSTRATED_RECIPE,
  illustratedAvatarSvg,
  type AvatarColor,
  type AvatarPart,
  type IllustratedAvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import { PersonaBotAvatar, normalizePersonaBotActivity } from './avatar.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

type Category = AvatarPart | 'colors';

const CATEGORIES: readonly Category[] = [
  'head',
  'hair',
  'eyes',
  'brows',
  'nose',
  'mouth',
  'cheeks',
  'glasses',
  'accessory',
  'colors',
];

const SWATCHES: Record<AvatarColor, readonly string[]> = {
  skinColor: [
    '#ffe3cf',
    '#f2c9a8',
    '#e0a87e',
    '#c68863',
    '#9a6142',
    '#6e4129',
    '#4a2c1c',
    '#f4f1ec',
  ],
  hairColor: [
    '#1d1b22',
    '#5a3a2a',
    '#8a5a36',
    '#e2b04a',
    '#c4452f',
    '#d9475a',
    '#f06292',
    '#3fc1b8',
    '#5a7be0',
    '#9aa3ad',
    '#f4f1ec',
  ],
  eyeColor: [
    '#3f7fbf',
    '#5a3a2a',
    '#2f9e8f',
    '#4c8a3c',
    '#8a5ad0',
    '#d0533f',
    '#d9a13a',
    '#2a2230',
  ],
  shirtColor: [
    '#5b8bd6',
    '#e07a5f',
    '#3d9970',
    '#7a5cc7',
    '#f2c14e',
    '#2f3a4a',
    '#e2565f',
    '#9ad0c2',
  ],
};

function shuffled(recipe: IllustratedAvatarRecipe): IllustratedAvatarRecipe {
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)]!;
  const next: Record<string, unknown> = { ...recipe };
  for (const part of Object.keys(AVATAR_PARTS) as AvatarPart[])
    next[part] = pick(AVATAR_PARTS[part]);
  for (const color of AVATAR_COLORS) next[color] = pick(SWATCHES[color]);
  return next as IllustratedAvatarRecipe;
}

function OptionTile({
  recipe,
  selected,
  label,
  id,
  onSelect,
}: {
  recipe: IllustratedAvatarRecipe;
  selected: boolean;
  label: string;
  id: string;
  onSelect(): void;
}): ReactElement {
  const key = JSON.stringify(recipe);
  const markup = useMemo(
    () => illustratedAvatarSvg(JSON.parse(key) as IllustratedAvatarRecipe),
    [key],
  );
  return (
    <button
      type="button"
      className="bh-avatar-option"
      data-avatar-option={id}
      aria-pressed={selected}
      aria-label={label}
      title={label}
      onClick={onSelect}
    >
      <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: markup }} />
    </button>
  );
}

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
  const [category, setCategory] = useState<Category>('hair');
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
            <div className="bh-avatar-categories">
              <div role="tablist" aria-label={t('profile.avatar.parts')}>
                {CATEGORIES.map((key) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    id={`bh-avatar-tab-${key}`}
                    data-avatar-category={key}
                    aria-selected={category === key}
                    aria-controls="bh-avatar-panel"
                    tabIndex={category === key ? 0 : -1}
                    onClick={() => setCategory(key)}
                    onKeyDown={(event) => {
                      const step =
                        event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
                      if (!step) return;
                      event.preventDefault();
                      const next =
                        CATEGORIES[
                          (CATEGORIES.indexOf(key) + step + CATEGORIES.length) % CATEGORIES.length
                        ]!;
                      setCategory(next);
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(`[data-avatar-category="${next}"]`)
                        ?.focus();
                    }}
                  >
                    {t(`profile.avatar.${key}`)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-avatar-shuffle
                className="bh-avatar-shuffle"
                onClick={() => setDraft(shuffled(draft))}
              >
                {t('profile.avatar.shuffle')}
              </button>
            </div>
            {category === 'colors' ? (
              <div
                className="bh-avatar-colors"
                role="tabpanel"
                id="bh-avatar-panel"
                aria-labelledby="bh-avatar-tab-colors"
              >
                {AVATAR_COLORS.map((key) => (
                  <div key={key} className="bh-avatar-color-row">
                    <span>{t(`profile.avatar.${key}`)}</span>
                    {SWATCHES[key].map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="bh-avatar-swatch"
                        data-avatar-option={`${key}:${value}`}
                        aria-pressed={draft[key] === value}
                        aria-label={`${t(`profile.avatar.${key}`)} ${value}`}
                        style={{ background: value }}
                        onClick={() => setDraft({ ...draft, [key]: value })}
                      />
                    ))}
                    <input
                      name={key}
                      type="color"
                      aria-label={t(`profile.avatar.${key}`)}
                      value={draft[key]}
                      onChange={(event) => setDraft({ ...draft, [key]: event.currentTarget.value })}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div
                className="bh-avatar-options"
                role="tabpanel"
                id="bh-avatar-panel"
                aria-labelledby={`bh-avatar-tab-${category}`}
              >
                {AVATAR_PARTS[category].map((value) => (
                  <OptionTile
                    key={value}
                    id={`${category}:${value}`}
                    recipe={{ ...draft, [category]: value }}
                    selected={draft[category] === value}
                    label={t(
                      `profile.avatar.option.${category}.${value}` as Parameters<BotHarnessTranslate>[0],
                    )}
                    onSelect={() => setDraft({ ...draft, [category]: value })}
                  />
                ))}
              </div>
            )}
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
