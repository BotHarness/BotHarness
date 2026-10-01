# External group collection and wake — #613

Real Lark E2E uses one Human-authorized test group and the Bot's own bound identity, through the qualified dsh-im Provider and canonical Messaging/Inbox/Orchestrator path. No database writes, synthetic live event injections, or alternative queue are used for verification.

## Screenshots

- `before-light.jpg`: pre-change IM Profile from the initial main baseline (`e5f5bc29`), with mention-only intake and no group policy form.
- `after-light.jpg`: final integrated runtime (`164adb69`), Human revision 7: all ordinary text, count 3 or 600 seconds.
- `bot-policy.jpg`: the same final runtime, Bot revision 8: restored mention-only intake with retained digest preferences.
- `ordinary-source.jpg`: final integrated ordinary message, individually accessible from Bot Inbox history with original message ID, Source Event ID, sender, time and receiving identity.

All captures use the real Chinese, light-theme Client at 882 × 771. The initial baseline predates main's independent compact Activity Center change; that navigation difference is not part of #613. The added form makes the IM section taller, so the after view includes the bound identity and full policy controls rather than the prior send composer.

## Observed behavior

See `proof.json` for bounded test-only facts and exact correlations.

| Case                                      | Result                                                                                                                                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mention-only default and restored setting | Four designated ordinary messages produced zero canonical Source Events/admissions. Real delivery was nevertheless verified for the current lease.                                     |
| Count digest                              | Two messages were pending and unobserved; the third produced one bounded harvest. All three retain individual IDs, revision 7, one observation timestamp and successful completion.    |
| Time digest across restart                | A revision-4 message was pending before the verified restart, then harvested at its original 60-second deadline and completed.                                                         |
| Busy immediate wake                       | An @ turn was running while the ordinary message remained pending/unobserved. Its next harvest started after the first turn completed, without cancellation or ordinary-message steer. |
| Bot policy tools                          | The real Orchestrator called `bridge_group_policy_list`, `bridge_group_policy_set` and `bridge_reply`; audit revision 8 names the Bot as editor.                                       |
| External reply                            | Native Lark read-back confirms `BH613-INTEGRATED-OK` has the exact original QA message as its parent.                                                                                  |
| History separation                        | Zero new local DM placements during formal verification after 20:15 UTC.                                                                                                               |

Count, Bot tools and external reply were rerun after integrating latest main. Timer and busy-step tests exercised the same #613 Host implementation before that rebase. Focused automated regression separately covers provider redelivery, handled replay, cross-Bot/refused authorization and active-step mention context. A synthetic real-provider replay is not claimed.

Earlier Flash model requests did not complete and were deliberately stopped. Their three lifecycle error notices remain visible in the QA DM. They were recovered after native Session selection of Pro/off, verified from the actual request header, and are not counted as passing initial attempts. The preset/resumed-Session mismatch is documented in `dsh-dev`; its cause is unconfirmed and this feature does not add a model workaround.

## Human QA

1. Open the task-owned local QA Client, select **IM Artifact QA**, then Profile → **IM 连接**. The final saved setting is mention-only, revision 8, editor Bot.
2. Enable all ordinary text and choose digest, count 3 and a long interval. Send two non-@ text messages to the authorized QA group: each should exist separately in Bot Inbox without waking. A third should harvest them together. Bot Inbox → group → handled history → message opens its external source detail.
3. Choose count 10 and a short interval to test time harvest; choose immediate to test next-turn scheduling. Ordinary arrivals must not interrupt an active model/tool step. Collection, wake and reply are separate choices.
4. Restore mention-only. Ordinary messages should be excluded; @ messages should still wake and may reply through the Bot's bound identity. No local DM mirror is expected.

The UI requires observed ordinary delivery before enabling full intake; if unavailable, check the application message permissions/subscription, send a non-@ test message and refresh. A persisted all-message preference is retained across restart while current-lease delivery verification is refreshed. Only Lark plain text in one authorized group is claimed; topic following and other providers remain separate tickets.

Schema 46 adds append-only policy revisions. Older binaries refuse the upgraded database: recovery is a pre-upgrade Profile backup or a forward fix, not a plain binary revert.
