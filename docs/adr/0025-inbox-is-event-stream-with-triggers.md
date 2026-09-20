# The Inbox is an event-stream projection, and its triggers are configurable

Each PersonaBot has one Inbox: a derived view over Source Events admitted from Channels, Bridges, webhooks, other Sessions, and system sources, not a second content mailbox or queue. An Inbox Admission durably records why a Source Event is eligible for that PersonaBot and references the one canonical event body. Separate Attention Decision facts record `observed`, `deferred`, `ignored`, or `handled`; pending is derived rather than stored as a mutable `delivered/consumed` lifecycle. Admission does not mean "the model processed it"; ignoring an event is allowed and silent, and nothing promises exactly-once model processing. The Host groups admitted events into three classes — immediate (direct mentions, DMs, blocked/approval, direct agent messages), digest (ordinary unread; default 30 seconds or 5 events), and silent (recorded, never wakes) — and wakes the Orchestrator with one bounded digest per class. Inbox Triggers are durable Host-enforced rules that match source facts, create admissions with a reason/priority, and select a Wake Policy; the Orchestrator may decide per-batch handling and record preferences in Memory, but it cannot change its own triggers. Proactive work is event-driven only: there is no scheduler or heartbeat in the model, because DSH `dsh-schedule` is session-local, requires at least 300 seconds, and only fires when the Agent is fully idle.

For one `(PersonaBot, Source Revision)`, every matching Inbox Trigger merges into one Admission. The Admission records every matched trigger and reason, takes the highest priority and strongest wake decision (`wake-now` over `digest` over `no-auto-wake`), and never expands source-read authority. Revisions of an unobserved event coalesce into one Attention Unit that presents the latest content or retraction without another wake unless a new trigger, mention, or priority escalation requires it. Once the earlier unit was observed or handled, a later revision creates new attention because the PersonaBot may already have acted on stale content.

Observation is recorded only when actionable event content or a faithful actionable summary enters the Orchestrator's turn input, or an explicit Inbox read returns it to the Orchestrator. Enqueuing delivery, listing metadata, emitting a notification, or a Human viewing the Inbox UI does not claim that the PersonaBot saw the event. This boundary keeps revision coalescing tied to the Bot's knowledge rather than transport or dashboard state.

Inbox Triggers are owned by each PersonaBot's Host policy. Reusable templates may create or update them, while profile-wide safety policy may disable or restrict them; a Bridge may supply source metadata and an explicit target but never owns attention or wake behavior. Two PersonaBots connected to the same Bridge may therefore apply different rules without changing the transport.

Creating or changing a Trigger is prospective by default. Historical matching requires an explicit bounded preview/reprocess command that records the Trigger version, selected source/time range, operator, and resulting Admissions. Reprocessed history defaults to `no-auto-wake`; waking historical matches requires a separate explicit Human choice. This preserves recovery and intentional backfill without turning configuration changes into surprise execution.

## Considered Options

- **Durable mailbox containing copied event bodies** — rejected: it would be a second authority next to Source Events. Durable Inbox Admission facts are sufficient to derive "what is pending".
- **Mutable `pending → delivered → consumed` mailbox state** — rejected: it would duplicate DSH delivery/execution state and erase why an event was deferred, ignored, or handled.
- **Cursor only** — rejected: a cursor cannot express an explicit defer or ignore decision for one admitted event.
- **One Admission per matching Trigger** — rejected: overlapping source, mention, and Bridge rules would duplicate the same attention and wake.
- **First matching Trigger wins** — rejected: order would silently discard stronger priority/wake intent and obscure why admission occurred.
- **Every Source Revision wakes again** — rejected: edits before observation are one evolving attention unit, not repeated work.
- **Delivery queued means observed** — rejected: a queued or failed turn has not shown the event to the PersonaBot.
- **Human UI viewing means the Bot observed it** — rejected: Human dashboard state and PersonaBot attention are different facts.
- **Bridge-owned or profile-only Triggers** — rejected: transport must not control Agent attention, and different PersonaBots need different policies for the same source.
- **Automatically replay history after a Trigger edit** — rejected: one policy change could create an unbounded admission and wake storm.
- **Forbid historical replay** — rejected: missed configuration and recovery sometimes require a controlled, auditable backfill.
- **Wake per message** — rejected: token cost and interruptions scale with chatter, not with work.
- **Model-owned trigger policy** — rejected: nondeterministic and hard to observe; triggers must be inspectable configuration.
- **`dsh-schedule` as the general trigger** — rejected: its minimum interval and idle-only delivery do not fit mentions and approvals.

## Consequences

- Wake Policy and Delivery Policy are distinct: Wake Policy classifies attention without touching an Agent; Delivery Policy maps an accepted wake to the DSH boundary appropriate for the Orchestrator's liveness.
- Source Event creation, required Inbox Admissions, and delivery-outbox intent share the authoritative Messaging transaction defined by ADR-0037; the projection is therefore restart-safe without copying event bodies.
- The Settings UI needs a notification-policy surface; defaults are 30 seconds / 5 events until measured.
- Channels, Bridges, webhooks, Sessions, and system producers enter an Inbox only through an Inbox Trigger; there is no per-source bypass. Wake Policy runs only after admission and remains a separate decision.
- Trigger merging is deterministic and auditable; permission checks run before trigger evaluation and cannot be weakened by a matching rule.

## Update (2026-09-20) — Delivery Policy respects DSH step and turn boundaries

For a cold Orchestrator, `wake-now` resumes it and uses `followup`; for a live idle Orchestrator it also uses `followup`, opening a new turn. For a running Orchestrator, `wake-now` uses `steer`, so the active model/tool step finishes normally and the event enters at the nearest next-step boundary. A due digest uses `followup` and therefore waits for the current turn to finish. `no-auto-wake` makes no Agent call; in particular it does not use `inject` as a hidden wake surrogate.

Hard interruption is reserved for explicit operator stop, permission revocation, or safety termination. DSH has no step-only abort that keeps the turn running: `cancel({ keepInbox: true })` aborts the whole active turn, after which the triggering work enters through a new follow-up turn. Ordinary DMs, mentions, approval results, and urgent messages never cancel the active turn. Correctness depends on DSH's `steer`/`followup` boundary contract, not on BotHarness inferring a private streaming/tool/step phase from the public `idle | running` status.
