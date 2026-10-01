# README visual evidence

The product captures in this directory were taken on macOS on 2026-10-01 in the
Mac native Chrome browser (a task-owned incognito window) for Groups, and the
Mac Codex in-app browser for Memory, against the isolated Web Profile launched from
BotHarness main `f0f34fc5` and the pinned DSH `0.2.0-rc.1` CLI. The Profile was
separate from the user's ordinary DSH data. Mira, Theo, Nova, Alex, and the
Observatory exhibit are fictional demo identities and content.

| Asset                     | What it shows                                                                                                                                                                                                                                                                     |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `memory-evolution.jpg`    | The actual Memory evolution graph with a merged branch, commit history, an uncommitted file, and the selected commit's line diff. Fixture files and ordinary Git commits were created in the Bot's isolated Memory Repository, then read through the production Host/Client seam. |
| `group-invite.jpg`        | The actual Group invitation dialog with Nova selected. Completing the invitation added Nova to the Group without a model wake.                                                                                                                                                    |
| `group-collaboration.jpg` | Actual model-generated replies committed to the local Group by three distinct PersonaBots. The Human's mentions used canonical Channel commands; Bot authors and replies were not injected or drawn into the UI.                                                                  |

The README additionally reuses
[`../pr/611-browser-profile-names/ui-completed.jpg`](../pr/611-browser-profile-names/ui-completed.jpg)
from merged [PR #615](https://github.com/BotHarness/BotHarness/pull/615). It shows
a named browser profile, live test-page preview, and Human controls; its caption
does not claim a button click or external send.

Existing Memory evidence from PRs #445 and #469 informed the capture plan;
Group invitation evidence from PR #391 was inspected before recapture. The new shots
avoid the older QA timestamps and use one coherent fictional team. No real IM
message was sent for this README update.

The Memory image is a front-facing 1000 × 530 viewport crop containing the actual
diff, graph, and history. [`memory-evolution-full.jpg`](memory-evolution-full.jpg)
is the unmodified 1280 × 800 browser capture. Only the viewport was cropped; no
perspective effect, generated content, or text replacement was applied. Both
were reopened from disk in the Mac browser and checked at README display width.

`readme-before.jpg` and `readme-after.jpg` compare the Chinese README at
1280 × 720 in the same local GitHub-flavoured Markdown renderer on the Mac
in-app browser. `readme-memory-after.jpg` shows the Memory section at its
actual README width. These are documentation render checks, not GitHub-page
captures or generated application mockups.

`auto-allow-before.jpg` and `auto-allow-after.jpg` compare the Computer/Browser
README table at 1280 × 720 using the same Mac browser and local Markdown
renderer. The baseline is merged main `bf7ce448`; the correction explicitly
conditions Session approval on Auto-allow being off. Runtime settings were not
changed for this documentation correction.
