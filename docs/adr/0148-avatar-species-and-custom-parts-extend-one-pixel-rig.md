---
Status: Accepted
Date: 2026-10-08
---

# Avatar Species and Custom Parts extend one pixel rig

The pixel Avatar is now also the Window Companion mascot ([#1135](https://github.com/BotHarness/DeepSeekBot/issues/1135)), and Humans want animals, fantasy species, plants and their own decorations. Human confirmed the design on 2026-10-08. Species become bases on the existing pixel bust rig rather than new Avatar Families, and Humans may draw bounded pixel Custom Parts that are stored as data in the Avatar Appearance. This partially supersedes [ADR-0118](0118-editable-avatar-appearance-is-independent-of-activity.md): its "free drawing is outside the first scope" and "controlled presets first, uploads later" now allow Human-drawn and imported pixel parts, and still exclude arbitrary markup and imported renderers. This records the accepted target; it does not deliver runtime behavior.

## Species, not families

An Avatar Family owns a skeleton: anchors, layer order and motion (gaze, blink, head turn, speech mouth, transparent companion silhouette). An Avatar Species is a base on one family's rig: head silhouette, ears, nose or muzzle, suggested body colors and default eyes, plus the anchor offsets and the parts it accepts. A different skeleton or visual language is a new family; four-legged pets or face-less plants would be. The first pixel species are human, elf, goblin, dwarf, orc, cat, dog, fox, rabbit, bear and flower. A flower keeps the face rig, with petals in place of hair and stem, leaves or a pot in place of the outfit. Every species must support the full rig contract before release; a static-only species would read as broken in a Window Companion.

Switching species replaces its base parts and keeps hair, colors, outfit, headpiece, accessories and Custom Parts. A choice the new species does not show stays saved and hidden, and returns when a compatible species returns; helmets and hoods hide hair the same way. Nothing is silently substituted. Beards are a lower-face part that always leaves the mouth area visible, so speech stays readable; parts that cover the mouth are not in the first set.

## Parts and colors

Side hair splits into left and right pieces. Bangs, left side, right side, back hair and a single strand each take their own color, which defaults to the main hair color. A new headpiece slot holds markers that pass through hair, such as ears, horns, halos and small head wings, drawn as one layer in front of hair and one behind it; the existing accessories keep their slot. The skin color becomes the body color, so animal fur and goblin green use the same slot, with per-species suggested swatches and free color choice. Animal species add a pattern part drawn in body-color tones.

## Custom Parts and the Part Library

A Custom Part is a bounded pixel grid for one slot. Each cell is empty or a color source (an appearance color slot or a fixed color) plus a small tone step on the rig's shade ramp, so recoloring an appearance recolors its parts. Gradient and noise tools bake tone steps into cells at draw time; no procedural parameters are stored. Custom Parts may fill the headpiece, accessory, hair-piece and pattern slots. Eyes, brows and mouth stay authored rig parts because they need blink and speech frames. A Custom Part follows its slot's anchor, and the rig derives turned poses by the slot's shift and far-side rules, so an imported part animates like a built-in one.

Part content is immutable and identified by a content hash of cells, color references and slot; name, author and origin are metadata outside the hash. Editing produces a new part that records its parent. A built-in part can be opened as a starting canvas; the result is fixed at the shape it had for the current recipe.

Applying a part embeds a copy in the Avatar Appearance, so a shared or exported PersonaBot carries its parts and references never dangle. The Part Library is Host-owned data in the current DSH Profile. Parts drawn locally, parts from an imported PersonaBot and parts from imported files all enter it, deduplicated by content and marked by origin. A single part exports as a PNG with its part data embedded and imports back losslessly; the library exports as a zip of such PNGs. A plain PNG of a slot's size may be imported with a bounded color count and becomes fixed colors.

BotPixel owns the part data type, validation, rendering and the pure drawing algorithms. DeepSeekBot owns the editor, the Part Library and import/export through the PersonaBot owning module and existing Host seams.

## Randomness and compatibility

The editor's random action covers every species and part. A PersonaBot records a lightweight seed version when created: new PersonaBots use a full-domain name seed, while PersonaBots without that record keep today's human-only seed, so no existing unsaved PersonaBot changes face. Until a Human edits it, an Avatar follows its name; after editing, the saved Appearance is fixed and renaming does not change it. A recipe that uses a species, the new hair or headpiece slots or Custom Parts carries a new asset/schema version. Older Clients show its saved snapshot under ADR-0118's fallback, and existing recipes keep byte-identical output and the BotPixel golden fixture.

## Considered options

- **Species as separate Avatar Families** would multiply rigs, mouth states, companion anchors and golden coverage for humanoids that share a skeleton.
- **Species simulated only by free part combination** allows incoherent mixes (muzzle with human nose, two pairs of ears) and gives full-domain random nothing coherent to pick.
- **Many accessory slots** add combinations that become noise at 32×32; finer hair pieces and one through-hair headpiece slot give the variety Humans asked for.
- **Custom Parts as SVG or RGBA images** lose recoloring (RGBA) or reopen the markup trust boundary that ADR-0118 rejected (SVG).
- **Library references instead of embedded copies** make shared PersonaBots depend on another Profile's library.
- **Changing the existing name seed** would change every unsaved PersonaBot's face.

## Consequences

The first tracer bullet is the goblin species, split and separately colored side hair, and a minimal editor (pencil, eraser, fill, mirror, 1× preview) that draws one headpiece, saves it to the Part Library and applies it to a PersonaBot. That PersonaBot animates and speaks in a Window Companion, and the part survives export and import. Gradient and noise, PNG import, the remaining species, derived editing and medieval outfits follow in later slices.

Validation covers legal extremes per species, species switching with hidden-but-kept choices, Custom Part bounds, content-hash deduplication, turned poses of imported parts, the speech mouth under beards, older-Client snapshot fallback, and unchanged golden output for existing recipes.

## Evidence

- [Window Companion specification #1135](https://github.com/BotHarness/DeepSeekBot/issues/1135)
- [Pixel-part editor UX research](../research/2026-10-08-pixel-part-editor-ux.md)
- [Anime 32×32 bust pixel-art techniques](../research/2026-10-04-anime-32px-bust-pixel-art.md)
- [Specification handoff](../research/2026-10-08-avatar-species-and-custom-parts-handoff.md)
