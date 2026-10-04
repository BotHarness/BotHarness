# Slack source-context E2E — #819

Real isolated Host, existing QA Bot identity, DoodleBear workspace, only `botharness-im-qa-802`.

- Before: main `eb3f83b0`, existing #802 source before any successful context read; Slack history was unavailable. The screenshot is the previous source/absence state, not the same test request.
- After: runtime `93b89531`, including latest main `f5bc7213`; Provider `b020d3bab941aeb9acc303b719e691554ef10ec4`. Both screenshots use the same 1230×820 viewport, Chinese locale and dark theme. Avatar changes came from integrated main; this PR has no Client styling changes.
- `context-identifiers.png`: returned ordinary text displays Human name, native message ID and canonical Source Event ID through the existing Source Modal.
- `slack-final.png`: actual model reply in the original native thread, with both independently read QA codes and pagination counts.
- `runtime-proof.json`: allowlisted synthetic QA messages, native IDs, context audit and checked provider-accepted Outbox receipt. No credentials or auth URL.

## Reproduce

1. Open the retained QA Profile and Slack QA thread. PersonaBot: **Slack Intake QA #802**.
2. Send ordinary thread and channel text without a genuine Bot mention. They must not enter Inbox.
3. In the original thread, genuinely mention **BotHarness Slack QA** and ask it to use `bridge_context` for `thread`, `group`, `nearby`, follow returned `nextCursor` until absent, then use `bridge_reply` to report the two QA codes in that thread.
4. Bot sidebar → Bot Inbox → `botharness-im-qa-802` → handled history → `[BH819 FINAL]` → external source. Inspect context and message details.

Final model run: two pages for each scope, ORCHID-819 from thread and MAPLE-819 from channel history, own Bot reply `1791138734.760259`. Thirty-two ordinary QA sources were retained by explicit reads, **zero** ordinary Inbox admissions or Channel placements. Native thread read returned 18 distinct Human messages, with no repeated root. Historical reads do not dispatch Inbox/wake.

Nearby: first candidate proved all 21 Human channel texts in a dense ±5-minute window across two pages; final candidate proved sparse-window fallback to ten closest older channel texts. The first candidate's thread failure is retained in the audit; a native pinned-root/order probe reproduced it and focused regressions drove the final fix.

Coverage is Provider-visible Human text. Unsupported/Bot/subtype rows and count-excluded rows may remain omitted; exhausted cursor is not a promise of complete Slack history. Channel history/nearby does not promise every child-thread reply. Private/DM history, files, search, ordinary-message subscriptions and proactive posts are outside this slice. No scope or credential expansion.

## Verification

- Latest-main lint, format, typecheck, build and full tests: **2353 PASS / 9 SKIP**.
- Provider focused checked/history regressions: **21 PASS**.
- Provider full suite: **3536 PASS / 0 FAIL / 0 SKIP**. First run hit an unrelated Matrix temporary-directory teardown `ENOTEMPTY`; unmodified Matrix focused and full-suite reruns passed. No assertion/timeout changes.
- Issue claim: https://github.com/BotHarness/BotHarness/issues/819#issuecomment-5982673448
- Agent task: `codex/local/01a0f14c-5338-7020-853b-0fe54b87aa95`.
