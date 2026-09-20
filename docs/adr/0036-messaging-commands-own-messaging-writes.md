---
Status: Accepted
Date: 2026-09-20
---

# Messaging commands own every Messaging write

Browser RPC, model tools, Bridges, webhooks, and system producers are adapters into one deep Messaging module; none may write the Messaging store, a Channel, or an Inbox directly. Each adapter derives a trusted Actor or system context from authenticated Human identity, explicit Session ownership, verified external identity mapping, or a named Host capability. Caller-supplied `actorId` and tool visibility are never authorization. The module performs authorization and ingress de-duplication, assigns the canonical Source Event id and time, and commits the event with its optional Channel placement, required Inbox Admissions, and delivery-outbox intent in the single transaction defined by ADR-0037. Runtime notification happens only after commit and is recoverable from the outbox.

Channel membership and Bot Channel subscription are separate relationships. Membership answers whether an Actor participates and may read or send; subscription answers whether a joined PersonaBot receives all messages, mentions, or none. Digest timing belongs to Wake Policy, not membership or subscription. A Bridge remains a configuration/transport relationship and forwards the mapped Human or PersonaBot Actor rather than becoming the author.

Source Events retain server-owned provenance and causal fields sufficient for Bridge echo de-duplication and deterministic Bot-loop policy: ingress identity, sender Actor or system source, replies/mentions, and optional causation, correlation, root-message, and Bot-hop facts. A repeated ingress key returns the existing event rather than inserting another row. Security-sensitive causal fields and Reply Routes are derived by the Messaging module, never trusted from an adapter payload. Reply Routes name a Host capability and external address but contain no credential value.

Bot-to-Bot causation is enforced by the Host, not by prompt advice. The Messaging module de-duplicates repeated delivery to the same recipient PersonaBot within one causation chain and increments a trusted Bot-hop counter whenever one PersonaBot's output causes another PersonaBot's input. The default maximum is eight Bot hops. An over-limit Source Event remains durable for history and audit but creates no automatic Inbox Admission, wake, or reply; a Human may inspect it and deliberately start a new causation root.

A correlated **Provider Echo** enriches the existing outbound Source Event, Channel placement, and Outbox receipt with provider identity and status rather than creating a second message or attention unit. Correlation uses trusted provider-account scope plus external message id, outbound identity, or idempotency evidence. An own-sender echo that cannot yet be linked is retained as unresolved evidence, creates no Inbox Admission or wake, and waits for bounded reconciliation; it is never discarded or treated as a fresh user message.

An observed provider edit or retraction re-enters this same command boundary as a new Source Revision causally linked to the original event; it never mutates or erases the original row. Revision-capable providers require a version, update timestamp, or deterministic revision hash in addition to the provider message id, so a real change is not discarded as a delivery retry. Admission, coalescing, and Wake Policy for that revision remain Host decisions rather than transport behavior.

A revision or retraction may arrive before its original message. The command accepts it as an Unresolved Revision keyed by provider account/message identity instead of rejecting it or ordering it by local arrival. When the original or another revision arrives, the chain head follows an authoritative provider version, update/recall time, or successful reconciliation. If those facts cannot establish order, the conflict remains explicit; a known tombstone is never undone merely because an older original arrived later.

An Unresolved Revision creates no Inbox Admission and no wake until a trusted original event/target link is established. A tombstone still suppresses any later matching original from normal presentation while linkage is completed. If provider facts cannot order multiple linked revisions, the chain enters Revision Conflict: all versions remain durable, known tombstones keep content hidden, and replies or Service Actions that depend on current content fail closed until provider reconciliation or explicit Human resolution selects the head.

When a provider exposes current-message fetch but no edit event, reconciliation is bounded to explicit refresh, preparation to reply to or otherwise use the source, and recovery of an unresolved item. A changed body/update marker appends a Source Revision through the same command boundary. BotHarness never polls all retained or pending messages as a substitute event stream, and receiving new-message events never implies permission to fetch current content.

Every reply or Service Action tied to a Source Event carries the exact Source Revision the Orchestrator observed. If bounded reconciliation or the local revision head changes before the external side effect begins, the command commits any newly discovered revision but rejects the side effect with stable `source-revised` details pointing at the new head. The Orchestrator reconsiders on the next safe step; BotHarness neither silently applies old reasoning to new content nor cancels the whole active turn.

A Reply is deliberately narrower than a provider Service Action. The Orchestrator replies with the Source Event id; the Host resolves its trusted Reply Route and invokes the provider without letting the model choose a credential, provider, or destination. A later Feishu or other provider plugin may separately expose authorized proactive actions such as posting to a selected channel or thread. Such an action may use an external target learned from Source Event context, but it is not a reply and must re-authorize that target through the provider service.

Each configured provider adapter declares Provider Capabilities for its account. The Host exposes triggers, reconciliation, replies, attachments, threads, and proactive Service Actions only when the required capability is present; unsupported and permission-dependent states are explicit. Capability does not grant use. Proactive actions additionally require the Service Grant defined by ADR-0038.

The Orchestrator is the PersonaBot's single social voice: it alone receives the full Bot Inbox and sends to Channels. A Work Session may read only explicitly granted source Channel context and reports through the Orchestrator; it cannot speak as the PersonaBot by default.

## Considered Options

- **Let each adapter write its own source store** — rejected: authorization, identity, de-duplication, provenance, Inbox admission, and reply routing would diverge by ingress path, as the current browser bridge already demonstrates by writing every message as an anonymous Human.
- **Treat tool visibility as authorization** — rejected: visibility controls model affordances, not whether the current Actor belongs to a Channel or may act there.
- **Combine membership with notification/wake settings** — rejected: participation authority and attention policy change for different reasons and have different consumers.
- **Let Work Sessions send directly** — rejected: multiple concurrent social voices would fragment persona consistency, audit, rate limiting, and Bot-loop control.
- **Expose provider-specific reply tools** — rejected: normal replies already have a trusted route, and asking the model to repeat provider/destination/credential selection adds spoofing and misrouting risk. Provider-specific proactive actions remain allowed as separate capabilities.
- **Poll pending messages for edits** — rejected: polling is costly, rate-limited, and still not an event guarantee; reconciliation happens only at bounded use/recovery points.
- **Silently retarget a stale reply to the newest revision** — rejected: the generated response may no longer answer the edited instruction, mention, or scope.
- **Send a reply known to target a stale revision** — rejected: a warning cannot undo an external side effect based on invalidated input.
- **Assume every installed adapter supports every operation** — rejected: provider APIs, app scopes, account configuration, and implemented handlers vary independently.
- **Reject a revision whose original is not local yet** — rejected: retries and distinct event channels naturally deliver causally related events out of order.
- **Use local arrival order as source version order** — rejected: a delayed original must not revive content already known to be retracted.
- **Admit or wake from unresolved sparse metadata** — rejected: a provider message id/chat id alone does not prove the PersonaBot target or attention policy.
- **Guess a current head during Revision Conflict** — rejected: external actions cannot safely depend on content whose ordering is unknown.
- **Rely on Persona prompts to prevent Bot-to-Bot loops** — rejected: causation de-duplication and hop limits are deterministic Host policy, not model etiquette.
- **Treat a provider echo as an ordinary inbound message** — rejected: it duplicates Channel content and may make a PersonaBot reply to itself.

## Consequences

- The profile-scoped Messaging store is private to the Messaging module; its methods do not form a Host or RPC authorization boundary.
- Browser, Orchestrator tools, and Bridge adapters must carry trusted context rather than author identity supplied by their request bodies.
- Channels and Bot Inboxes expose committed Source Event references and can recover missed runtime delivery from the transactional outbox.
- Bridge configuration selects an explicit Channel or PersonaBot Inbox target. Inbox Triggers own admission and Wake Policy selection; a Bridge never auto-creates a Channel or bypasses attention policy.
- Tests cover unauthorized read/send, forged actor fields, duplicate external ingress, local-plus-echo merging, causal-field derivation, and Work Session capability limits.
- Bot causation de-duplication and the default eight-hop limit suppress automatic continuation without deleting the over-limit history.
- Correlated provider echoes update existing outbound facts; unresolved own-sender echoes remain durable but cannot create attention or wake.
