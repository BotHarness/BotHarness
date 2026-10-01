# Native questions in Human Inbox — #551

## Runtime evidence

These are real DSH browser captures with live DeepSeek native `ask_user_question` requests. No question, answer, or Inbox entry was injected into a second store. Baseline captures use main commit `3acc59ce`; after captures use this change in a separate isolated Profile. Both use Chinese labels and a 1440 × 900 viewport, except the 900 × 900 narrow capture.

| Scene                    | Before                                     | After                                       |
| ------------------------ | ------------------------------------------ | ------------------------------------------- |
| Pending questions, light | [List](before-list-light.png)              | [List](after-list-light.png)                |
| Pending questions, dark  | [List](before-list-dark.png)               | [List](after-list-dark.png)                 |
| Answer location          | [Source DM required](before-source-dm.png) | [Answer in Inbox](after-question-light.png) |

Additional captures show [expanded source context](after-context-light.png), [dark context](after-context-dark.png), [narrow layout](after-narrow.png), [exact source DM navigation](after-exact-source.png), [selected answer](after-choice.png), [custom answer](after-custom.png), [stale answer rejection](after-stale.png), and [the pending Human QA card](human-qa-ready.png).

## Assertions and limits

`scripts/e2e-inbox-native-question.mjs` creates two independent Bot questions, checks their exact prompt and options, and answers through the same `userQuestionAnswer` operation used by the source DM. It checks one canonical Channel resolution for `Canary`, one for custom text `Nightly QA`, removal from pending actions, and each native caller's subsequent `ANSWER_QA:` report. Answering one Bot leaves the other pending. The action query and UI default use oldest-first ordering. Expanded context is chronological and source navigation reaches the original request.

A separate browser context answers a third question in its source DM. The first window's stale Inbox submission is refused and refreshes to expired, with only one canonical resolution. A fourth Bot is left waiting for Human QA. [results.json](results.json) records the assertions from the successful fresh run.

Light/dark checks are screenshot-only theme-attribute changes; they do not test the native theme setting. The narrow check asserts no horizontal document overflow. The first run exposed a test selector that could match the Inbox copy while source navigation was still pending; the script now waits for the Inbox panel to leave before selecting the exact DM card. All published after captures come from the subsequent successful fresh run.

Focused Host/Bridge and rendered Client coverage also tests invalid ownership/options, cancellation, expiry, concurrent answers, and removal from retained older Inbox pages. Existing native question and tool approval tests are included in the regression run. Windows whole-repository format checks encounter baseline CRLF files; changed-file checks pass, and Linux CI is the full verification gate.

## Human QA

Open the isolated DSH instance on port `31998`, enter Bot mode → Inbox → Needs action, and choose **Human Question QA → Answer question**. Select `Canary` or `Stable`, or enter a custom answer, then answer and continue. The action should disappear, its panel should show answered, and the Bot should report the actual answer in its DM. Expand nearby messages and use Open source to inspect the exact original question.

To reproduce from scratch, launch an isolated Profile from this worktree using `scripts/dev-instance.mjs`, set `BH_QUESTION_QA_HOME` and `BH_QUESTION_QA_PORT` to that Profile, and run `node scripts/e2e-inbox-native-question.mjs`. Native pending requests live in the running Host; keep that Host running while reviewing its QA card.
