# #754 Line Avatar dot/symbol transitions — verification

Date: 2026-10-04 (Asia/Tokyo). Issue: [#754](https://github.com/BotHarness/BotHarness/issues/754). Builds on the line family from #753 / PR #784.

## Behaviour

When the shared activity presentation of a line-family Avatar really changes, the features briefly dissolve into a fixed set of 12 dots. The dots gather into a symbol for the new presentation and then return to the configured face. Presentation changes include idle ↔ thinking, and switching between working tool effects. The symbols are:

| Presentation | Symbol                |
| ------------ | --------------------- |
| thinking     | `?`                   |
| searching    | magnifier             |
| coding       | sweat drop            |
| executing    | `!` with impact lines |
| other work   | `♪`                   |
| back to idle | smile arc             |

The stable character pose then resumes, along with its normal motion: steps, blink, marks and the thinking head turn. Particles never replace the character for a whole work phase.

## Contract checks

- **Bounded.** The SVG carries one `data-avatar-transition` layer with exactly 12 circles, and every presentation has exactly 12 target points. A transition animates those nodes only. Nothing is created per event.
- **Retargeting.** A change that arrives mid-transition starts from the currently displayed dot transforms and opacities, which cleanup freezes on the existing nodes. It never queues obsolete transitions.
- **Real changes only.** A transition plays only when the presentation key differs from the last one this Avatar showed. Visibility re-syncs no longer restart running animations, because the IntersectionObserver ignores unchanged visibility.
- **Size.** Small avatars (≤64px) use a 450ms transition and move the dots 55% of the way. Large avatars use 900ms with the full symbol.
- **Reduced motion, hidden and offscreen.** Reduced motion, a hidden tab or offscreen state skips the transition and drops any pending one, so it is not replayed when motion is re-enabled. Unmount cancels and releases every owned animation.
- **Saved data unaffected.** Glasses, the manga symbol and other parts hide with the face and return with their saved values. The recipe, snapshot and revision are untouched because the animation is Client-only. The approval count and the `!?` attention mark come from their owning facts, so they update immediately and independently.
- **Scope.** The pixel family has no dot layer and keeps its existing motion.

## Evidence

- Unit tests cover the bounded dot layer for default and extreme geometry, and full target coverage. They also cover transitions on real presentation changes only, size-dependent duration, reduced-motion suppression and no replay after motion is re-enabled.
- In a real isolated DSH run, a real model turn moved the Profile avatar idle → thinking (`?` formed) → idle (smile arc formed), with the face restored after each (`docs/assets/pr/754-line-transition/real-transition.gif`, `thinking.webm`). A real Assignment tool execution with a pending approval was also recorded in light and dark themes and under reduced motion.
- A browser sequence covers every symbol and a mid-transition retarget, for large and small avatars (`transition-sequence.gif`). It uses the same keyframe logic on the same production SVG.
