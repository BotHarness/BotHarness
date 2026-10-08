# ADR-0149: Lark feedback follows Admission and accepted source replies

- Status: Accepted
- Date: 2026-10-08
- Issue: [#1040](https://github.com/BotHarness/BotHarness/issues/1040)

## Context

Lark users need to distinguish receipt from an actual answer. SDK reception, an idle Agent, completed delegation and an uncertain send cannot establish either fact. Reaction writes are optional external side effects; transport failure can leave their outcome unknown, and the platform does not document a caller-supplied idempotency identity for creating them.

## Decision

The application-defined Messaging owner starts `received` feedback only after canonical Source Event and Inbox Admission commit. It starts `answered` feedback only after the existing source-correlated reply Outbox reaches `provider-accepted`, using that source's own external identity and original Reply Route. Unrelated output, proactive reports, native questions and lifecycle completion do not trigger completion feedback. Mute retains silent Admission and permits explicit replies; block prevents new Admission through the existing policy owner.

An optional checked Provider Service capability maps these states to native Lark `GLANCE` and `DONE`. It revalidates the account fingerprint, live exclusive Consumer, Registration, current source conversation/thread/actor, cancellation and the caller's authorization fence before writing. This adds no SessionEvent, execution lifecycle, approval authority or intake rule. Older Providers remain usable for messaging without this capability.

Bounded feedback attempt metadata lives in the existing Source Event payload, outside its external content. It references the accepted Outbox for completion and introduces no second content store or schema generation. The authenticated management snapshot exposes recent states without message bodies. Persist an attempt before the external call and never automatically retry it, including after reconnect, restart, permission failure, timeout or lost response. An interrupted `attempted` state remains uncertain; `accepted` proves platform acceptance only, not Human reading or observed rendering.

Reaction calls run separately from intake, model execution and reply delivery, with a four-second deadline and at most 32 concurrent calls. Saturation or an invalidated source may skip feedback. Failures produce bounded structured developer diagnostics and cannot change Admission or the reply result.

For the first source in a new conversation, its committed notification waits asynchronously for the new checked reply connection to finish starting; the intake acknowledgement and model wake remain independent. Explicit permission denials carried by SDK HTTP exceptions are definite failures. Existing uncertain attempts retain their original state and are never replayed after a fix.

## Consequences

This deliberately favors omission over duplicate or misleading feedback. Enabling permission later does not replay historical reactions. A code rollback needs no schema migration, but cannot undo reactions already accepted by Lark. Actual emoji rendering, live permissions and source-specific external evidence require Human QA on the exact paired BotHarness/Provider candidates before qualification or pin promotion.
