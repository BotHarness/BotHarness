# #548 Human Inbox personal replies — runtime evidence

Baseline: main `595469cd022bbd98c9ff2a6fe2847ceaa578d543` (includes #547).

Compatibility was rechecked after integrating main `a3d88bbab25d2479ae435c9a8c1441c747cea20e`: 93 focused Host/Bridge/Client tests passed and the same live-model browser path passed again. Linux CI run [36764193475](https://github.com/BotHarness/BotHarness/actions/runs/36764193475) passed lint, repository formatting, typecheck, the full test suite, build, generated-artifact checks and docs build.

The baseline screenshot shows the earlier Channel unread summary. The final screenshots use a fresh isolated DSH Profile with two live DeepSeek PersonaBots: Launch Planner QA in Launch review QA, and Release Reviewer QA in Release checks QA. Human asks each Bot for one remaining readiness check; each Bot commits its answer through `channel_send` with a real reply reference to that Human message.

## Verified in the running app

- Each direct Group reply appears once in “Replies to me”; it does not also create an “Other unread” Channel row. The sidebar still counts all distinct unread Source Events.
- Bot and Channel filters use the existing Host query. A second browser window returns the same canonical reply identities.
- Open “Reply”, expand nearby messages, and inspect chronological author/avatar/time rows and the highlighted target. Viewing the actual message advances the shared canonical read position; previews leave it alone.
- Write and send a reply in Inbox. Exactly one Human Channel message is committed with the captured Bot message as `replyTo`.
- “View source” opens the confirmed Human reply at its exact Channel position.
- A Host restart with the same isolated Profile preserves the personal projection and read state.
- Light/dark 1440×900 and narrow 900×1100 layouts were captured. Expanded context scrolls while reply controls remain available.

## Human QA

1. Open the task-local DSH instance on port 31988, select Bot mode, then Inbox → “回复我”.
2. Compare both Bot replies and filter by Bot or Channel. An already read reply remains available for inspection.
3. Select “回复”, expand “查看附近消息”, and inspect the source quote, chronological messages and reply target.
4. Enter your answer and send it. Then select “查看来源” to inspect that exact reply in its Group.

The isolated Profile is machine-local; its authentication URL and provider credentials are never committed. To recreate the scene, start the helper with the temporary home `bh-548-human-qa` and port 31988, then run `node scripts/e2e-human-personal-replies.mjs seed`, followed by `verify`; after restarting the same Profile, run `restart`.

## Automated checks

- Focused Host/Bridge/Client checks passed, including Group visibility, pagination/filter-bound cursors, shared reads, restart reconstruction, preserved drafts, retry identity and chronological context.
- Typecheck, lint, task-file formatting, build and bilingual changelog checks passed.
- Windows full suite ran once: **1422 passed, 22 failed, 1 skipped**. Eighteen failures were 15-second timeouts in existing unrelated tests; four involved POSIX path expectations, a Windows-invalid quoted filename or CRLF. Linux CI is the full-suite gate; this run is not reported as green.
- Standards review findings (English architecture sync and typography) were fixed and rechecked. Spec review found no issue.

See `result.json` for the actual canonical source/reply identities and restart result, and the adjacent PNG files for runtime screenshots.
