import { useMemo, useState, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_FAMILIES,
  AVATAR_PARTS,
  AVATAR_PRESETS,
  AVATAR_SWATCHES,
  avatarSvg,
  seededAvatarRecipe,
  type AvatarFamily,
  type AvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import {
  LINE_COLORS,
  LINE_PARTS,
  LINE_RANGES,
  LINE_SWATCHES,
  seededLineRecipe,
} from '../../../core/src/bots/avatar-line.js';
import { PersonaBotAvatar, normalizePersonaBotActivity } from './avatar.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';

type Key = Parameters<BotHarnessTranslate>[0];

interface FamilySpec {
  parts: Readonly<Record<string, readonly string[]>>;
  colors: readonly string[];
  swatches: Readonly<Record<string, readonly string[]>>;
  ranges: Readonly<Record<string, readonly [number, number]>>;
  categories: readonly string[];
  presets: readonly AvatarRecipe[];
  option(part: string, value: string): Key;
  seeded(name: string): AvatarRecipe;
}

const FAMILIES: Record<AvatarFamily, FamilySpec> = {
  illustrated: {
    parts: AVATAR_PARTS,
    colors: AVATAR_COLORS,
    swatches: AVATAR_SWATCHES,
    ranges: {},
    presets: AVATAR_PRESETS,
    categories: [
      'presets',
      ...Object.keys(AVATAR_PARTS).filter((part) => part !== 'backdrop'),
      'backdrop',
      'colors',
    ],
    option: (part, value) => `profile.avatar.option.${part}.${value}` as Key,
    seeded: seededAvatarRecipe,
  },
  line: {
    parts: LINE_PARTS,
    colors: LINE_COLORS,
    swatches: LINE_SWATCHES,
    ranges: LINE_RANGES,
    presets: [],
    categories: [...Object.keys(LINE_PARTS), 'shape', 'colors'],
    option: (part, value) => `profile.avatar.line.${part}.${value}` as Key,
    seeded: seededLineRecipe,
  },
};

type Fields = Record<string, string | number>;

function shuffled(recipe: AvatarRecipe): AvatarRecipe {
  const spec = FAMILIES[recipe.family];
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)]!;
  const next: Fields = { ...(recipe as unknown as Fields) };
  for (const [part, values] of Object.entries(spec.parts)) next[part] = pick(values);
  for (const color of spec.colors) next[color] = pick(spec.swatches[color]!);
  for (const [key, [min, max]] of Object.entries(spec.ranges))
    next[key] = min + Math.floor(Math.random() * (max - min + 1));
  return next as unknown as AvatarRecipe;
}

function OptionTile({
  recipe,
  selected,
  label,
  id,
  onSelect,
}: {
  recipe: AvatarRecipe;
  selected: boolean;
  label: string;
  id: string;
  onSelect(): void;
}): ReactElement {
  const key = JSON.stringify(recipe);
  const markup = useMemo(() => avatarSvg(JSON.parse(key) as AvatarRecipe), [key]);
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
  onSave(channelId: string, recipe: AvatarRecipe): Promise<boolean>;
  t: BotHarnessTranslate;
}): ReactElement {
  const [drafts, setDrafts] = useState<Partial<Record<AvatarFamily, AvatarRecipe>>>();
  const [family, setFamily] = useState<AvatarFamily>('illustrated');
  const [category, setCategory] = useState('hair');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const draft = drafts?.[family];
  const spec = FAMILIES[family];
  const seed = bot.displayName || bot.slug;
  const start = () => {
    const saved = bot.appearance?.recipe ?? seededAvatarRecipe(seed);
    setDrafts({ [saved.family]: { ...saved } });
    setFamily(saved.family);
    setCategory(saved.family === 'line' ? 'eyes' : 'hair');
    setFailed(false);
  };
  const update = (next: AvatarRecipe) =>
    setDrafts((current) => ({ ...current, [next.family]: next }));
  const choose = (next: AvatarFamily) => {
    setFamily(next);
    setCategory(next === 'line' ? 'eyes' : 'hair');
    setDrafts((current) => ({
      ...current,
      [next]:
        current?.[next] ??
        (bot.appearance?.recipe.family === next
          ? bot.appearance.recipe
          : FAMILIES[next].seeded(seed)),
    }));
  };
  const save = async () => {
    if (!draft || busy) return;
    setBusy(true);
    const saved = await onSave(channelId, draft);
    setBusy(false);
    setFailed(!saved);
    if (saved) setDrafts(undefined);
  };
  const state = normalizePersonaBotActivity(bot.aggregateState);
  const recipe = draft ?? bot.appearance?.recipe;
  const fields = draft as unknown as Fields | undefined;
  const set = (key: string, value: string | number) =>
    update({ ...(draft as unknown as Fields), [key]: value } as unknown as AvatarRecipe);
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
        {draft && fields ? (
          <fieldset disabled={busy} className="bh-avatar-editor-fields">
            <div
              className="bh-avatar-families"
              role="radiogroup"
              aria-label={t('profile.avatar.family')}
            >
              {AVATAR_FAMILIES.map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  data-avatar-family={value}
                  aria-checked={family === value}
                  onClick={() => choose(value)}
                >
                  {t(`profile.avatar.family.${value}`)}
                </button>
              ))}
            </div>
            <div className="bh-avatar-categories">
              <div role="tablist" aria-label={t('profile.avatar.parts')}>
                {spec.categories.map((key) => (
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
                      const list = spec.categories;
                      const next = list[(list.indexOf(key) + step + list.length) % list.length]!;
                      setCategory(next);
                      event.currentTarget.parentElement
                        ?.querySelector<HTMLButtonElement>(`[data-avatar-category="${next}"]`)
                        ?.focus();
                    }}
                  >
                    {t(`profile.avatar.${key}` as Key)}
                  </button>
                ))}
              </div>
              <button
                type="button"
                data-avatar-shuffle
                className="bh-avatar-shuffle"
                onClick={() => update(shuffled(draft))}
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
                {spec.colors.map((key) => (
                  <div key={key} className="bh-avatar-color-row">
                    <span>{t(`profile.avatar.${key}` as Key)}</span>
                    {spec.swatches[key]!.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className="bh-avatar-swatch"
                        data-avatar-option={`${key}:${value}`}
                        aria-pressed={fields[key] === value}
                        aria-label={`${t(`profile.avatar.${key}` as Key)} ${value}`}
                        style={{ background: value }}
                        onClick={() => set(key, value)}
                      />
                    ))}
                    <input
                      name={key}
                      type="color"
                      aria-label={t(`profile.avatar.${key}` as Key)}
                      value={String(fields[key])}
                      onChange={(event) => set(key, event.currentTarget.value)}
                    />
                  </div>
                ))}
              </div>
            ) : category === 'presets' ? (
              <div
                className="bh-avatar-options"
                role="tabpanel"
                id="bh-avatar-panel"
                aria-labelledby="bh-avatar-tab-presets"
              >
                {spec.presets.map((preset, index) => (
                  <OptionTile
                    key={index}
                    id={`preset:${index}`}
                    recipe={preset}
                    selected={JSON.stringify(preset) === JSON.stringify(draft)}
                    label={`${t('profile.avatar.presets')} ${index + 1}`}
                    onSelect={() => update({ ...preset })}
                  />
                ))}
              </div>
            ) : category === 'shape' ? (
              <div
                className="bh-avatar-ranges"
                role="tabpanel"
                id="bh-avatar-panel"
                aria-labelledby="bh-avatar-tab-shape"
              >
                {Object.entries(spec.ranges).map(([key, [min, max]]) => (
                  <label key={key}>
                    <span>{t(`profile.avatar.${key}` as Key)}</span>
                    <input
                      type="range"
                      name={key}
                      min={min}
                      max={max}
                      step={1}
                      value={Number(fields[key])}
                      onChange={(event) => set(key, Number(event.currentTarget.value))}
                    />
                    <output>{fields[key]}</output>
                  </label>
                ))}
              </div>
            ) : (
              <div
                className="bh-avatar-options"
                role="tabpanel"
                id="bh-avatar-panel"
                aria-labelledby={`bh-avatar-tab-${category}`}
              >
                {(spec.parts[category] ?? []).map((value) => (
                  <OptionTile
                    key={value}
                    id={`${category}:${value}`}
                    recipe={
                      {
                        ...(draft as unknown as Fields),
                        [category]: value,
                      } as unknown as AvatarRecipe
                    }
                    selected={fields[category] === value}
                    label={t(spec.option(category, value))}
                    onSelect={() => set(category, value)}
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
                  setDrafts(undefined);
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
