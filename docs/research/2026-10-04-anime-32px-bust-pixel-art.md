# Anime-style 32×32 bust pixel art — techniques

Date: 2026-10-04 (Asia/Tokyo). Context: #800 (pixel Avatar family at 32×32). Question from Human review: how do Japanese pixel artists (ドット絵) make a 32×32 head-and-shoulders anime character look good?

## Findings

**Eyes carry the style.** At 32×32 the eye is the highest-leverage part; moving its width, spacing or height by 1px changes the character ([pixelartlab: 表情パターン](https://pixelartlab.net/tutorials/dot-e-kao-kakikata)). Anime eyes need room: 3×3 is a minimum, 4×4 or larger reads as "big cute eyes" ([Sandro Maglione](https://www.sandromaglione.com/articles/pixel-art-eyes-techniques-and-styles)). The thick upper lid (a full dark top row) is "the single most anime visual cue", with iris below and an optional 1px lower lid ([sprite-ai](https://www.sprite-ai.art/blog/anime-pixel-art)). One highlight pixel in the same position in both eyes keeps the gaze stable ([pixelartlab](https://pixelartlab.net/tutorials/dot-e-kao-kakikata)).

**Mouth and nose stay minimal.** Mouth 1–2px, nose omitted or a 1px dot; expression comes from placement and brow ends (inner end down = anger, outer end down = worry) rather than drawn detail ([pixelartlab: 32x32キャラ](https://pixelartlab.net/tutorials/dot-e-character-kakikata)).

**Hair as clumps, not strands.** Condense hair into 2–3 blocks; strands become noise at actual size. Use base + one shadow + a highlight; a single diagonal row of lighter pixels (the "angel ring") reads as glossy. Put highlights only on the most forward peaks of a clump ([pixelartlab](https://pixelartlab.net/tutorials/dot-e-character-kakikata), [sprite-ai](https://www.sprite-ai.art/blog/anime-pixel-art)). Flowing hair uses 2px strands tapering to 1px tips.

**Outlines are selective and coloured.** Avoid uniform dark outlines everywhere; place boundary colour where planes meet (skin/hair, hair/clothes), use hue-matched dark colours instead of black, and never outline the eyes and brows ([pixelartlab](https://pixelartlab.net/tutorials/dot-e-character-kakikata), [モケモ: ドット絵技術メモ](https://note.com/mokemo/n/n974d4e4edfca)).

**Value contrast over hue; warm shadows.** Small sprites read by brightness difference. Skin uses 3–4 warm tones with shadows shifting toward pink, not grey. 8–24 colours in total ([sprite-ai](https://www.sprite-ai.art/blog/anime-pixel-art)).

**Anti-aliasing only at corners.** Add a 1px mid-tone only where a corner looks sharp; full-perimeter AA blurs the silhouette ([pixelartlab](https://pixelartlab.net/tutorials/dot-e-character-kakikata), [モケモ](https://note.com/mokemo/n/n974d4e4edfca)). Prefer straight runs with graduated steps (3-2-2-1) over forced curves ([森田／イクシール](https://note.com/ixill_morita/n/nf9331b5bb2b2)).

**Checks.** Judge at 1×, test the black silhouette, flip horizontally to catch eye misalignment, and test on light, mid and dark backgrounds.

## Outcome in #800

The first attempts kept the 48-unit geometry and only redrew the face, which Human review still found unattractive. The shipped version follows these findings with a native 32×32 chibi rig: 4×4 thick-lidded eyes, minimal mouth and nose, clumped bangs with tips and an angel ring, a four-step hair ramp, hue-tinted near-black outline, and clothes shaded with a chin shadow, sleeve seams, a side shadow and a shoulder highlight. See `docs/research/2026-10-04-800-pixel32-verification.md`.
