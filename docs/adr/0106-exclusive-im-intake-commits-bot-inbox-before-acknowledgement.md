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

## Explicit bounded context reads — #612

The application-defined `bridge_context` Consumer uses a Source Event already admitted to this PersonaBot as its anchor. It cannot choose a platform account, group or topic. Messaging rechecks the active lease, grant revision, account fingerprint and saved destination; the public Provider `historyChecked` operation reauthenticates the Bot identity and verifies the original remote message, sender and exact reply route before listing. Missing app scope, membership, deleted anchors or optional Thread capability are explicit refusals; Human credentials are never used.

The nearby selection and continuation lifetime below are superseded by [ADR-0125](0125-nearby-context-combines-time-coverage-and-count-minima.md). Lark Chat listing supports a creation-time window, so `nearby` means a bounded five-minute window on each side of the anchor. Thread listing uses the authenticated `thread_id` without pretending it accepts time filters. Pages contain at most 20 messages. Only provider-visible Human text is actionable in this slice; non-text, app-authored and withdrawn records are counted as omitted. Results say incomplete when the provider has more pages, unsupported records exist or the JSON budget truncates a page. Default output is 12,000 UTF-16 code units, expandable to 24,000 for a complete large text. Five-minute process-local continuation tokens bind Bot, source, grant revision and scope; within-page continuations refetch and reject a changed page rather than skip content. Cancellation and a 15-second deadline prevent a late response from committing after withdrawal of authority.

Only complete returned messages reconcile into existing canonical Source Events using provider/account/conversation/message identity. There is no second transcript store, history admission, subscription, wake, automatic Memory write or provider read receipt. A later live mention creates its admission even when a history read retained the same Source Event first. Existing pending/retryable admissions explicitly returned to the active Orchestrator join that turn's exact consumption set and retain its successful/failed handling semantics; omitted messages remain pending.

The anchor retains the last 20 bounded read metadata records: Session, scope, returned Source Event IDs, omission count, incomplete flag or safe refusal code. The Human's source detail reads those records and the latest returned canonical page. Human inspection fetches no remote history and changes no Bot observation. It does not grant replies to the returned ordinary messages; the original admitted source remains the reply anchor. Native provider search and other providers are separate capabilities.

Provider message reads request `with_sender_name` and preserve optional sender / mention display names alongside stable IDs. Names are presentation metadata, never identity or routing authority; enrichment updates the existing Source Event without admitting history or duplicating its message. Missing names fall back to IDs, and no contact-directory permission or lookup is introduced. Inbox input and Human source detail retain harvest-style Message / Source Event references, with the raw text and explicit mention mapping.
