# Human Inbox: handled history and action triage

Issue [#553](https://github.com/BotHarness/BotHarness/issues/553), parent [#126](https://github.com/BotHarness/BotHarness/issues/126).

## Real scenario

Several PersonaBots ask native questions, request tool approval and need a project folder. The Human answers choices and custom text, approves or rejects tools, authorizes a Workspace Grant, and responds to waiting and blocked Assignment reports. The real DeepSeek Orchestrators and Assignment Sessions continue through the existing source commands.

Those canonical Human responses appear once in Handled history. Bot and source DM filters narrow the list. View context shows the original request and actual Human answer; View response opens its exact DM message. Assignment context highlights the addressed report, while Open Session opens the original native DSH Session.

A separate browser window answers another native question in its original DM. The first window finds exactly one new history row. After Host restart, the same history identities remain and the answer is still visible without a live native question broker.

## Evidence

Unedited captures from an isolated DSH 0.2.0 RC1 Profile using real DeepSeek model calls, captured on 2026-10-02 local time. No request, answer, or execution was mocked. Only selected screenshots are committed; authentication URLs, logs and private scene IDs stay local.

| Behavior                                          | Capture                                                 |
| ------------------------------------------------- | ------------------------------------------------------- |
| Cross-Bot completed actions                       | [Light](history-light.png), [dark](history-dark.png)    |
| Bot and DM filters                                | [Scoped list](history-filtered.png)                     |
| Original native question                          | [Context](history-question-context.png)                 |
| Canonical Human answer after restart              | [Answer in context](history-question-answer.png)        |
| Precise DM answer navigation                      | [Original DM](history-exact-response.png)               |
| Exact blocked report and committed Human response | [Assignment context](history-assignment-context.png)    |
| Source-side answer from another browser window    | [Updated history](history-two-window-source-answer.png) |
| Narrow viewport, readable content above controls  | [420px](history-narrow.png)                             |
| Canonical history after Host restart              | [Restored list](history-after-restart.png)              |

## Human QA

1. Open Bot mode → Inbox → Handled. Compare question, tool decision, Grant and Assignment records with their source Bot DM.
2. Filter by Bot and Channel; change sort. Open context, expand nearby messages and scroll to the canonical answer. Open View response and verify the exact answer, not the latest DM message.
3. For an Assignment, compare the highlighted report and response; Open Session should enter the original native DSH Session.
4. Verify Handled items cannot be answered again. Reading a message or ignoring an informational completion report must not manufacture a history row or clear a separate live action.
5. At more than 150 loaded rows, automatic updates visibly pause to preserve older browsing. Load more retains the current rows; Refresh current list retains filters and reconciles at most three pages with a fresh cursor. A successful action still refreshes canonical state.

## Reproduce

Launch a fresh isolated Profile with `scripts/dev-instance.mjs`, pointing at this worktree and a selected port. Configure the browser directory picker as described in the [DSH development guide](../../../../.agents/skills/dsh-dev/SKILL.md). Set `BH_HISTORY_QA_HOME` and `BH_HISTORY_QA_PORT` to that Profile.

```text
node scripts/e2e-inbox-handled-history.mjs seed
```

The seed run invokes the existing actual-model question, tool-approval and Grant/Assignment scenarios through the real Host and UI. Use a fresh Profile for seed. To review already-created sources without reseeding:

```text
node scripts/e2e-inbox-handled-history.mjs check
```

Restart that same Host, then verify persisted history and exact canonical answer context:

```text
node scripts/e2e-inbox-handled-history.mjs resume
```

## Regression boundaries

Host/Bridge tests cover four response families, stable scoped cursors including timestamp ties, read/action independence, stale and concurrent commits, restart, and answered blocked asks followed by a new explicit report. Client tests cover exact request/response navigation, distant native answers with expired brokers, canonical page reconciliation, stale filter responses, and all three polling/load-more race orders.

Messaging generation 45 adds target/time indexes only. Actual SQLite query plans use target searches for first responses and a time range seek for cursor pages; each response-family branch limits candidates before the final merge. No history table or copied message authority is added.

Local lint, typecheck, build and focused regressions passed. The PR's Linux workflow supplies the full-suite and documentation gate; the Windows full-suite attempt encounters attachment/path and timing failures.
