# #614 real Lark Thread following evidence

Baseline: main `76dac30b`; DSH `0.2.0-rc.1`. Tests ran against the final source subsequently committed in this branch. Qualified dsh-im fork artifact: `ee9d3c7a6fc9f15b13f8d895cd1ccb5183b7cd37`; this is not an upstream released-contract claim.

## Live verification

| Case                                 | Observed result                                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bot replies to an addressed message  | Thread remains inherited; replying does not follow it.                                                                                                                                    |
| Ordinary delivery qualification      | Exact Thread/root proof is required. New topic C remains unavailable without ordinary delivery proof.                                                                                     |
| Bot explicitly follows Thread A      | Bot tool writes revision 1; group remains mention-only.                                                                                                                                   |
| Restart and digest                   | Follow revision 1 survives; first unmentioned A reply remains pending through an addressed B message; second A reply reaches count 2 and both A admissions share the same observed batch. |
| Thread isolation                     | B ordinary message is excluded from Source Events/Inbox.                                                                                                                                  |
| Bot unfollows                        | Bot tool writes inherited revision 2; later A ordinary message is excluded.                                                                                                               |
| Human follows via real Profile Modal | Revision 3, Human editor, immediate wake; unmentioned message receives admission revision 3 and is handled.                                                                               |
| Bot tries overriding Human           | Actual DSH `tool/result` event 669 returns `Error: human-thread-override`; policy remains Human follow revision 3.                                                                        |
| Independent platform read-back       | Lark API returns all five expected acknowledgement messages with the exact original Thread/root and triggering parent message.                                                            |

Independent read-back uses the already-authorized Human identity for this QA topic only. A convenience CLI shortcut requested an additional contact scope, so the raw message endpoint was used without contact enrichment; no scope was added. The Lark read-circle UI is not an acceptance signal.

## Images

All images are actual Chrome UI, Chinese, light theme, at width 882. The offline baseline viewport is 771 pixels tall and the live viewport is 827 pixels tall; height differs because Chrome uses separate windows. The baseline uses the same Bot/QA group from its pre-Thread database snapshot and has the receiver deliberately offline to avoid competing with the one live QA receiver. Historical group thresholds and Outbox content differ between baseline and the live test; captions make that limitation explicit. The comparison establishes the absence/presence of Thread management, not provider connection behavior.

- `before-main.jpg`: existing group policy and send entry point; no Thread table/Modal.
- `after-thread-table.jpg`: Human follows A; B and C inherit group. Group threshold 2/300 remains separate.
- `after-human-modal.jpg`: Human participation and wake settings.
- `after-unverified-modal.jpg`: topic C exact ordinary-delivery qualification missing; follow Save disabled.

## Human reproduction

1. Open **IM Artifact QA → Profile → IM connection** in the retained authenticated QA page.
2. Inspect the two Thread rows. A is held by Human; B inherits group.
3. Manage A: choose **Inherit group** to release the Human override; send an addressed request in Lark Thread A asking the Bot to follow via `bridge_thread_policy_list` / `bridge_thread_policy_set`.
4. Send two ordinary replies in A: inherited group digest uses count 2 / 300 seconds. Send an ordinary message in B: it must remain excluded.
5. Ask the Bot to unfollow A; further ordinary A replies remain excluded. Human may instead follow or exclude A in the Modal.

After a Host/Consumer restart, saved participation remains, while enabling a new follow requires an ordinary reply delivered in that exact Thread again. No history backfill, auto-follow, shared-account reply borrowing or provider read-state writes are introduced.

## Regression

Final checks: lint, format check, typecheck, build, bilingual release-ledger checks pass. Full suite: **1887 PASS / 2 SKIP**, **229 passed / 2 skipped files**. Focused tests cover root mismatch, stale/foreign anchors, Human precedence, restart, deduplication, independent Thread digest thresholds and unverified UI gating. Earlier fixture-list failures remain in private logs; they were corrected by registering the new RPC/Tool expectations, without weakening assertions/timeouts.

## Latest main integration recheck

Main `76dac30b` already owns Human Inbox Schema Generation 47, so the unpublished Thread migration moves to Generation 48. Both main's Human Inbox/tools improvements and this PR's Thread controls are retained. The old disposable QA database was backed up, then restored from a compatible pre-Thread snapshot; normal owner migrations applied 47 and 48. No migration ledger was forged. Prior run evidence above remains as prior proof, not fabricated final-run data.

On this integrated source, real Bot follow revision 1 was repeated; A's two ordinary messages were handled at the identical `observed_at` timestamp, with revision 1. An addressed B reply did not auto-follow and ordinary B was excluded. Lark read-back independently verified the follow/digest acknowledgements' exact topic, root and triggering parent. Human saved follow/immediate revision 2 through the actual Modal; the real Bot tool event 787 refused `human-thread-override`, and the acknowledgement was provider-accepted. New topic C's follow Save was disabled because it lacks exact-topic ordinary delivery proof.

A further 50-message read-back was declined by automatic approval review for exceeding the specified test-message read scope; it was not executed. The integrated Human acknowledgement is evidenced by canonical Outbox/provider acceptance, not claimed as independently read back again. Raw private messages are not committed.
