# Issue #12: real work-group topic tracer evidence

The final runtime was built on main `7fe56622`, with feature code `a8b06df9` and schema generation 44. These captures use the authorized BotHarness IM QA #78 group and its existing topic, the bound test Bot identity, and Human-origin input sent through the Lark desktop client. They are actual runtime captures, not rendered fixtures.

- `before-profile.png` / `after-profile.png`: matched 1280 × 720, light, English Profile views captured at base `7d17563a` and pre-rebase feature `6422a716`. The feature controls are unchanged in the final rebase; final Chinese/dark captures below independently verify their current state.
- `profile-final.png`: final Chrome native capture after cold restart; explicit mention-only reception remains active and the original-topic reply is provider-accepted.
- `inbox-final.png`: one handled external source, while the local DM remains empty.
- `source-final.png`: opening that Inbox item displays the retained platform, receiving identity, group, sender, timestamp, topic and complete test message. This is a new interaction with no base detail screen; the baseline Profile screenshot shows the prior absence of external Inbox access.
- `lark-topic-final.png`: Human sends a real mention with marker `BH12-FINAL44-TOPIC-03`; the PersonaBot replies `BH12-FINAL44-OK` within the same existing topic. The ordinary message `BH12-FINAL44-NOAT-03` receives no reply and creates no source/admission.

The native Lark capture is cropped to the named QA group so unrelated private conversations are excluded. Chrome captures exclude browser chrome. The final native Chrome captures use its actual Chinese/dark environment; they supplement, rather than replace, the matched English Profile pair. The in-app browser could not complete final captures due persistent CDP focus/navigation timeouts; the Human approved Chrome.

After cold restart, authenticated Host RPC plus canonical database reads confirmed: 1 Source Event, 1 handled Inbox Admission, 1 provider-accepted Outbox Intent, 0 Channel placements, 0 Assignments, no unmentioned-message Source Event, readable retained source, and automatically restored reception on the same grant revision.

Verification: 1683 tests pass / 1 skipped; typecheck, build, lint, formatting and bilingual Release Ledger checks pass. Existing operational-database regression also verifies upgrade from the prior schema preserves a report and its referencing Inbox Admission with no foreign-key violation.

This proof qualifies the temporary dsh-im public text consumer/reply contract; it does not establish an upstream release or production rollout. Rich posts, ordinary-message intake, remote history and autonomous thread following remain outside this tracer.
