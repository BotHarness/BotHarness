# #638 real Lark member-harvest verification

Baseline: merged main `b0cf3b85`. Final runtime: `aa6869d8` (same Client UI as `c77ef24a`, with the ordinary Bot-reply Memory fix). Evidence-only commits do not change the executable code. Native DSH 0.2.0-rc.1, qualified checked dsh-im Provider, one existing authorized receiver and real model; no additional identity or permissions.

## Human path

Open the retained local QA Host on port 32602 through its private login URL, select **Lark Shared Channel QA #634**, and open Profile → detailed view. **成员消息提醒** shows effective Host rules; edit one member without changing the other. **频道连接器** separately controls which authorized external messages enter the shared history.

The retained review state is **IM Artifact QA: 2 messages / 120 seconds**, **IM Shared Reader QA: 100 messages / 10 seconds**, and explicit full ordinary text collection from **BotHarness IM QA #78**. New Bridge defaults remain mentions-only. No new sender identity was assigned to the second Bot.

Send two new marked, unmentioned messages through the real Lark Human client. Both appear as individual Channel facts before any digest threshold. Ask each Bot to use `channel_read` to inspect origin and reply only locally through `channel_send`. Do not infer Bot receipt from Lark's read circles.

## Evidence

- Before/after Profile pair: 882 × 827, light, Chinese, same 15-message transcript captured before test sends. Before uses merged-main-equivalent executable tree; after uses `c77ef24a`. The only later runtime fix leaves the captured Client components unchanged. New table is an absence/entry-point comparison, not a mock. After intentionally shows the two Human-edited independent overrides; baseline has no effective-member table.
- Final Modal capture shows editing the second Bot's actual 100-message / 10-second rule through the existing Human command.
- Final count/time screenshot uses `aa6869d8`: FINAL COUNT 1 committed at **20:48:09.523 UTC**, FINAL COUNT 2 at **20:48:13.326**. The count member observed both at **20:48:14.523**; the elapsed-time member observed both at **20:48:19.525**, 10.002 seconds after first persistence and far below its count threshold. Both actual models called `channel_read` and `channel_send` and produced `BH638-FINAL-COUNT-OK` / `BH638-FINAL-TIME-OK`.
- Busy proof uses the same final runtime: QUEUE 1 was running from **20:43:59.964** until **20:44:18.951**. QUEUE 2–4 persisted at **20:44:02.767**, **20:44:06.527**, **20:44:10.220** and remained pending during that step. All three were observed together at **20:44:18.954** and handled together at **20:44:25.769**, in the next model turn (62), using `channel_read` search followed by one `BH638-QUEUE-234-OK` local reply. Session turn 61 completed before turn 62; no ordinary steer was delivered.
- The independent receipt screenshot shows the first member handled while the second member is only delivered. QUEUE messages retain the second member's silent snapshot even after the Human restores its future digest rule. No retrospective policy conversion.
- No external Outbox rows were created after the fixed Host launch. Accepted external sources remain one per message, with individual sender, timestamp, Source Event and external message identity; observer files only read canonical persistence and did not construct or mutate QA data.

## Regression and honest limits

2020 tests passed / 3 skipped; lint, formatting, typecheck, both release-ledger checks and build passed. Focused inbound + Memory tests: 88 passed. Automated regressions cover 105-message bounded oldest-first catch-up (unselected content remains pending), restart, policy revision partitions, active-step non-steer, mentions context, explicit silent reads, membership removal, replay, followed-thread isolation and refusal of borrowed account authority. The real burst is four messages; the 100-message/prompt-cap limit is regression evidence rather than a claim of a 105-message live-platform load test. No remote-history backfill or offline-provider retrieval was exercised or implemented.

The first real count/time run on `c77ef24a` found successful local replies later causing ordinary Bot-message turns to fail Memory observation. A deterministic test reproduced that failure in under a second; `aa6869d8` skips Memory operations for ordinary Bot traffic, preserving the existing authorization boundary. Both retained admissions recovered after restart, the final real count/time run passed, and no new session failure appeared after the fixed launch. Historical failure notices remain in the QA history; they were not deleted or hidden.

Only clean BotHarness UI screenshots and test-scoped results are published. Native Lark sidebars, cookies, credentials, private login links and unrelated messages are excluded. This is local QA, not deployment.

## Latest-main integration

Latest-main `12ff478a` (#727 Tool detail authorization) is merged into runtime `2b0cb6c6`; the before/after Client structure remains unchanged by that upstream Host-only change. `after-integrated-group-profile.png`, `after-integrated-member-modal.png`, and `after-integrated-count-time.png` are captured on the actual integrated Host. Their larger activity count reflects retained real QA history, not a reset or matched-state before/after pair.

Two fresh ordinary Lark messages persisted at **20:55:26.974 UTC** and **20:55:30.590**. The count member observed both at **20:55:31.998**; the elapsed-time member at **20:55:36.976**, again 10.002 seconds after first persistence. Integrated full regression: **2027 passed / 3 skipped**, static checks and build passed, theme token guard **16 passed**. Both models searched canonical Channel history and replied locally with `BH638-INTEGRATED-COUNT-OK` / `BH638-INTEGRATED-TIME-OK`. No new external Outbox rows. Existing member policies and accepted history survived the latest-main Host restart.

Visual status: light and dark themes inspected in the real Chrome QA UI on integrated runtime `2b0cb6c6`, at 882 × 827 in Chinese. After Human authorization, the native Settings appearance control was temporarily changed from light to dark. `after-integrated-group-profile-dark.png` and `after-integrated-member-modal-dark.png` show readable member names, policy values, inheritance tags, selected mode, inputs and action buttons. The member-policy Modal was closed without saving; native Settings was restored to its original light selection and the retained QA Profile remained open. No custom CSS or color values were added; the table and Modal reuse the existing native primitives and theme tokens. Human feature QA and merge authorization remain pending.
