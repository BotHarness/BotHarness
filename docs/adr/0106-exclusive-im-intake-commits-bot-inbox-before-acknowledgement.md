---
Status: Accepted
Date: 2026-10-01
---

# Exclusive IM intake commits Bot Inbox before acknowledgement

For the first work-group tracer, a Human binds one authenticated IM identity to one PersonaBot, grants one saved group destination, and explicitly enables mention reception. The public same-Host dsh-im Service owns the platform SDK, credentials, connection and authenticated normalization. A BotHarness Consumer Fiber holds its exclusive text-consumer lease. No BotHarness SDK connection, standalone dsh-im Session, synthetic Human DM or local Channel placement is created for the external message.

Messaging owns the synchronous transaction that saves one `bridge-message` Source Event and its canonical Bot Inbox Admission. It verifies the current registration, identity fingerprint, grant revision, active Bot and authorized group; only a trusted user message mentioning the receiving account enters this slice. The admission uses the existing `group-mention` source policy. Sender IDs remain external identities, not inferred local Humans. Original group, thread/root/parent and provider redelivery facts are retained. Stable provider/account/conversation/message identity deduplicates redelivery; conflicting content fails closed.

The consumer resolves `{accepted:true}` only after commit. Its callback does not re-enter the provider's account transition. After acknowledgement, the existing Orchestrator harvest or steer path receives the admission, including the actual receiving identity and origin. A persisted receive grant retries transient account-registration unavailability at most three times after cold start, with the same registration token, revision and scope; replacement, revocation and close cancel recovery. Durable pending admissions resume only after the exclusive lease is available; obsolete grant revisions cannot wake the Bot. Bot consideration, reply and platform delivery remain separate facts. Successful consideration can finish without a reply.

The qualified Provider currently normalizes only Lark `text`; formatted `post` bodies and attachments are excluded. Human UI verification uses a real member mention and plain text. Rich-text normalization needs its own qualified Provider slice, rather than silently treating unsupported content as an admitted message.

## Explicit replies

Orchestrator-only `bridge_read` reads the Bot's retained canonical source; it does not read platform history. `bridge_reply` accepts only that source ID and text. The owning Host derives the Bot, its current grant/account and the immutable original reply route. It rejects another Bot's source, revoked or changed grants, archived Bots, missing consumers and unavailable providers. The public checked-reply operation authenticates the account again and verifies the original remote message, sender, group and exact thread/root/parent before replying.

The existing Outbox persists an intent and attempt before the effect. This first slice permits one durable reply intent per source. Same-payload retries return that intent, changed payloads conflict, unknown outcomes are not resent after restart, and stale/deleted messages fail without falling back to a new group post. A provider-accepted reply is not evidence of delivery or read status.

## Authority and lifecycle

- Disabling reception, revoking a binding or losing the Consumer Fiber closes its lease. The provider's persistent external-consumer mode fails closed rather than falling back to standalone Session routing. Already retained source content remains readable locally.
- Inbox-only turns have no implicit local inbound Channel. Channel operations require an explicit joined destination, so external text and replies are not copied into the Human DM. Human can inspect retained origin and full text through the existing Bot Inbox.
- This tracer does not extend Memory acceptance's source-authority list. A bridge-primary turn does not start that observation/branch lifecycle; native reads still see the Bot's current Memory. External receipt does not automatically persist Memory. Existing local-source turns keep their original Memory semantics.
- Registration/start/refusal and Outbox outcomes use bounded structured developer diagnostics without credentials. Recovery never invents a provider history cursor: provider redelivery may leave gaps.
- Ordinary group collection, historical context reads, autonomous topic following, shared Channel placements, multiple routes, attachments and other providers remain separate tracers under [#48](https://github.com/BotHarness/BotHarness/issues/48) and [#629](https://github.com/BotHarness/BotHarness/issues/629). No edit/recall subscription or synchronized withdrawal is introduced.

## Why

Calling a provider's standalone Session handler creates competing execution authority and cannot acknowledge a durable BotHarness Inbox transaction. Connecting a second SDK creates a competing listener and credential lifecycle. A direct model-controlled send loses source authorization and topic continuity. An exclusive public consumer, canonical admission and checked Outbox reply exercise the production seams while leaving the wider Bridge model to subsequent validated slices.

The temporary qualified artifact and production enablement gate remain [ADR-0104](0104-isolated-im-profiles-pin-a-qualified-temporary-provider-fork.md); this application consumer does not imply an upstream release.

References: [#12](https://github.com/BotHarness/BotHarness/issues/12), [#46](https://github.com/BotHarness/BotHarness/issues/46), [ADR-0075](0075-inbox-handling-classifies-by-source-not-platform.md), [ADR-0101](0101-external-grants-require-authenticated-accounts-and-checked-targets.md).
