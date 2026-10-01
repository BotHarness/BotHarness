# #614 real Lark Thread following evidence

Baseline: main `3227836efbabc6b54bd76270d809965655ceb791`; DSH `0.2.0-rc.1`. Tests ran against the final source subsequently committed in this branch. Qualified dsh-im fork artifact: `ee9d3c7a6fc9f15b13f8d895cd1ccb5183b7cd37`; this is not an upstream released-contract claim.

## Live verification

| Case                                 | Observed result                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot replies to an addressed message  | Thread remains inherited; replying does not follow it.                                                                                                                                    |
| Ordinary delivery qualification      | Exact Thread/root proof is required. Other Thread B remains unavailable after the final Host restart.                                                                                     |
| Bot explicitly follows Thread A      | Bot tool writes revision 1; group remains mention-only.                                                                                                                                   |
| Restart and digest                   | Follow revision 1 survives; first unmentioned A reply remains pending through an addressed B message; second A reply reaches count 2 and both A admissions share the same observed batch. |
| Thread isolation                     | B ordinary message is excluded from Source Events/Inbox.                                                                                                                                  |
| Bot unfollows                        | Bot tool writes inherited revision 2; later A ordinary message is excluded.                                                                                                               |
| Human follows via real Profile Modal | Revision 3, Human editor, immediate wake; unmentioned message receives admission revision 3 and is handled.                                                                               |
| Bot tries overriding Human           | Actual DSH `tool/result` event 669 returns `Error: human-thread-override`; policy remains Human follow revision 3.                                                                        |
| Independent platform read-back       | Lark API returns all five expected acknowledgement messages with the exact original Thread/root and triggering parent message.                                                            |

Independent read-back uses the already-authorized Human identity for this QA topic only. A convenience CLI shortcut requested an additional contact scope, so the raw message endpoint was used without contact enrichment; no scope was added. The Lark read-circle UI is not an acceptance signal.

## Images

All images are actual Chrome UI at 882 × 771, Chinese, light theme. The baseline uses the same Bot/QA group from its pre-Thread database snapshot and has the receiver deliberately offline to avoid competing with the one live QA receiver. Historical group thresholds and Outbox content differ between baseline and the live test; captions make that limitation explicit. The comparison establishes the absence/presence of Thread management, not provider connection behavior.

- `before-main.jpg`: existing group policy and send entry point; no Thread table/Modal.
- `after-thread-table.jpg`: Human follows A; B inherits group. Group threshold 2/300 remains separate.
- `after-human-modal.jpg`: Human participation and wake settings.
- `after-unverified-modal.jpg`: exact topic ordinary-delivery qualification missing; follow Save disabled.

## Human reproduction

1. Open **IM Artifact QA → Profile → IM connection** in the retained authenticated QA page.
2. Inspect the two Thread rows. A is held by Human; B inherits group.
3. Manage A: choose **Inherit group** to release the Human override; send an addressed request in Lark Thread A asking the Bot to follow via `bridge_thread_policy_list` / `bridge_thread_policy_set`.
4. Send two ordinary replies in A: inherited group digest uses count 2 / 300 seconds. Send an ordinary message in B: it must remain excluded.
5. Ask the Bot to unfollow A; further ordinary A replies remain excluded. Human may instead follow or exclude A in the Modal.

After a Host/Consumer restart, saved participation remains, while enabling a new follow requires an ordinary reply delivered in that exact Thread again. No history backfill, auto-follow, shared-account reply borrowing or provider read-state writes are introduced.

## Regression

Final checks: lint, format check, typecheck, build, bilingual release-ledger checks pass. Full suite: **1850 PASS / 2 SKIP**, **224 passed / 2 skipped files**. Focused tests cover root mismatch, stale/foreign anchors, Human precedence, restart, deduplication, independent Thread digest thresholds and unverified UI gating. Earlier fixture-list failures remain in private logs; they were corrected by registering the new RPC/Tool expectations, without weakening assertions/timeouts.
