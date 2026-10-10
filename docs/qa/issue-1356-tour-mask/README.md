# Tutorial mask-click verification

Issue: [#1356](https://github.com/BotHarness/DeepSeekBot/issues/1356).
Task: `codex/local/01a12665-4e4a-7542-9a58-5b054f452e33`.
Base: `524fd06f` (current main at the start of PR delivery).
Captured October 11, 2026, Asia/Tokyo, in a fresh isolated DSH 0.2.0-rc.1 Web Profile.

## Real Client behavior

The product-native collaborative browser drove the actual local Client, not a mock page.
All eight configured anchors were present. Each advance used a real click in the mask,
outside the highlighted element and popover; no Next or Done button was used.
Progress advanced from 1 / 8 through 8 / 8. One more mask click removed the tour.
The final-step hook matches the existing Done button; this does not claim completion of
the separate first-conversation/model-response onboarding requirement.

English locale and dark theme were retained throughout. The measured CSS viewport was
1402 × 877; the browser screenshot surface produced 1280 × 800 images. The committed
JPEGs are quality-90 encodings of those unmodified captures. The welcome letter and
default product Bot are disposable QA data. No credentials or personal conversations
are included. The companion can walk between captures.

| Step              | Captured state                                               |
| ----------------- | ------------------------------------------------------------ |
| 1 / 8             | [The welcome letter](01-welcome.jpg)                         |
| 2 / 8             | [Your conversations](02-conversations.jpg)                   |
| 3 / 8             | [Activity Center](03-activity-center.jpg)                    |
| 4 / 8             | [Bot settings](04-bot-settings.jpg)                          |
| 5 / 8             | [Conversation header](05-conversation-header.jpg)            |
| 6 / 8             | [Message box](06-message-box.jpg)                            |
| 7 / 8             | [Channel sidebar](07-channel-sidebar.jpg)                    |
| 8 / 8             | [Window companion](08-window-companion.jpg)                  |
| After final click | [Tour closed through the final-step action](09-finished.jpg) |

The first capture pass caught the Activity Center and Message box during popover fade-in.
Those two states were recaptured after observing computed opacity 1; all published
step images show their popover. No animation or DOM styling was overridden.

## Before / after

For the baseline comparison, the isolated Client was rebuilt with the mask hook removed,
matching the base revision's runtime source, then reloaded against the same Profile.
The baseline [started at 1 / 8](before-01-welcome.jpg); one mask click
[dismissed the tour](before-mask-dismissed.jpg). After restoring and rebuilding the fix,
the same replay again advanced to 2 / 8 on a mask click. No Host/data contract changed.

## Automated checks

- Internal-tour and onboarding suites: 65 tests pass across 8 files; the new mask test
  failed against the previous behavior before the fix.
- Typecheck, lint, build, scoped formatting, bilingual Release Ledger and whitespace
  checks pass on the isolated branch. Lint retains existing warnings.
- Full repository run: 3798 pass, 10 skipped, 4 failures, all 15-second timeouts in
  three unrelated test files: source-policy, bot-contact-discovery and human-dm-steer.
- Rerunning those three files with one worker: all 25 tests pass. This is not described
  as a green full-repository run; CI is a separate result.

## Human review

Launch this branch through `scripts/dev-instance.mjs` with a new isolated home and a free
port, then enter Bot mode. To replay, open Bot settings → General → Continue tutorial.
Click the mask through all eight steps and once more on the last step. Separately verify
that Skip tutorial, the close button and Escape still retain their existing behavior.

No merge, deployment, external IM action or live model request is part of this proof.
The PR stops for Human QA.
