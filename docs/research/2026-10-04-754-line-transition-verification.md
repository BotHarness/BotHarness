# #754 Line Avatar stroke/symbol transitions — verification

Date: 2026-10-04 (Asia/Tokyo). Issue: [#754](https://github.com/BotHarness/BotHarness/issues/754). Builds on the line family from #753 / PR #784.

## Behaviour

When the shared activity presentation of a line-family Avatar really changes, the strokes of the eyes, brows, nose and mouth morph directly into a symbol for the new presentation, hold briefly, and morph back into the configured face. Presentation changes include idle ↔ thinking, and switching between working tool effects. The symbols are:

| Presentation | Symbol                |
| ------------ | --------------------- |
| thinking     | `?`                   |
| searching    | magnifier             |
| coding       | `</>`                 |
| executing    | `!` with impact lines |
| other work   | `♪`                   |
| back to idle | smiling face          |

The stable character pose then resumes, along with its normal motion: steps, blink, marks and the thinking head turn. The symbol never replaces the character for a whole work phase.

## Technique

The first version moved 12 dots between authored points and read as a particle effect. After review it was replaced by the approach of [morphicons](https://github.com/guillermolg00/morphicons) (MIT, zero dependencies, added as a client dependency):

- Each stroke is resampled to the same number of points by arc length, with corners kept as exact samples.
- Source and target strokes are paired by centroid and length. When the counts differ, strokes split or merge, so nothing appears or vanishes.
- Each pair gets its best rotation and scale (2D Procrustes). The morph interpolates angle and log-scale rather than raw coordinates, so shapes stay whole and turn naturally in flight.
- A damped spring drives progress. A retarget re-plans from the shape on screen and keeps the spring velocity.

The face strokes come from the same markup the Avatar renders (`lineMorphFace`): eyes, brows, nose, mouth, glasses and line cheeks, with the recipe tilt applied around the face pivot. The morph is drawn by one `data-avatar-transition` path. The real face crossfades into the path before the strokes move, and crossfades back while the return leg settles (from 90% progress), so glasses morph instead of popping and filled parts (dot eyes, laugh mouth) return exactly. Colored accessories (the manga symbol) fade with the face.

The line family no longer draws the corner activity marks (`?`, `!`, ♪ and so on); the morph replaces them. The pixel family keeps its marks. The red `!?` attention mark is a separate fact and stays.

## Contract checks

- **Bounded.** The SVG carries exactly one transition path. Face strokes are limited to eyes, brows, nose, mouth, glasses and line cheeks (at most 16 subpaths for any single-part variation), and every symbol has 2–4 strokes. Nothing is created per event.
- **Retargeting.** A change mid-transition continues from the displayed shape and its velocity; it never queues obsolete transitions.
- **Real changes only.** A transition plays only when the presentation key differs from the last one this Avatar showed. Visibility re-syncs do not restart it.
- **Size.** Small avatars (≤64px) use a stiffer, critically damped spring, a shorter hold and a symbol scaled to 80%. Large avatars use a snappy spring with slight overshoot.
- **Reduced motion, hidden and offscreen.** These skip the transition, drop any pending one and cancel frame sampling. Unmount cancels and releases every owned frame, timer and animation.
- **Saved data unaffected.** Glasses and line cheeks morph with the face; blush cheeks and the manga symbol fade with it, and return with their saved values. The recipe, snapshot and revision are untouched because the animation is Client-only. The approval count and the `!?` attention mark come from their owning facts, so they update immediately and independently.
- **Scope.** The pixel family has no transition path and keeps its existing motion.

## Evidence

- Unit tests cover the single transition path, bounded face strokes for every eye, brow, nose and mouth option, symbol coverage, tilt pivots, transitions on real presentation changes only, continuation from the displayed shape on retarget, return to the face, small-size runs, and reduced-motion suppression.
- `docs/assets/pr/754-line-transition/morph-sequence.gif` renders every symbol and a mid-transition retarget with the production SVG and the same morph functions.
- In a real isolated DSH run, a real model turn moved the Profile avatar idle → thinking (`?` formed from the face strokes) → idle (smiling face) and back to the configured face, in both the large preview and the small roster avatar (`real-morph.gif`, `real-morph.webm`, `real-morph-frames.png`), using a recipe with round glasses. The probe saw exactly one transition path and 31 distinct in-flight shapes, and no corner mark appeared while thinking.
