---
Status: Accepted
Date: 2026-10-08
---

# QQ group replies use authenticated apps and process-local source proof

The first QQ slice in [#1152](https://github.com/BotHarness/BotHarness/issues/1152) receives a group mention and answers through the receiving official application. QQ group/member OpenIDs belong to that application, passive replies have a short lifetime, and the available API does not offer a general group-history read. Treating those locators like a portable Lark source would imply authority that QQ has not supplied.

## Decision

Use the existing dsh-im Service Provider and exclusive Consumer contract. The Provider owns credentials, official SDK transport, application authentication and native route proof. BotHarness owns the application's Binding, canonical Source Event and Inbox Admission, Orchestrator wake and Outbox intent. No standalone Provider Session runs while its persisted external-consumer mode is active; losing a lease does not change that mode.

The authenticated `GET /users/@me` robot-details response supplies the native identity. Combine its ID with the configured AppID in the account fingerprint. Live responses may omit the documented example's `bot` flag; an explicit non-robot or malformed flag still refuses qualification. Application changes invalidate the Binding fingerprint.

Only text-only `GROUP_AT_MESSAGE_CREATE` events enter the first slice. Their event type is the mention proof; the SDK need not reconstruct an @ token stripped by QQ. Retain the exact application-scoped group, member, native message ID and timestamp. Canonical deduplication uses the authenticated account and native message identity.

The Provider keeps a bounded, process-local copy of each admitted source, independent of consumer-owned objects. It qualifies only that exact group/member/message tuple, within five minutes and at most five attempted replies. Thread routes are refused. Its public replay contract reports possible gaps and no durable cursor. Restarting removes source proof but preserves canonical history; a native redelivery can establish fresh proof subject to the source's original time limit.

Before native dispatch, prepare the official SDK token, then recheck source, current application, lease, cancellation and the trusted synchronous consumer authority fence. There is no asynchronous step between the final fence and native API dispatch. Preserve definite expiry, limit, rate and permission refusals. An unclassified or interrupted send is unknown and must not automatically retry or fall back to proactive messaging. Return QQ's native message ID only after a valid response; it proves provider acceptance, not delivery or reading.

Advertise reply-only checked capabilities independently of proactive messaging. Ordinary traffic, media, history and delayed proactive reports require their own qualified slices. In particular, authenticated group mention support is sufficient to make an app bindable; it must not require an unrelated proactive capability.

## Consequences

The first real path reuses the existing Source Event, Bot Inbox and Outbox, with no second transcript, persistence or credential store. Old sources remain inspectable after restart, but may no longer be replyable. Receiver lifecycle diagnostics must clear readiness on disconnect and expose bounded failures, because an online badge alone cannot prove current authority.

Direct, source-free group sends and universal source rereads are rejected alternatives: the first bypasses passive-reply authority, and the second depends on a QQ API this slice does not have. Expanding capability flags ahead of native qualification would hide these limits from the Host and Human.

This specializes [ADR-0142](0142-a-bound-app-admits-its-direct-messages-and-mentions.md) for QQ and preserves the ownership boundaries in [ADR-0106](0106-exclusive-im-intake-commits-bot-inbox-before-acknowledgement.md).
