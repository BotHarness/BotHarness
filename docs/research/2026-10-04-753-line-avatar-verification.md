# #753 Line Avatar Family — verification

Date: 2026-10-04 (Asia/Tokyo). Issue: [#753](https://github.com/BotHarness/BotHarness/issues/753). Follows the pixel family delivered in #751 / PR #762.

## Decision

Human chose an original Line-Face-style family as the second Avatar Family: bold rounded strokes drawn on a coloured rounded tile. DiceBear's Line Face (CC0) was the visual reference only. The artwork is original and generated from controlled catalog data, so no third-party asset is vendored.

## What the family contains

- Parts: eyes (16), brows (6), nose (6), mouth (13), cheeks (3), glasses (3), manga symbol (9).
- Colours: background and line colour, each with swatches and a custom picker.
- Bounded geometry, all integers: spacing (−3…3), height (−3…3) and tilt (−10…10°). These are this family's shape parameters. It does not use human hair, skin or outfit anatomy.

Human then asked to enrich the family with Japanese manga symbols (漫符) and kaomoji. The additions are original line drawings of conventional marks:

- kaomoji eyes: `> <`, `T T` with tears, `≧ ≦`, `ಠ ಠ`, `@ @`, `☆`, `´ \``, `◕`
- kaomoji mouths: `ω`, `▽`, `皿`, `3`, `□`
- a manga-symbol part: sweat drop, anger vein (💢), gloom lines (縦線), sparkle (キラキラ), heart, Zzz, music note, steam

The meanings follow the common 漫符 vocabulary, for example sweat for fluster, anger vein for irritation and vertical gloom lines for shock. See [Wikipedia: 漫符](https://ja.wikipedia.org/wiki/%E6%BC%AB%E7%AC%A6) and the [kaomoji guide](https://kaomojis.jp/en/guide). [`manga-kaomoji.png`](../assets/pr/753-line-avatar/manga-kaomoji.png) shows each one.

The catalog sheet is [`line-catalog.png`](../assets/pr/753-line-avatar/line-catalog.png).

## Shared contract

- `AvatarRecipe` is the union of `illustrated` and `line` recipes. Each family validates a closed key set. The Host accepts either through the existing `botAppearanceSet` → Registry → snapshot path. `deriveAvatarAppearance` renders the family's SVG with resvg into the same bounded 512×512 PNG bound to the revision.
- The line SVG exposes the same rig nodes as the pixel family: head, face, gaze, blink, marks and head-turn frames. So the Client animation module is unchanged:
  - head steps and gaze steps
  - blink frame
  - per-effect mark
  - noise-driven thinking head turn, where features move on a sphere projection
  - reduced motion, hidden and offscreen pausing, and disposal
- The tilt lives on the inner face group, so CSS head transforms never override it.

## Editor

A Pixel/Line style switch sits above the category tabs. Switching opens that family's last draft in the session. If there is none, it opens the saved recipe when the saved recipe is of that family, and otherwise the name-seeded recipe for that family. Parts never cross families, and returning to the other family keeps its unsaved draft. Line categories are eyes, brows, nose, mouth, cheeks, glasses, Layout (range sliders) and colours.

## Evidence

Real isolated DSH runs against the rebuilt Host all passed. Recordings and screenshots are under [`docs/assets/pr/753-line-avatar`](../assets/pr/753-line-avatar/):

- draft, Cancel, then Save of a line recipe with spacing 2, tilt −6 and custom colours; the saved family is `line`, and reload shows the same SVG in the sidebar and enlarged views
- a real Assignment Tool execution with an independent pending native approval, in light and dark themes, plus reduced motion, offscreen and unmount cleanup
- a real model thinking turn showing the four head-turn frames
- a Host restart preserving the line appearance with no resurrected approval
- the 390×844 Profile in both themes

Automated coverage spans line parts, legal extremes, malformed input, seeded stability, bounded snapshots, the editor family switch without substitution, and existing pixel regressions.
