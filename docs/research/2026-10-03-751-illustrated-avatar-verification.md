# Illustrated Avatar first-slice verification

Scope: [#751](https://github.com/BotHarness/BotHarness/issues/751), under
[spec #748](https://github.com/BotHarness/BotHarness/issues/748) and
[ADR-0118](../adr/0118-editable-avatar-appearance-is-independent-of-activity.md).
Implementation reviewed at `23e37c93745ddf1cfe0eb57b6c425c6e0cee5477`, based on
`db6f1bb3ccee4b491ef8bc1e1ce68a1bbbfb068b`. Follow-up commits add verification
coverage and evidence; the first Human visual acceptance is pending.

## Observable path

The real isolated DSH 0.2.0 RC1 Profile offered two face shapes, three hairstyles,
optional glasses and three color controls. An unsaved bob/glasses draft did not
reach the Host. Cancel restored the committed choice. Explicit Save stored the
long-face/sweep/glasses recipe and its Host-derived PNG together.

Authenticated re-read returned the recipe/revision and the existing snapshot URL,
without embedding raster bytes. Sidebar and the 160px Profile preview had identical
SVG contents after a browser reload. Fresh Registry coverage independently checked
the same durable record and exact served PNG bytes.

Real model Turns created owned Assignment Sessions through an existing Workspace
Grant. One native `bash` call executed a 75-second wait and returned
`AVATAR_ASSIGNMENT_READY`; another owned Assignment's native approval remained
pending. Both sidebar and large Profile showed `working` / `executing` with an
independent approval count of one. Rejecting the other request cleared the count.
No historical approval resurrected after Host restart: a new Projection generation
read the same appearance revision and zero pending approvals.

An earlier approved Orchestrator Shell call was refused by the native authorized
workspace guard. Its failure was retained; it is not execution proof. The actual
successful execution above used the granted Assignment seam. The development
pitfall is recorded in [dsh-dev](../../.agents/skills/dsh-dev/SKILL.md).

## Initial measurements

Chrome `153.0.8010.36`, macOS arm64, 1440×960, one Bot and four visible Avatar
instances (34px, 22px, 64px and 160px). These are initial measurements, not the
mixed-family scale acceptance reserved for #757.

| Observation                                                        | Result                                                                                   |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 119 steady requestAnimationFrame intervals during actual execution | median / p95 16.7ms                                                                      |
| Whole-page JavaScript heap sample                                  | 54.73 MiB, including native shell, charts and conversation                               |
| Saved 512×512 PNG                                                  | 22,072 decoded bytes; limit 131,072                                                      |
| Client bundle                                                      | 1,912,562 raw bytes / 502,163 gzip bytes; base build reported 1.90 MB, candidate 1.91 MB |
| Shared reduced motion                                              | zero composed-SVG animations; activity and approval facts remain visible                 |
| Offscreen Profile preview / removed editor                         | zero remaining owned pose animations                                                     |

The renderer uses local Web Animations on stable SVG nodes; frame samples cause no
Registry writes, RPC calls or SessionEvent emission. Visibility-change regression
checks cancel and resume each mounted instance independently. Both head and gaze
retarget from their displayed transforms before looping.

## Regression and review

- Full suite: 268 files passed, 2,150 tests passed, three existing skipped cases.
- Typecheck, lint, formatting, bilingual Release Ledger and DSH Skill Ledger passed.
- Focused coverage includes atomic writer refusal, invalid/version/color rejection,
  trusted DM targeting, snapshot bounds, image compatibility, Save/Cancel/failure,
  same-Bot instance isolation, hidden/reduced-motion cancellation and cleanup.
- Independent Standards and Spec reviews found one gaze transition issue; it was
  corrected and both axes reported no remaining code findings.

## Human reproduction

1. Build this branch and launch a fresh task-owned Profile using
   `node scripts/dev-instance.mjs --home <isolated-home> --port <free-port> --build`.
   Use the launcher's local login URL; keep its token and cookies private.
2. Create a PersonaBot, open its Profile, choose **Design avatar**, change parts
   and colors, then Cancel. Reopen, change a choice and Save.
3. Compare its sidebar identity with the large preview; reload, reconnect and
   restart the exact isolated Host. The saved identity must recover.
4. Authorize a dedicated QA Workspace. Ask the Bot to create two bounded
   Assignments whose native Shell commands only wait and print markers. Approve
   one call once; leave the other pending. Inspect execution and its separate
   approval count in the sidebar and Profile. Reject the remaining request and
   check that the count clears after another Host restart.
5. Exercise the shared reduced-motion preference, scroll the large preview out
   of view and close Profile. Inspect both 1440×960 and 390×844, light and dark.

Screenshots and original browser recordings are under
[`docs/assets/pr/751-avatar`](../assets/pr/751-avatar/). The PR embeds the matched
Before/After views and uploaded playable videos. Detailed editing, the abstract
family, compatibility fallback and full mixed-family scale remain #752–#757.

## Artwork redesign (2026-10-04)

Human rejected the first artwork as unattractive. Diagnosis of that version:
uniform 2px outlines everywhere, which blurred into noise at 22/34px; heavy
glasses and an L-shaped nose dominated the face; a floating bust with no
backdrop lost its silhouette, and dark outlines and hair sank into the dark
shell; the helmet-like hair masses barely differed between styles.

Three original directions were compared at 22/34/64/160px in both themes
([sheet](../assets/pr/751-avatar/redesign-directions.png)): flat colour on a
tinted disc, bold ink on a disc, and an outline-only sketch. The flat-disc
direction was chosen and polished: outline-free shapes with light volume
(hair shadow and highlight, ear and neck shading, cheeks), larger eyes with
catch-lights and an open smile, distinct sweep/crop/bob silhouettes, rounded
glasses, and an opaque recipe-tinted disc so dark hair stays readable on dark
shells. Shoulders follow the disc edge, so the markup still needs no `defs`,
clip paths or ids. All 12 head/hair/accessory combinations and five palettes
are on the [catalog sheet](../assets/pr/751-avatar/redesign-catalog.png).

Motion keeps the same lifecycle and node contract: each working effect now has
its own gaze direction, the large avatar blinks once per loop and occasionally
while idle, and small avatars stay still when idle and use shorter, smaller
moves while working.

The recipe schema, asset version and rig version are unchanged: version 1 has
not shipped, so this redesign replaces the unreleased asset rather than adding
a second one. The QA profile was saved again so its snapshot and revision were
derived from the new artwork. All runtime steps above were re-run against the
rebuilt Host: draft/Cancel/Save/reload, real Assignment work with one pending
native approval in both themes, reduced motion, offscreen and unmount cleanup,
narrow layouts and a Host restart. With 4 visible instances, steady rAF p95
was 16.7ms.
