import { useMemo, useState, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  AVATAR_FAMILIES,
  AVATAR_HAIR_PARTS,
  AVATAR_PARTS,
  AVATAR_PIECE_COLORS,
  AVATAR_PRESETS,
  AVATAR_RANGES,
  AVATAR_SPECIES,
  AVATAR_SPECIES_SWATCHES,
  detailedAvatarRecipe,
  type IllustratedAvatarRecipe,
  AVATAR_SWATCHES,
  withAvatarSpecies,
  avatarSvg,
  seededAvatarRecipe,
  type AvatarFamily,
  type AvatarRecipe,
} from '../../../core/src/bots/avatar-appearance.js';
import {
  LINE_COLORS,
  LINE_PARTS,
  LINE_PRESETS,
  LINE_RANGES,
  LINE_SWATCHES,
  seededLineRecipe,
} from '../../../core/src/bots/avatar-line.js';
import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';

import { PersonaBotAvatar, PersonaBotStatusBadges, normalizePersonaBotActivity } from './avatar.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
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
    parts: {
      species: AVATAR_SPECIES,
      ...AVATAR_PARTS,
      ...AVATAR_HAIR_PARTS,
      rightSideHair: AVATAR_HAIR_PARTS.sideHair,
    },
    colors: [...AVATAR_COLORS, ...AVATAR_PIECE_COLORS],
    swatches: {
      ...AVATAR_SWATCHES,
      leftSideHairColor: AVATAR_SWATCHES.hairColor,
      rightSideHairColor: AVATAR_SWATCHES.hairColor,
    },
    ranges: AVATAR_RANGES,
    presets: AVATAR_PRESETS,
    categories: [
      'presets',
      'species',
      'hair',
      'bangs',
      'sideHair',
      'rightSideHair',
      'backHair',
      ...Object.keys(AVATAR_PARTS).filter((part) => part !== 'backdrop' && part !== 'hair'),
      'shape',
      'colors',
    ],
    option: (part, value) =>
      `profile.avatar.option.${part === 'rightSideHair' ? 'sideHair' : part}.${value}` as Key,
    seeded: seededAvatarRecipe,
  },
  line: {
    parts: LINE_PARTS,
    colors: LINE_COLORS,
    swatches: LINE_SWATCHES,
    ranges: LINE_RANGES,
    presets: LINE_PRESETS,
    categories: [
      'presets',
      ...Object.keys(LINE_PARTS).filter((part) => part !== 'symbol'),
      'shape',
      'colors',
    ],
    option: (part, value) => `profile.avatar.line.${part}.${value}` as Key,
    seeded: seededLineRecipe,
  },
};

type Fields = Record<string, string | number>;

const DETAIL = new Set<string>([...Object.keys(AVATAR_HAIR_PARTS), ...Object.keys(AVATAR_RANGES)]);
// Choices that need an asset version 2 recipe: a species, or a side piece edited on its own.
const SPLIT = new Set<string>(['species', 'sideHair', 'rightSideHair', ...AVATAR_PIECE_COLORS]);

function withPart(recipe: AvatarRecipe, key: string, value: string | number): AvatarRecipe {
  if (recipe.family !== 'illustrated')
    return { ...(recipe as unknown as Fields), [key]: value } as unknown as AvatarRecipe;
  if (key === 'species')
    return withAvatarSpecies(recipe, value as IllustratedAvatarRecipe['species'] & string);
  if (SPLIT.has(key))
    return {
      ...withAvatarSpecies(recipe, recipe.species ?? 'human'),
      [key]: value,
    } as IllustratedAvatarRecipe;
  if (DETAIL.has(key))
    return {
      ...(detailedAvatarRecipe(recipe) as unknown as Fields),
      [key]: value,
    } as unknown as AvatarRecipe;
  const next = { ...recipe, [key]: value } as IllustratedAvatarRecipe;
  if (key !== 'hair' || recipe.bangs === undefined) return next;
  const { bangs: _b, sideHair: _s, backHair: _h, ...plain } = next;
  // The bare style is re-split; a version 2 recipe keeps its species and mirrors the new side.
  const split = detailedAvatarRecipe(plain as unknown as IllustratedAvatarRecipe);
  return {
    ...split,
    ...(split.assetVersion === 2
      ? { rightSideHair: split.sideHair as NonNullable<IllustratedAvatarRecipe['rightSideHair']> }
      : {}),
    spacing: next.spacing ?? 0,
    height: next.height ?? 0,
    hairLength: next.hairLength ?? 0,
  } as IllustratedAvatarRecipe;
}

function shuffled(recipe: AvatarRecipe): AvatarRecipe {
  const spec = FAMILIES[recipe.family];
  const pick = <T,>(values: readonly T[]) => values[Math.floor(Math.random() * values.length)]!;
  const next: Fields = { ...(recipe as unknown as Fields) };
  const own = (key: string) => !SPLIT.has(key) || recipe.family !== 'illustrated';
  for (const [part, values] of Object.entries(spec.parts)) if (own(part)) next[part] = pick(values);
  for (const color of spec.colors) if (own(color)) next[color] = pick(spec.swatches[color]!);
  for (const [key, [min, max]] of Object.entries(spec.ranges))
    next[key] = min + Math.floor(Math.random() * (max - min + 1));
  if (recipe.family !== 'illustrated') return next as unknown as AvatarRecipe;
  // Every species is in reach; the body color comes from that species' suggestions.
  const species = pick(AVATAR_SPECIES);
  const random = withAvatarSpecies(next as unknown as IllustratedAvatarRecipe, species);
  for (const color of AVATAR_PIECE_COLORS) delete random[color];
  return {
    ...random,
    sideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    rightSideHair: pick(AVATAR_HAIR_PARTS.sideHair),
    skinColor: pick(AVATAR_SPECIES_SWATCHES[species]),
  };
}

function swatchesFor(spec: FamilySpec, fields: Fields, key: string): readonly string[] {
  if (key !== 'skinColor' || fields['family'] !== 'illustrated') return spec.swatches[key]!;
  const species = (fields['species'] ?? 'human') as keyof typeof AVATAR_SPECIES_SWATCHES;
  return AVATAR_SPECIES_SWATCHES[species];
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
  onUpload,
  onRemoveImage,
  imageBusy = false,
  t,
}: {
  bot: BotSummary;
  channelId: string;
  onSave(channelId: string, recipe: AvatarRecipe): Promise<boolean>;
  onUpload?: (() => void) | undefined;
  onRemoveImage?: (() => void) | undefined;
  imageBusy?: boolean | undefined;
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
  const fields = (draft?.family === 'illustrated'
    ? detailedAvatarRecipe(draft)
    : draft) as unknown as Fields | undefined;
  const set = (key: string, value: string | number) => {
    if (draft) update(withPart(draft, key, value));
  };
  const current = bot.avatar !== undefined && bot.appearance === undefined ? 'image' : 'design';
  const inUse = <Tag tone="success">{t('profile.avatar.current')}</Tag>;
  return (
    <section
      className="bh-profile-section bh-avatar-section"
      aria-label={t('profile.avatar.section')}
    >
      <h2 className="bh-profile-section-title">{t('profile.avatar.section')}</h2>
      <div className="bh-avatar-editor">
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
            indicator={false}
            t={t}
          />
        </div>
        <div className="bh-avatar-editor-controls">
          {draft ? (
            <>
              <h3 className="bh-avatar-editor-title">
                <span>{t('profile.avatar.designTitle')}</span>
                <PersonaBotStatusBadges state={state} attention={bot.attention} />
              </h3>
              <p>{t('profile.avatar.designDescription')}</p>
            </>
          ) : (
            <>
              {bot.appearanceUnsupported ? (
                <p className="bh-avatar-unsupported" data-avatar-unsupported role="note">
                  {t('profile.avatar.unsupported')}
                </p>
              ) : null}
              <SidebarCardList className="bh-avatar-methods" label={t('profile.avatar.section')}>
                <SidebarCardRow
                  icon="palette"
                  title={t('profile.avatar.designTitle')}
                  chips={current === 'design' ? inUse : undefined}
                  meta={t('profile.avatar.designDescription')}
                  state={current === 'design' ? 'current' : undefined}
                  detail={
                    <div className="bh-profile-avatar-actions">
                      <button
                        data-avatar-edit
                        type="button"
                        className="bh-profile-action"
                        disabled={bot.appearanceUnsupported === true}
                        onClick={start}
                      >
                        {t('profile.avatar.design')}
                      </button>
                    </div>
                  }
                />
                {onUpload === undefined ? null : (
                  <SidebarCardRow
                    icon="image-up"
                    title={t('profile.avatar.uploadTitle')}
                    chips={current === 'image' ? inUse : undefined}
                    meta={t('profile.avatar.uploadDescription')}
                    state={current === 'image' ? 'current' : undefined}
                    detail={
                      <div className="bh-profile-avatar-actions">
                        <button
                          data-avatar-upload
                          type="button"
                          className="bh-profile-action"
                          disabled={imageBusy}
                          onClick={onUpload}
                        >
                          {t('profile.avatar.upload')}
                        </button>
                        {bot.avatar === undefined || onRemoveImage === undefined ? null : (
                          <button
                            data-avatar-remove
                            type="button"
                            className="bh-profile-action"
                            disabled={imageBusy}
                            onClick={onRemoveImage}
                          >
                            {t('profile.avatar.remove')}
                          </button>
                        )}
                      </div>
                    }
                  />
                )}
              </SidebarCardList>
            </>
          )}
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
                      {swatchesFor(spec, fields, key).map((value) => (
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
                        value={String(fields[key] ?? fields['hairColor'])}
                        onChange={(event) => set(key, event.currentTarget.value)}
                      />
                      {fields[key] !== undefined &&
                      (AVATAR_PIECE_COLORS as readonly string[]).includes(key) ? (
                        <button
                          type="button"
                          className="bh-avatar-color-reset"
                          data-avatar-color-reset={key}
                          onClick={() => {
                            const { [key]: _removed, ...rest } = draft as unknown as Fields;
                            update(rest as unknown as AvatarRecipe);
                          }}
                        >
                          {t('profile.avatar.followHairColor')}
                        </button>
                      ) : null}
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
                      recipe={withPart(draft, category, value)}
                      selected={fields[category] === value}
                      label={t(spec.option(category, value))}
                      onSelect={() => set(category, value)}
                    />
                  ))}
                </div>
              )}
            </fieldset>
          ) : null}
          {draft ? (
            <div className="bh-profile-avatar-actions">
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
            </div>
          ) : null}
          {failed ? (
            <p role="alert" className="bh-error">
              {t('profile.avatar.failed')}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
