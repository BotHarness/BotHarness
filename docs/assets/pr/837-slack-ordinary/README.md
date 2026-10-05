# Slack ordinary text intake — #837

These are actual browser captures and bounded synthetic QA facts, not UI mocks.

- Baseline: `c25d2b80908d571b9f5ec1bb98802af163166eb3` (the exact tree of main `4db250db1a55e44d7de6ccbf62bc367b9e2c2503`).
- Full policy/model qualification: app `04695fbd3907fd0935426dfe402c19166c6fac98`.
- Latest-main integration and final real model/source capture: app `1d0431a994f9273ee428fb1e08ef2a24fdd88858`, including main `ab919960a4e0ae3102f3e637744dab051c3056dc`.
- Provider: `48e7a35792af5222cd40cfe1ba2607ac55a59df2`; 393 installed runtime files; SHA-256 `15e60e507f8ff3b47ca011ca7f9471a0018f1686cf7e93700d3cc35cb6e43aaf`.
- Browser: Chinese, 1230 × 820. The before/after policy pair uses the same dark theme; the additional final policy/source captures use light theme. The latest-main Avatar change and new processed Inbox counts are incidental to this intake change.

## Real qualification

Human authorized and saved `message.channels` alongside `app_mention` for the existing QA App under its existing `channels:history` permission. BotHarness only accepted the explicitly authorized public QA channel. Credentials stayed local.

| Synthetic probe    | Observation                                                                                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PROBE              | Live ordinary delivery qualified, but mention-only collection created no Source Event or Admission and no wake.                                                                                 |
| COUNT1 / COUNT2    | COUNT1 was observed pending with no ordinary wake. COUNT2 triggered one harvest; both were read with `bridge_read` in model turn 9 and handled together. Policy: count 2, interval 300 seconds. |
| TIMER              | One message with count 10 / interval 5 seconds triggered a wake about five seconds after arrival and a successful source read.                                                                  |
| IMMEDIATE          | A fresh ordinary message queued one next turn and was read successfully.                                                                                                                        |
| FILTER             | Switching back to mention-only excluded the next ordinary message.                                                                                                                              |
| MENTION            | Native Human mention with both subscriptions created one Source, one Admission, one wake and one Outbox reply. Independent native read verified Bot identity, exact text and original thread.   |
| DISABLED / REVOKED | Fresh messages after disabling receive or revoking the target created no Source or Admission.                                                                                                   |
| RESTORE-PROBE      | Restoring the same QA authorization reset to mention-only; a fresh verification probe was excluded.                                                                                             |
| RESTART            | Host restart retained the configured all-text/count-time policy; a new message was read and handled.                                                                                            |
| FINAL              | Latest-main-integrated Host received and handled a fresh message; source Modal displayed the Human name, native message ID and canonical Source Event ID.                                       |

[proof.json](proof.json) contains only these synthetic IDs, policy snapshots, successful model Tool results and the one independently verified reply. Seven Sources/Admissions, six wakes, seven successful model Tool calls, one explicit reply; five excluded probes created zero Sources. Existing private prompts, raw logs, credential references and local paths are omitted.

## Human review path

Open the isolated QA page supplied in the PR handoff, choose **Slack Intake QA #802 → Profile → 频道连接器与授权**. It is left on **all ordinary text**, **count 2 / interval 5 seconds**. Send fresh synthetic Human text in **botharness-im-qa-802**; inspect its processed Inbox item and source Modal. Collection does not require the Bot to reply. Change collection/wake, save, then send a new message; edits affect future arrivals. Switch off receive to retain configuration/history while stopping intake. All-text editing requires fresh delivery verification after a lease/Host restart.

This slice qualifies fresh public-channel Human text and Inbox-only placement. Existing generic Channel placement/Attention is reused. Private/DM traffic, edits/deletions, ordinary file shares, autonomous Slack thread-follow, editable Slack global defaults and remote gap backfill are not qualified here. No new queue, store or Session authority is introduced.

## Regression

App implementation suite: 2414 passed / 9 skipped. Prior main integration: 121 focused tests passed. Final latest-main integration: 115 relevant tests passed, plus lint, format, typecheck, build and both release ledgers. Provider complete suite: 3556 passed / 0 skipped; final public controller/production assertions: 16 passed; production bundle rebuilt. PR CI and Human QA remain separate gates.
