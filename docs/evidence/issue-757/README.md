# Issue #757 — Mixed-family Avatar runtime and performance acceptance

Issue: [#757](https://github.com/BotHarness/BotHarness/issues/757), child of hub [#750](https://github.com/BotHarness/BotHarness/issues/750) and source specification [#748](https://github.com/BotHarness/BotHarness/issues/748).

Measured on 2026-10-05 at main `4b211178` plus this change, Apple M3 (24 GB), macOS 26.7.1, Google Chrome 154.0.8037.98 (headless, 1280 × 900, device scale 1), production React build.

## How the numbers were taken

`harness/` mounts the real `PersonaBotAvatar` from client source with the real client CSS:

- Mixed families: every pixel preset, every line preset, and two pixel recipes at the legal geometry extremes (twin tails, side pose, `spacing ±1`, `height ∓1`, `hairLength ±2`).
- Rapid transitions: every Avatar changes state every 700 ms through eight tool symbols, thinking and idle, staggered so that some transition is always running. This is a stress cadence; real tool calls change far less often.
- One in five Avatars carries a pending approval.
- Each run warms up for 2 s and then measures 6 s of `requestAnimationFrame` intervals together with Chrome `Performance.getMetrics`.

Rebuild and run it with:

```sh
NODE_PATH=packages/client/node_modules node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/bin/esbuild docs/evidence/issue-757/harness/entry.tsx --bundle --minify --format=iife --jsx=automatic --define:process.env.NODE_ENV='"production"' --outfile=docs/evidence/issue-757/harness/bundle.js
node docs/evidence/issue-757/harness/measure.mjs          # gradient, cpu, reduce, stale, lifecycle
node docs/evidence/issue-757/harness/measure.mjs family   # pixel-only vs line-only
node docs/evidence/issue-757/harness/measure.mjs scroll   # sidebar column with 256 mounted Avatars
```

Raw rows are in `measurements-before.jsonl` (main) and `measurements-after.jsonl` (this change). "Main thread" is Chrome `TaskDuration` per second.

## What the measurements found and what changed

Before this change, a pixel tool transition rebuilt its whole cell markup, one `<rect>` per run, on every display frame. Thirty-two pixel Avatars transitioning together cost about 1 s of main-thread work per second, and the page fell to 20 fps. In a sidebar column of 256 rows, rows scrolled out of view still restarted their transition, and read computed style, on every state update.

The change touches two places and adds no new library:

- **`@botharness/pixel-morph`** ([BotHarness/BotPixel#3](https://github.com/BotHarness/BotPixel/pull/3)). Transitions advance in 50 ms pixel-art steps (`frameMs: 50`), so a frame is computed only when the step changes. Each step is drawn as one `<path>` per color (`pixelPathMarkup`) instead of one `<rect>` per run. Both are opt-in options; the library's defaults and golden output are unchanged.
- **`illustrated-avatar.tsx`.** An Avatar remembers that it is out of view across updates, so an offscreen row stays still until the observer reports it visible again. Computed style is read only while motion is actually running.

Truthful state, symbols, the 0.5 s symbol hold and both families are unchanged. The saved generator output, recipes and snapshots are untouched.

| Scenario (stress cadence)  | Before: frame p50 / p95 / max | Before: main thread | After: frame p50 / p95 / max                 | After: main thread |
| -------------------------- | ----------------------------- | ------------------- | -------------------------------------------- | ------------------ |
| 1 mixed                    | 16.7 / 16.7 / 16.8 ms         | 45 ms/s             | 16.7 / 16.7 / 16.8 ms                        | 28 ms/s            |
| 8 mixed                    | 16.7 / 16.7 / 16.8 ms         | 323 ms/s            | 16.7 / 16.7 / 16.8 ms                        | 103 ms/s           |
| 32 mixed                   | 16.7 / 16.8 / 33.4 ms         | 796 ms/s            | 16.7 / 16.8 / 16.8 ms                        | 220 ms/s           |
| 64 mixed                   | 33.3 / 50.0 / 83.4 ms         | 967 ms/s            | 16.7 / 16.8 / 33.4 ms                        | 286 ms/s           |
| 128 mixed                  | 66.7 / 233 / 250 ms           | 1036 ms/s           | 16.7 / 16.8 / 50.1 ms                        | 416 ms/s           |
| 32 pixel only              | 50 / 117 / 183 ms             | 1052 ms/s           | 16.7 / 16.8 / 16.8 ms                        | 215 ms/s           |
| 32 line only               | 16.7 / 16.8 / 50.1 ms         | 339 ms/s            | 16.7 / 16.8 / 33.4 ms                        | 177 ms/s           |
| 32 mixed, 4× CPU throttle  | 83 / 283 / 317 ms             | 1043 ms/s           | 16.7 / 16.8 / 50.0 ms                        | 428 ms/s           |
| 64 mixed, 4× CPU throttle  | 167 / 617 / 633 ms            | 1067 ms/s           | 16.7 / 16.8 / 117 ms                         | 714 ms/s           |
| 32 at 96 px                | 16.7 / 33.3 / 83.4 ms         | 894 ms/s            | 16.7 / 16.8 / 66.7 ms                        | 307 ms/s           |
| 32 instances of one Bot    | 16.7 / 33.4 / 50.1 ms         | 894 ms/s            | 16.7 / 16.7 / 33.3 ms                        | 217 ms/s           |
| Column of 256, top         | 16.7 / 117 / 233 ms           | 616 ms/s            | 16.7 / 16.8 / 50.1 ms                        | 278 ms/s           |
| Column of 256, scrolling   | 16.7 / 100 / 217 ms           | 677 ms/s            | 16.7 / 16.8 / 50.1 ms                        | 335 ms/s           |
| 32 static (no transitions) | 16.7 / 16.8 / 16.8 ms         | 23 ms/s             | 16.7 / 16.8 / 16.8 ms                        | 33 ms/s            |
| 32 under reduced motion    | —                             | —                   | 16.7 / 16.8 / 33.3 ms, 0 rAF/s, 0 animations | 46 ms/s            |
| 32 while activity is stale | —                             | —                   | 16.7 / 16.7 / 16.8 ms, 0 rAF/s, 0 animations | 50 ms/s            |

The "Column of 256" before-numbers come from the intermediate build that already had the pixel-step change. That makes them an upper bound on what the offscreen fix alone saves.

Lifecycle after 20 mount/unmount cycles of 32 transitioning Avatars:

- `document.getAnimations()` returns 0.
- No `requestAnimationFrame` callbacks fire in 2 s.
- DOM nodes return to the empty page (14–18).
- Event listeners return to the React root baseline (133).
- JS heap settles near 3.5–4 MB, with roughly 0.15 MB of drift per 20 cycles. A repeat run with forced GC showed node counts fluctuating with GC timing but returning to 14 each time.

Two costs do not come from the Avatar:

- The activity dot matrix (`@botharness/botui-core`) is now shown next to row names. Thirty-two of them animating cost about 250–560 ms/s of main thread even with no Avatar transitions. They do pause under stale and reduced motion.
- In real DSH, bash calls were refused with "Path is outside this Session's authorized workspace" even with a workspace grant. Read and grep in the same workspace succeeded.

Neither is part of this change.

## Asset and bundle cost

| Item                                                                                                  | Measured                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pixel Avatar SVG nodes (static figure)                                                                | 387–459 per Avatar; up to 2,017 at ≥ 96 px while the thinking head-turn frames are mounted                                                        |
| Pixel transition overlay                                                                              | one `<path>` per color, typically 4–10 nodes                                                                                                      |
| Line Avatar SVG nodes                                                                                 | 16–21 per Avatar                                                                                                                                  |
| Avatar renderer modules (core figure, line, symbols, appearance, morphicons, client renderer, morphs) | 75.7 KB minified, 25.5 KB gzip, bundled alone                                                                                                     |
| Avatar-only modules inside the full client bundle (adds editor, excludes shared code)                 | about 81 KB minified, about 28 KB gzip                                                                                                            |
| Full client bundle                                                                                    | 1,359 KB minified, 465.6 KB gzip, against 1,215 KB / 425.0 KB at `397a42fc^` (that difference also includes every unrelated feature merged since) |

## Acceptance budgets

These budgets are derived from the after-measurements with headroom. The supported limit is **32 simultaneously active Avatars visible together**, in the sidebar plus enlarged Profile or editor views. Up to **256 mounted rows** are supported when the rows outside the viewport are scrolled away.

| Budget                                               | Limit                                                        | Measured                     |
| ---------------------------------------------------- | ------------------------------------------------------------ | ---------------------------- |
| Frame p95 with 32 active, stress cadence             | ≤ 16.8 ms (one display frame)                                | 16.8 ms                      |
| Frame p95 with 32 active, 4× CPU throttle            | ≤ 33.4 ms                                                    | 16.8 ms                      |
| Frames over 25 ms with 32 active                     | ≤ 3 %                                                        | 0 % (0 of 360)               |
| Main thread with 32 active, stress cadence           | ≤ 300 ms/s                                                   | 220 ms/s                     |
| Main thread with 32 static                           | ≤ 50 ms/s                                                    | 33 ms/s                      |
| Animation work under reduced motion, stale or hidden | 0 rAF/s, 0 Avatar animations                                 | 0 / 0                        |
| JS heap with 32 active                               | ≤ 40 MB                                                      | 25–36 MB                     |
| Retained after unmount                               | 0 animations, 0 rAF, DOM and listeners at baseline           | met                          |
| SVG nodes per Avatar                                 | pixel ≤ 460 (≤ 2,100 with turn frames at ≥ 96 px), line ≤ 24 | 459 / 2,017 / 21             |
| Avatar code added to the client bundle               | ≤ 90 KB minified, ≤ 32 KB gzip                               | about 81 KB / 28 KB          |
| Bridge traffic while animating                       | no per-frame RPC; 0 appearance or Session writes             | 0–5 reads in 4–5 s, 0 writes |
| Appearance writes per Save                           | exactly 1; 0 for draft and Cancel                            | 1 / 0                        |

## Recognition in light and dark

`recognition-light-dark.png` shows every preset of both families at 18, 24, 40 and 96 px on light and dark surfaces. Every third Avatar shows its tool symbol. The rows are not cropped and show actual size.

- Pixel characters stay distinguishable at 18 px by hair silhouette and tile color.
- Line faces stay distinguishable by expression and tile color.
- Tool symbols read at 24 px and above.
- Each tile carries its own background, so contrast does not depend on the theme.

## Actual DSH path

`real-dsh-path.json` records each step from `.humanlayer/tasks/751-avatar/qa757.mjs`. The run used a local dev Host built from this change, with an isolated profile and real DeepSeek turns.

| Step                            | Result                                                                                                                                                                                                                                                            | Evidence                                                                  |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Edit a draft, then Cancel       | 0 writes, revision unchanged                                                                                                                                                                                                                                      | `00-start.png`, `01-draft.png`                                            |
| Edit, then Save                 | exactly 1 `botAppearanceSet`; fresh read shows the new recipe and revision; the editor preview changed                                                                                                                                                            | `02-saved.png`                                                            |
| Same appearance across Bindings | identical SVG in sidebar (34 px), header (22 px), Profile (64 px) and editor (160 px)                                                                                                                                                                             | `real-dsh-path.json`                                                      |
| Real work plus native approval  | real read turn; bash approval pending with the approval symbol; 240 frames at p95 16.8 ms; 0 bridge requests in that 4 s window                                                                                                                                   | `04-approval-pending.png`, `05-working.png`, `real-work.gif`              |
| Resolution and cancellation     | approvals both allowed and rejected; the Bot returned to idle; appearance unchanged by work                                                                                                                                                                       | `real-dsh-path.json`                                                      |
| Reload                          | same identity in all four Bindings                                                                                                                                                                                                                                | `06-reloaded.png`                                                         |
| Disconnect (Host killed)        | stale notice; 0 Avatar animations while stale                                                                                                                                                                                                                     | `07-disconnected.png`                                                     |
| Host restart                    | stale clears; fresh read returns the same appearance and revision; same identity in all Bindings                                                                                                                                                                  | `08-restarted.png`                                                        |
| Round trip and malformed input  | a full detailed recipe round-trips exactly through the real bridge; nine malformed inputs are rejected without changing the stored appearance                                                                                                                     | `real-dsh-path.json`                                                      |
| Mixed families together         | a pixel Bot, a line Bot and a Bot with a retained unsupported appearance (shown as its saved snapshot) are all active in the sidebar together; both active Bots ran real read/grep turns with approvals; 300 frames at p95 16.8 ms; 5 reads and 0 writes in 5.1 s | `11-mixed-active.png`, `mixed-sidebar.gif`, `09-dark.png`, `10-light.png` |

The nine rejected inputs were an unknown part, a partial hair split, a missing range, a range overflow, a non-integer range, an extra key, a bad color, a future schema and a non-object.

Not claimed here, per #757:

- #123's undelivered attention and waiting axes
- #124 Group expansion
- Live2D
- full sharing and backup
