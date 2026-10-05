# Slack global defaults E2E — #843

Runtime implementation: `d223aaabf615602fa6580350f5d21707a2513b52`; latest-main baseline: `ba19dd80259833ba28b5a074e6050ddbcbcbfe0c`. DSH `0.2.0-rc.1`; qualified fork Provider `48e7a35792af5222cd40cfe1ba2607ac55a59df2`. Human-authorized isolated Slack QA Profile, public QA channel `botharness-im-qa-802`; credentials remain local.

## Visual evidence

Before/after light and dark pairs use the same 882 × 827 Chrome viewport, Chinese locale, native DSH settings modal and default 5/30 values. Before is the merged #842 code; after is the implementation above. Platform selector is the visible change. Appearance returned to Follow system after capture. `profile-inherited.png` shows final all/2/5 inheritance; `restart-source.png` shows the actual new Slack message in Bot Inbox after cold restart; `native-slack.png` contains synthetic QA messages only. Screenshots were visually inspected; raw DB, credentials, boot URLs and session logs are excluded.

## Real path and assertions

All configuration changes were made through production UI, all inputs sent through native Slack. Read-only canonical DB/public RPC and actual model `bridge_read` results corroborate the UI.

| Scenario                     | Observable result                                                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Lark/Slack independence      | Slack revisions 1–5; Lark remains byte-for-byte equal to its original builtin revision 0                                 |
| Restore group inheritance    | Global 2/60 values resolve in Profile; COUNT-C first pending, COUNT-D triggers both in model turn 21 before timer expiry |
| Group custom override        | CUSTOM handled with all/1/5 while global only-mentions                                                                   |
| Stable global only-mentions  | EXCLUDE-STABLE absent from Source Events / Inbox                                                                         |
| Identity inherited pause     | Identity paused, PAUSED absent, no backfill after resume                                                                 |
| Identity custom override     | ID-CUSTOM read successfully while global identityEnabled=false                                                           |
| Global resume / sparse timer | RESUME handled with inherited all/2/5                                                                                    |
| Cold restart                 | Defaults, inherited identity and group persist; RESTART handled and actual model read succeeds                           |
| Existing admission snapshots | Prior policy/default revisions and harvest thresholds unchanged after subsequent edits                                   |
| No automatic reply           | Zero new Outbox intents during this run                                                                                  |

`proof.json` contains bounded synthetic-source IDs, admission facts and successful model call references. Six primary sources have successful, matching-content model reads. Earlier attempts are explicitly recorded: COUNT1/2 were independent timers, COUNT-A/B arrived after a filter switch, and EXCLUDE arrived after a custom switch; these are not used as the paired count or negative acceptance evidence. Stable replacements were verified instead.

## Human reproduction

1. Open retained QA page, Bot settings → External platform defaults → Slack. Current final values: all ordinary text, count/time harvest 2/5, inherited identities enabled.
2. PersonaBot Profile → External identities: inherit v5. Channel connector authorization → group collection/wake: inherit v5, all/2/5. Authorization remains limited to the pre-existing QA channel.
3. Send synthetic ordinary text in native Slack QA channel. Read the new handled entry in Bot Inbox; local DM history stays free of mirrored external messages.
4. Change global collection to only-mentions: inherited group excludes future ordinary messages. Profile custom all overrides it; restore inheritance uses current global value.
5. Disable inherited identities globally, then restore: paused-window messages are not backfilled. Local custom identity enable overrides the global switch.

## Migration/recovery

Schema generation 53 copies existing immutable preference rows unchanged and widens the platform CHECK to qualified Lark/Slack. Existing custom identity and group preferences are not rewritten. Older Host binaries refuse generation 53. Recovery requires a compatible Host/forward repair or restoring a pre-upgrade Profile backup; do not downgrade the binary against an upgraded DB.
