# Slack text tracer — issue #802

Real QA: DoodleBear workspace, `botharness-im-qa-802`, independently installed `BotHarness Slack QA`; Socket Mode with `connections:write`, Bot scopes `app_mentions:read`, `chat:write`, `channels:history`, `channels:read`, `users:read`.

## Revisions and evidence

- Baseline UI: main `647fbe958f72053c1b85d45cc05996a92603a658`, isolated Profile with the same PersonaBot name and no active IM receiver; this is the previous absence state. Main `1bf56698` subsequently adds only the committed-output Host contract; the Slack candidate incorporates it and its focused regression.
- Candidate UI/model capture: the #802 implementation plus source decoder/qualification fixes, dsh-im `a0227c44d8aa217361a890f79990a5c47edd6b55`; both Profile views use Chinese, dark theme, 1230 × 820. Final source/reply captures run application code `a08044da` including main `1bf56698`; four live mentions have corresponding handled admissions and accepted native replies.
- `profile-before.png` / `profile-after.png`: prior absence versus verified Slack identity, authorized QA channel, Inbox-only placement and connected mention-only intake.
- `source-modal.png`: canonical Slack source with sender, own mention name and native topic.
- `native-thread.png`: actual root, child and post-restart replies from the independently bound Bot in one original Slack thread.
- `runtime-proof.json`: bounded QA-only canonical admission/Outbox proof, including native timestamps and receipts; no credentials or login URLs.

## Human verification

1. Open the task's isolated QA instance on port 32604 using the retained authenticated Chrome tab.
2. Open `Slack Intake QA #802` → Profile. Verify the Slack identity is available and QA-channel intake is connected, with Inbox-only placement.
3. In Slack channel `botharness-im-qa-802`, send an actual mention of `BotHarness Slack QA`, with `Reply BH802-HUMAN-OK via bridge_reply`.
4. Confirm one canonical Inbox item and the reply in the original native thread. Open its source details in the Channel sidebar’s Bot Inbox → `botharness-im-qa-802` → processed history.
5. Send ordinary mainline and thread text without a mention: neither is admitted in this slice. No external message is mirrored into the local Human DM.

Provider replay dedup, account replacement, revocation, source qualification, cancellation and ambiguous-send behavior have automated coverage. A real provider redelivery was not forced. Ordinary-message policies, shared-channel intake, private/DM intake, context browsing, proactive posts and attachments remain later qualification slices. Slack HTTP/API acceptance is not a read receipt.
