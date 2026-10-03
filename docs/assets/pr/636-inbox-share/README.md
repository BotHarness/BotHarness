# Explicit Inbox source sharing — real Lark QA

Issue #636. Baseline main `35c2d02928cc0db18dc31e052ab2ee0ee9fdcdbb`; runtime `7ce8730fe9c2cf7cb1c99c4d02fe21b6c1d8fca5`. The baseline checkout has the same tracked tree as that main revision. Subsequent evidence commits do not change runtime code. Screenshots use Chrome, Chinese locale, light theme, 882 × 827.

The authorized Human sent `[BH636 SHARE 1]` with the existing `botharness-im-test` Lark CLI Profile into **BotHarness IM QA #78**. The qualified Provider persisted it into **IM Artifact QA**'s Inbox only. The real `deepseek-v4-pro` Orchestrator read the source and called `bridge_share` twice with the same canonical source and `group-inbox-qa-636`. Canonical DSH SessionEvents confirm `alreadyShared: false` then `true`, both revision 1. **IM Shared Reader QA**, with no external identity, read the source through `channel_read` and discussed it through local `channel_send` (`BH636-HELPER-OK`).

`verification.json` records read-only checks of the owning operational database and actual DSH SessionEvent share results: one canonical source/placement, one owner admission plus one helper admission, both handled, no external Outbox since the share. A subsequent `[BH636 PRIVATE 2]` source was handled but has no Channel placement. The Grant remains Inbox-only; neither external source appears in Human DM history. No direct database mutation, mock Provider, second receiver or native read-receipt assumption was used.

## Screenshots

- `before-main-channel.png`: real main, joined team Channel has no shared source.
- `after-shared-channel.png`: original source and unbound helper's local discussion.
- `after-provenance.png`: original platform, conversation, sender ID, external message ID and canonical Source Event ID.
- `after-independent-receipts.png`: existing Human-visible receipt surface, one handled admission per Bot. This is BotHarness processing status, not Lark native read status.

## Human QA

Keep the existing QA Host on port 32602. Open **Inbox 分享 QA #636**, expand the source label and its receipt indicator, and read the helper's local response. The bound Bot Profile's existing intake destination is Inbox-only. Send one new eligible QA-group message asking **IM Artifact QA** to share that source into `group-inbox-qa-636`; ask it to retry the same source/destination. The helper may read/discuss locally using its own policy. A later message without an explicit share stays in the receiving Inbox. Do not create new identities, permissions or parallel receivers for this path.

The first slice permits the initial Group placement only. Another destination or an already Channel-targeted source is refused; multi-placement belongs to #635. Focused regression checks foreign sources, DM destinations, membership removal, Grant revocation, silent helpers, later joiners, persistence/retry and unavailable late Tool calls. No recall/edit synchronization is added.

Validation: 75 focused tests; full 2072 PASS / 3 SKIP; lint, format, typecheck, build and docs build passed. GitHub CI is separately reported on the PR.
