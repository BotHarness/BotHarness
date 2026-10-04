# #800 32×32 pixel Avatar family — verification

Date: 2026-10-04 (Asia/Tokyo). Issue: [#800](https://github.com/BotHarness/BotHarness/issues/800). Follows #751 (pixel family) and #754 (line stroke morph).

## Behaviour

Human review found the 48×48 pixel family too detailed and its activity states hard to tell apart. Several review rounds (see `docs/research/2026-10-04-anime-32px-bust-pixel-art.md` and the Human references in the thread) led to a native 32×32 chibi rig in `packages/core/src/bots/avatar-pixel.ts`:

- **Proportions.** A large head over a short torso. Faces, hair, outfits and accessories are authored directly on the 32 grid; nothing is downsampled from the old 48-unit art.
- **Face.** 4×4 eyes with a thick upper lid, iris shading and a shine pixel; 1–3px mouths; a single soft nose pixel; blush under the eyes.
- **Hair.** Low, thick bangs with clump tips and strand lines, a four-step value ramp lit from the top left, an angel-ring highlight, a darker inner layer against the face and pointed side locks.
- **Clothes.** Collar and trim details per outfit, plus a chin shadow, sleeve seams, a right-side shadow and a left-shoulder highlight.
- **Outline.** A near-black, hue-tinted silhouette outline.
- **Catalog additions.** Hair `wavy`, `braids`, `wolf`, `ahoge`; outfits `dress`, `kimono`, `cardigan`, `maid`, `jacket`; accessories `beret`, `ribbon`, `headband`, `bunnyears`, `horseears`, `flowercrown`, `witch`, `pins`. Existing values are unchanged, so saved recipes stay valid.
- **Presets.** Twelve curated recipes (`AVATAR_PRESETS`) appear as a Presets tab in the Profile editor; choosing one replaces the draft, which still needs Save.
- **Solid tile.** The existing `backdrop` values map to solid colours.
- **State icon.** While thinking or working, a bubble in the top-right corner shows `?`, magnifier, `</>`, `!` or ♪, drawn from the line family's symbol strokes and morphed with morphicons when the activity changes. The old pixel corner marks are removed.

## Contract checks

- **Still a static, inert SVG.** One state-icon path per Avatar, no ids, defs, scripts, images or URLs; every static pixel stays inside the 32-grid rounded tile (radius 6).
- **Reduced motion, hidden and offscreen.** The state icon is still shown, without a morph, so the state remains readable; head steps, blink and the thinking head turn keep their existing gates. Unmount cancels and releases frame sampling.
- **Small sizes.** The bubble shows above 30px (the sidebar avatar keeps it); smaller composer chips omit it.
- **Independent facts.** The red `!?` attention mark and the approval count are unchanged and independent of the state icon.
- **Snapshots.** A saved Avatar's Host PNG snapshot is re-derived on its next save; the Client renders the new artwork immediately from the recipe.

## Evidence

- `docs/assets/pr/800-pixel32/before-after-48-vs-32.png`: the same recipes at 48×48 (top) and the new 32×32 rig (bottom), large and small.
- `presets.png` and `catalog.png`: the twelve presets, and every hairstyle, outfit and accessory.
- `state-icons.png` and `state-icon-morph.gif`: every state icon, and the morph between them on production SVG with the same functions the Client uses.
- Real DSH: a real Assignment tool execution with a pending approval shows the `!` state bubble, in light and dark themes, in the Profile preview and the sidebar (`working-light.png`, `working-dark.png`, `sidebar-light.png`, `sidebar-dark.png`, `real-activity.webm`).
- Unit tests cover the 32 grid, tile clipping, glasses bridge, single state-icon path, state icon visibility by size and state, morph retargeting from the displayed shape, and the still icon under reduced motion.
