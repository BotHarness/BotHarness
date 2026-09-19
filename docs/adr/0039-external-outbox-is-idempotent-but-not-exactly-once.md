---
Status: Accepted
Date: 2026-09-20
---

# The external outbox is durable and idempotent, not exactly-once

Every Reply or proactive Service Action first commits one Outbox Intent with a stable BotHarness idempotency identity, source revision, provider account/action/target, payload hash, and required Grant snapshot. The dispatcher revalidates the current Source Revision, Provider Capability, Service Grant, and target before each attempt. Retryable failures use bounded backoff. When the provider accepts idempotency keys or exposes a reliable result lookup, retries reuse the same identity or reconcile the original request rather than creating another intent.

A provider acknowledgement or echo is evidence about that same intent, not another delivery. The adapter binds its account-scoped external message id and status to the existing Outbox Intent and outbound Source Event. Duplicate acknowledgements are idempotent. An unmatched own-sender echo follows ADR-0036's unresolved, no-wake reconciliation path and cannot by itself prove success or cause a second send.

A request that may have reached a provider but returns no provable result is **Unknown Outcome**, not an ordinary retryable failure. If provider idempotency or reconciliation cannot rule out duplication, BotHarness stops automatic retries and moves the intent to `needs-human` with the attempt evidence. Local transactional durability guarantees that intent and outcome facts are not lost; it never claims a distributed exactly-once guarantee across an external API.

Provider reconciliation runs first when available. If the outcome remains unknown, only a Human may resolve the intent as confirmed success, deliberate retry, or abandonment. The Orchestrator may summarize evidence and recommend one of those choices, but it cannot mark success, clear the warning, or initiate another side effect from the unresolved intent without that Human decision.

A Profile Backup may capture an attempt that was in flight at its Backup Barrier. The manifest and Outbox facts retain `in-flight-at-cutoff`; Managed Restore normalizes it to Unknown Outcome / `needs-human`, tries provider reconciliation when available, and never resumes or retries it automatically. Waiting indefinitely for all provider calls would make backup liveness depend on an external system, while treating the snapshot as pending would risk duplicating a side effect completed after the cutoff.

## Considered Options

- **Retry every timeout indefinitely** — rejected: a successful provider call with a lost response would produce duplicate messages or actions.
- **Try once and drop failures** — rejected: transient failures would silently lose accepted user/Bot intent.
- **Claim exactly-once delivery** — rejected: BotHarness and an arbitrary external provider do not share a transaction.
- **Let the Orchestrator resolve Unknown Outcome** — rejected: model judgment cannot prove external state and could duplicate an irreversible side effect.
- **Block every backup until all provider requests finish** — rejected: an unavailable provider could prevent backup indefinitely.
- **Restore an in-flight-at-cutoff request as retryable pending work** — rejected: the source-side request may already have succeeded after the snapshot.
- **Create a new Source Event and Inbox attention for every provider echo** — rejected: provider reflection is outcome evidence for the existing outbound message, not new intent.

## Consequences

- Provider adapters declare whether an action supports provider idempotency, outcome lookup, or neither.
- An Outbox Intent distinguishes pending, in-flight, retryable failure, succeeded, failed, unknown outcome, needs-human, source-revised, and grant-revoked facts; these are external-delivery facts, not Bot Inbox attention state.
- Automatic retry is allowed only while the side effect remains authorized/current and duplication can be prevented or proven absent.
- Operator resolution of Unknown Outcome records whether to reconcile, retry deliberately, accept success, or abandon; it never rewrites attempt history.
- Backup/restore preserves the cutoff evidence and converts uncertain in-flight work to the same Human-controlled Unknown Outcome path.
- Provider acknowledgements and echoes attach idempotently to the existing intent and Source Event; unmatched own-sender echoes remain unresolved and never wake the Bot.
