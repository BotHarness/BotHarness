---
Status: Accepted
Date: 2026-10-02
---

# Shared Channel bridges place canonical external sources

## Decision

A Human can choose an existing joined Group Channel as the receive target of an authorized Lark group grant. The receiving PersonaBot must also be a current Channel member. Inbox-only reception remains the default; no DM or Group is synthesized. The Messaging module owns the saved target, grant revision, exclusive Provider Consumer and authorization checks.

Eligible verified external @ messages commit one canonical Source Event, one Channel placement referencing that event, and the addressed bound Bot's Inbox Admission in the same operational database transaction before acknowledgement. The placement has a stable local message ID equal to the Source Event ID; its bounded `bridgeOrigin` retains the distinct provider message ID, sender ID, platform, group and optional thread. The text remains in the Source Event, never in a second Channel transcript or shared Inbox store. Existing Channel queries, live publication and Human timeline project external author/time/body/origin from that same event.

Channel membership grants visibility through the existing authorized `channel_read` and query tools. It does not grant another Bot the receiving identity or create another Inbox Admission or wake. The addressed Bot uses the existing source-policy, harvest and steer path and receives the actual local Channel as its inbound context. It may discuss internally through explicit Channel operations; only `bridge_reply` or the existing file reply operation can create a checked external effect through its own current binding. Internal Channel posts are not mirrored automatically.

Current target membership is checked during intake, wake eligibility, source/context reads and before an unstarted external effect. Departure blocks future intake and old-source authority but preserves retained shared facts for remaining members. Grant revision changes or revocation invalidate old unstarted work; the existing Outbox retains outcomes, deduplicates same-source reply intent and never blindly retries an unknown result. Source and placement deduplication survive restart; external bot echoes do not become eligible Human mentions.

This tracer has one receive target per authorized grant and retains the existing single-placement constraint per Source Event. Target changes affect future new messages; replay does not migrate historical placement or refresh an old event's authority. Multiple sources and targets, ordinary-message collection, topic following and coordination are separate tracers under #629. No recall/edit synchronization, auto-assignment or provider-wide permissions are added.

## Why

A separate shared Inbox duplicates Channel visibility, membership and message history. Per-member copied messages or admissions confuse shared awareness with a decision to wake. Reusing canonical placement and the existing per-Bot admission keeps one source identity and one explicit reply authority while giving Humans and Bots a shared conversation surface.

## Platform boundary

These are application-defined BotHarness contracts over the existing DSH Plugin Service Consumer, API Gateway and Agent Scope seams; they do not create a new DSH Inbox or Session owner. Universal authenticated account, checked send/reply, exclusive receive and history capabilities belong in the public dsh-im Service and should be proposed upstream. Upstream [PR #293](https://github.com/xmanrui/dsh-im/pull/293) merged account descriptions and checked proactive text sends; the qualified temporary Provider pin still supplies the separately reviewed receive/reply/history capabilities ([ADR-0104](0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md)).

References: [#634](https://github.com/BotHarness/BotHarness/issues/634), [#629](https://github.com/BotHarness/BotHarness/issues/629), [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md).
