# Formal package mouth comparison in actual DSH

Before: source `50b44535a8180a138268c4f52a7fb5581f61de13`, formal
`@botharness/pixel-avatar@0.8.0`. After: source
`a009678599dcc7913e0c3a26de00a856a71f2e7d`, formal `0.10.1` and explicit
Companion-only `speechMouthVersion: 2`. No local tarball or distribution patch.

Both runs use the same isolated Profile, Bot, saved default illustrated
recipe, Chinese/light theme and 1559 × 865 viewport. Each run sends the
same requested text through the real native model and `channel_send`;
canonical reply IDs are newly committed in each run. Earlier history is
retained between runs, so the ordinary Chat history and delivery timing
differ. The opening UI and speaking samples are comparable rather than
pixel-identical captures. Keyboard focus intentionally shows the toolbar.

`qualification.json` records equal recipe, portrait and full-text hashes.
All five captured saved, closed and half-open SVG layers match exactly;
all five full-open layers change to the new flatter artwork. The public
renderer regression independently covers the five pre-rendered turns.
Actual DOM samples observe saved, closed, half-open and open in both runs.
The native bubble close restores the saved mouth in the same document.
Fresh mounts show no historical cards. There are no console errors.

`before.webm` (44.633 seconds) and `after.webm` (40.600 seconds) are
continuous silent official Chrome DevTools MCP screencasts, container-remuxed
only. They show real text revelation, transitions and native dismissal.
Screenshots are unfrozen speaking samples: the filenames `half-open` and
`open` describe the requested capture targets, not a phase guarantee.
The mouth changes while the tool captures; observed states immediately
before/after are included in the qualification. Use the continuous videos
to judge the moving full opening rather than claiming phase-synchronized
screenshots. No interpolation, dubbing, fake text or forced animation state.

Owned browsers are closed after both recordings. Failed onboarding and an
initial activity-dependent turn-count assumption are retained privately and
excluded. The successful runs have five layers in both captured snapshots;
the component normally reduces to its base pose when Activity becomes idle.
Human accepted the formal after recording on 2026-10-09, confirming the
new full opening, preserved half-open mouth and restored expression. Current
delivery status is tracked in Issue #1241 and PR #1254.
