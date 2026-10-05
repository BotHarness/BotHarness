# Slack external-only report — #863

- Baseline: `4321fdb8807e69958754748f7dd92818c0e519ea` (latest main at capture).
- Implementation: `0265419e`; later evidence/font commits do not alter runtime code.
- Fixed Provider: `a0300e97d7996a5de3a6da2f5b9f50224eb12bd9`, DSH `0.2.0-rc.1`, 393 runtime files, SHA-256 `caeb3c0bbed424012730d2a658d5f6ba86e6a892c007d8bbb7dd6def42d38544`.
- Chrome, Chinese, dark, 1230 × 820 BotHarness viewport. Native Slack uses its existing display settings. All published messages are synthetic messages in the dedicated QA channel.

## Runtime path

1. Open the retained QA page and PersonaBot **Slack Intake QA #802**. In Profile, the bound identity is **BotHarness Slack QA**; its authorized public channel is **botharness-im-qa-802**.
2. Inbox-only mention reception is enabled for this QA. Shared Channel **Slack 共享来源 QA #845** reception is paused for this test; existing shared history remains. No new scope, App or credential is needed.
3. Ask the Bot to inspect `bridge_targets`, then explicitly `bridge_post` its report with a stable request ID. The report appears in native Slack and Profile's recent Outbox list. Click it to inspect text, sender, accepted state and native receipt.
4. Reply **with an actual @ mention** under that native report. The Bot's Inbox item opens a source Modal with the original report above the Human message. The model uses `bridge_read` / `bridge_outbox`, then `bridge_reply` in the original Slack topic.
5. A no-@ reply remains excluded under this connector. Report publication does not automatically follow a topic.
6. After a cold Host restart, the original report and source association remain readable. Repeating the same request ID leaves one canonical report intent and one native root; the model answers a fresh mentioned reply as **BH863-FINAL-OK**.

The report's native timestamp is `1791194942.009129`. Both admitted Human replies have this same `threadId` and `rootId`; no `parentId` is fabricated. Each has one handled member Admission and zero Channel placements. The report itself has zero canonical own-message sources and zero local report copies. The local Human command instructing publication is a separate DM message, not a mirrored report.

## Screenshots

- `before-outbox.jpg` / `after-outbox.jpg`: the unchanged existing Profile entry point before and after this report operation, matching viewport/theme/locale; this feature adds Provider support rather than Client markup or style.
- `restart-receipt.jpg`: preserved report text and native receipt after restart.
- `restart-source.jpg`: fresh Human follow-up with its associated original report after restart.
- `native-final.jpg`: the sole report root, Human replies and Bot answers in native Slack.

## Checks and limits

Core full regression: **2,477 passed / 9 skipped**. Provider full regression: **3,561 passed**; after fork-main integration, Slack and checked delivery: **91 passed**, same runtime digest. Final pin/Slack regression: **8 passed**. Lint, formatting, typecheck, Host/Client build, package verification and docs build passed.

Automated tests verify accepted/ambiguous request-ID deduplication, unknown malformed receipts without resend, changed identity/target, foreign Bot refusal and revoked grants; Provider tests cover disposal/cancellation/stop during membership preflight. These negative authority cases are regression evidence, not claims of live token revocation tests. `proof.json` is restricted to synthetic report/follow-up facts and checked installed bytes; full private Session transcripts are not published or decoded.

This slice covers plain-text root reports in joined public Slack channels. It does not add a scheduler, private/DM report delivery, blocks or own-message echo enrichment. Human QA and merge authorization are pending.
