import { useMemo, useRef, useState, type ReactElement } from 'react';
import {
  AVATAR_COLORS,
  PART_SLOTS,
  PART_TONES,
  avatarSvg,
  createCustomPart,
  emptyPartLayer,
  fillPartLayer,
  paintPartLayer,
  partLayer,
  partToneColor,
  withAvatarCustomPart,
  isHairPartSlot,
  type PartSlot,
  type IllustratedAvatarRecipe,
  type PartColor,
  type PartInk,
  type PartLayer,
  type PartLayerName,
  type PixelCustomPart,
} from '../../../core/src/bots/avatar-appearance.js';
import type { BotHarnessTranslate } from './locale.js';

type Key = Parameters<BotHarnessTranslate>[0];
type Tool = 'pencil' | 'eraser' | 'fill';
type Layers = Record<PartLayerName, PartLayer>;

const FIXED_COLORS: readonly PartColor[] = [
  '#efb93f',
  '#f4f1ec',
  '#1d1b22',
  '#e2565f',
  '#f06292',
  '#5a7be0',
  '#3d9970',
  '#8a5ad0',
];
const TOOLS: readonly Tool[] = ['pencil', 'eraser', 'fill'];
const MIN_ZOOM = 6;
const MAX_ZOOM = 16;

function inkColor(recipe: IllustratedAvatarRecipe, ink: PartInk): string {
  const base = ink.color.startsWith('#') ? ink.color : recipe[ink.color as 'hairColor'];
  return partToneColor(base, ink.tone);
}

export function CustomPartEditor({
  slot = 'headpiece',
  note,
  backdrop: shownBehind,
  recipe,
  initial,
  onChange,
  onSave,
  onCancel,
  t,
}: {
  slot?: PartSlot | undefined;
  note?: string | undefined;
  backdrop?: IllustratedAvatarRecipe | undefined;
  recipe: IllustratedAvatarRecipe;
  initial?: PixelCustomPart | undefined;
  onChange(part: PixelCustomPart): void;
  onSave(part: PixelCustomPart, name: string): Promise<boolean>;
  onCancel(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const { width: W, height: H } = PART_SLOTS[slot];
  const hair = slot !== 'headpiece';
  const [layers, setLayers] = useState<Layers>(() => ({
    front: initial ? partLayer(slot, initial.front) : emptyPartLayer(slot),
    back: initial ? partLayer(slot, initial.back) : emptyPartLayer(slot),
  }));
  const [past, setPast] = useState<Layers[]>([]);
  const [future, setFuture] = useState<Layers[]>([]);
  const [layer, setLayer] = useState<PartLayerName>('front');
  const [tool, setTool] = useState<Tool>('pencil');
  const [mirror, setMirror] = useState(true);
  const [ink, setInk] = useState<PartInk>({ color: 'hairColor', tone: 0 });
  const [zoom, setZoom] = useState(10);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const drawing = useRef<Layers | undefined>(undefined);
  const bare = useMemo(() => withAvatarCustomPart(recipe, slot, undefined), [recipe]);
  const part = useMemo(() => createCustomPart(slot, layers), [layers]);
  const wearing = useMemo(() => withAvatarCustomPart(recipe, slot, part), [recipe, part]);
  const backdrop = useMemo(() => avatarSvg(shownBehind ?? bare), [shownBehind, bare]);
  const preview = useMemo(() => avatarSvg(wearing), [wearing]);
  const empty = part.front.length === 0 && part.back.length === 0;

  const commit = (next: Layers) => {
    setLayers(next);
    onChange(createCustomPart(slot, next));
  };
  const applyAt = (base: Layers, x: number, y: number): Layers => {
    const value = tool === 'eraser' ? null : ink;
    const target =
      tool === 'fill'
        ? fillPartLayer(slot, base[layer], x, y, value, mirror)
        : paintPartLayer(slot, base[layer], [[x, y]], value, mirror);
    return { ...base, [layer]: target };
  };
  const start = (x: number, y: number) => {
    setPast((stack) => [...stack, layers]);
    setFuture([]);
    const next = applyAt(layers, x, y);
    drawing.current = tool === 'fill' ? undefined : next;
    commit(next);
  };
  const extend = (x: number, y: number) => {
    if (!drawing.current) return;
    const next = applyAt(drawing.current, x, y);
    drawing.current = next;
    commit(next);
  };
  const stop = () => {
    drawing.current = undefined;
  };
  const undo = () => {
    const previous = past.at(-1);
    if (!previous) return;
    setPast(past.slice(0, -1));
    setFuture([layers, ...future]);
    commit(previous);
  };
  const redo = () => {
    const [next, ...rest] = future;
    if (!next) return;
    setFuture(rest);
    setPast([...past, layers]);
    commit(next);
  };
  const save = async () => {
    if (empty || busy) return;
    setBusy(true);
    const saved = await onSave(part, name.trim());
    setBusy(false);
    setFailed(!saved);
  };

  const cells: ReactElement[] = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const own = layers[layer][y]![x];
      const other = layers[layer === 'front' ? 'back' : 'front'][y]![x];
      const shown = own ?? other;
      cells.push(
        <span
          key={`${x},${y}`}
          className="bh-part-cell"
          data-part-cell={`${x},${y}`}
          data-part-ink={own ? `${own.color}:${own.tone}` : undefined}
          data-part-other={!own && other ? 'true' : undefined}
          style={shown ? { background: inkColor(recipe, shown) } : undefined}
          onPointerDown={(event) => {
            event.preventDefault();
            start(x, y);
          }}
          onPointerEnter={() => extend(x, y)}
        />,
      );
    }

  const rows: { key: string; label: string; color: PartColor }[] = [
    ...AVATAR_COLORS.map((color) => ({
      key: color,
      label: t(`profile.avatar.${color}` as Key),
      color: color as PartColor,
    })),
    ...FIXED_COLORS.map((color) => ({ key: color, label: color, color })),
  ];

  return (
    <div className="bh-part-editor" data-part-editor>
      <div className="bh-part-toolbar" role="toolbar" aria-label={t('profile.avatar.part.tools')}>
        {TOOLS.map((value) => (
          <button
            key={value}
            type="button"
            className="bh-avatar-category"
            data-part-tool={value}
            aria-pressed={tool === value}
            onClick={() => setTool(value)}
          >
            {t(`profile.avatar.part.tool.${value}` as Key)}
          </button>
        ))}
        <button
          type="button"
          className="bh-avatar-category"
          data-part-mirror
          aria-pressed={mirror}
          onClick={() => setMirror(!mirror)}
        >
          {t('profile.avatar.part.mirror')}
        </button>
        <span className="bh-part-divider" aria-hidden="true" />
        {(hair ? [] : (['front', 'back'] as const)).map((value) => (
          <button
            key={value}
            type="button"
            className="bh-avatar-category"
            data-part-layer={value}
            aria-pressed={layer === value}
            onClick={() => setLayer(value)}
          >
            {t(`profile.avatar.part.layer.${value}` as Key)}
          </button>
        ))}
        <span className="bh-part-divider" aria-hidden="true" />
        <button type="button" data-part-undo disabled={past.length === 0} onClick={undo}>
          {t('profile.avatar.part.undo')}
        </button>
        <button type="button" data-part-redo disabled={future.length === 0} onClick={redo}>
          {t('profile.avatar.part.redo')}
        </button>
        <button
          type="button"
          data-part-zoom-out
          disabled={zoom <= MIN_ZOOM}
          aria-label={t('profile.avatar.part.zoomOut')}
          onClick={() => setZoom(zoom - 2)}
        >
          −
        </button>
        <button
          type="button"
          data-part-zoom-in
          disabled={zoom >= MAX_ZOOM}
          aria-label={t('profile.avatar.part.zoomIn')}
          onClick={() => setZoom(zoom + 2)}
        >
          +
        </button>
      </div>
      <div className="bh-part-workspace">
        <div
          className="bh-part-canvas"
          data-part-canvas
          data-part-zoom={zoom}
          style={{ width: W * zoom, height: W * zoom }}
          onPointerUp={stop}
          onPointerLeave={stop}
        >
          <span
            className="bh-part-backdrop"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: backdrop }}
          />
          <div
            className="bh-part-grid"
            style={{
              gridTemplateColumns: `repeat(${W}, ${zoom}px)`,
              gridTemplateRows: `repeat(${H}, ${zoom}px)`,
            }}
          >
            {cells}
          </div>
        </div>
        <div className="bh-part-side">
          <div className="bh-part-preview" data-part-preview>
            <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: preview }} />
            <small>{t('profile.avatar.part.preview')}</small>
          </div>
          <div
            className="bh-part-palette"
            role="group"
            aria-label={t('profile.avatar.part.colors')}
          >
            {rows.map((row) => (
              <div key={row.key} className="bh-part-palette-row" title={row.label}>
                {PART_TONES.map((tone) => {
                  const value = { color: row.color, tone };
                  return (
                    <button
                      key={tone}
                      type="button"
                      className="bh-part-swatch"
                      data-part-ink={`${row.color}:${tone}`}
                      aria-label={`${row.label} ${tone}`}
                      aria-pressed={ink.color === row.color && ink.tone === tone}
                      style={{ background: inkColor(recipe, value) }}
                      onClick={() => {
                        setInk(value);
                        if (tool === 'eraser') setTool('pencil');
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {note ? (
        <p className="bh-avatar-hidden-note" data-part-note>
          {note}
        </p>
      ) : null}
      <label className="bh-part-name">
        <span>{t('profile.avatar.part.name')}</span>
        <input
          data-part-name
          value={name}
          maxLength={60}
          placeholder={t('profile.avatar.part.namePlaceholder')}
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      {failed ? <p role="alert">{t('profile.avatar.part.saveFailed')}</p> : null}
      <div className="bh-avatar-editor-actions">
        <button type="button" data-part-save disabled={empty || busy} onClick={() => void save()}>
          {t('profile.avatar.part.save')}
        </button>
        <button type="button" data-part-cancel disabled={busy} onClick={onCancel}>
          {t('profile.avatar.part.cancel')}
        </button>
      </div>
    </div>
  );
}
