# BotHarness runtime architecture on DSH

This product-owned reference describes the **BotHarness-proposed** layer built on DSH-native Agents, Sessions, Workspaces, Tools, and Subagents. It is not an inventory of upstream APIs. Product term definitions live only in the root [`CONTEXT.md`](/dev/spec/context); DSH/Cordis terms live in the [DSH canonical context](/dsh/context). This page explains how the two layers relate at runtime.

## Invariant

> Channel is the social world; PersonaBot is the product actor; Session is an Agent execution context. They are not identities for one another.

```text
Channel != PersonaBot != Session != Agent
```

## Three graphs

Keep these graphs explicit in architecture diagrams and data models.

### Product IM graph

```text
Human <-> Human
Human <-> PersonaBot
PersonaBot <-> PersonaBot
through Channel/DM and ctx.messaging (proposed)
```

PersonaBot-to-PersonaBot communication is peer social communication, not Subagent messaging.

### Product ownership graph

```text
PersonaBot
|- one Orchestrator root Session
|- zero or more independent Work root Sessions
`- durable ownership/directory metadata
```

Session Ownership relates each root Session to one PersonaBot and its root role. It is not a DSH `parentSession` delegation edge.

### DSH delegation graph

```text
Work root Session
`- main Work Agent
   `- Subagent Session
      `- nested Subagent Session
```

Subagent Sessions express parent-child delegation inside a Work Session. An independent Work Session is a fresh top-level DSH Session.

## Bot Inbox vs Agent Inbox

```text
Source Event    = immutable product content/provenance fact
Inbox Admission = durable PersonaBot eligibility/reference fact
Bot Inbox       = PersonaBot-level view over Admissions and Attention Decisions
Agent Inbox     = DSH execution queue for a selected delivery boundary
```

Internal Channels, external IM, webhooks, Work Reports, Work Lifecycle Notices, and system sources all first produce immutable Source Events. An Inbox Trigger may create one or more PersonaBot-specific Admissions without copying content. Reading content or a faithful actionable summary into an Orchestrator turn is an Observation; metadata listing and Human UI viewing are not.

Provider edit or recall becomes a Source Revision. A Reply uses the trusted non-secret Reply Route captured from provenance; a proactive provider-specific Service Action is separately selected and authorized. Raw external payloads never go directly to the Agent Inbox.

## Wake Policy and Delivery Policy

Wake Policy runs outside the Orchestrator because a sleeping Orchestrator cannot decide whether to wake itself. Delivery Policy then selects the safe DSH boundary from the Wake decision and current Orchestrator liveness.

```text
provider/internal input
-> one botharness.db transaction: Source Event + optional placement + Admission
-> Wake Policy: immediate / digest / no automatic wake
-> Delivery Policy: next step / next turn / explicit whole-turn abort
-> DSH Agent delivery primitive
```

Inbox ignoring is an Attention Decision, not a Wake result. Delivery Policy selects from the Orchestrator's actual Turn/Step state; it does not infer timing from priority alone.

Distinguish:

- deliver after the current Turn;
- deliver before the next Step;
- request cancellation/interruption of current work.

The third is a separate capability and may not be supported by every in-flight Tool/Provider.

## Orchestrator Session

The Orchestrator Session is the PersonaBot control plane. It owns high-level social behavior and chooses how work proceeds:

- list/read admitted Source Events and record Attention Decisions;
- decide whether and where to reply;
- list, inspect, create/reuse, address, and stop Work Sessions;
- receive Work Reports and Work Lifecycle Notices;
- coordinate PersonaBot-to-Human and PersonaBot-to-PersonaBot messaging;
- maintain high-level goals and Channel behavior.

Keep it thin. Repository edits, large Tool output, deep project context, and detailed Worker traces belong in Work Sessions.

The PersonaBot and Orchestrator Session are durable identities; the live Orchestrator Agent object may be resumed on demand.

## Work Session

A Work Session is an independent root DSH Session for one line of work. Its DSH Session id is the canonical identity; BotHarness does not create a second Work id. It may have a PersonaBot-local Continuity Key, bind a Workspace, and use specialized model/dependency configuration.

The **Work Session Directory** is a durable read model over Session Ownership plus DSH events, projections, and cold-query facts. It exposes:

```text
canonical Session id, purpose, Continuity Key, Workspace
requested model/dependencies
DSH-derived activity and lastRun
latest semantic Work Report
aggregate descendant activity
```

DSH-derived activity and semantic reported outcome stay separate; there is no duplicate BotHarness Work status lifecycle. Listings are filtered, ordered, opaque-cursor paginated, default to `updatedAt DESC` with Session id as tie-breaker, and require an explicit history filter for inactive rows. DSH Subagents never become top-level Work rows.

The Host-lifetime **BotWork Runtime** owns live Work AgentHandles. Orchestrator-scoped code does not own them because Orchestrator Agent teardown must not implicitly tear down independent Work lifetimes. Communication uses durable **Work Requests**, Session-origin **Work Reports**, and Host-origin **Work Lifecycle Notices**, not `ctx.subagents.sendMessage()`. A Work Session may use DSH-native Subagents internally.

Work Request modes are semantic: `context-update` contributes durable context without waking, `next-step` waits for the next safe Step, and `next-turn` queues a continuation after the current Turn. The runtime maps these to DSH `inject`, `steer`, or `followup`; ordinary requests never cancel an in-flight Tool or model step.

SQLite and DSH Session Persistence cannot commit atomically. Work creation and delivery therefore use a minimal **Work Delivery Intent** with a stable id, idempotent acceptance, and bounded restart reconciliation. This is not a general queue, workflow engine, or exactly-once claim.

Work Reports carry meaningful progress, blocked/waiting state, results, and artifact references; full execution history stays in DSH. Work Lifecycle Notices carry Host-derived settlement/error/cancellation facts with distinct provenance. Both are immutable Source Events and use the ordinary Inbox Trigger/Wake Policy path; attention coalescing may avoid duplicate wake without deleting either fact.

The profile-wide **Work Concurrency Limit** defaults to `3` and counts only independent Work roots actively executing. Excess create or idle-wake attempts fail immediately with structured machine fields plus an LLM-readable explanation. BotWork creates no queue, intent, or dormant DSH Session for a rejected attempt.

## Deep module capability seams

Use small command/query interfaces without freezing speculative CRUD:

- **Messaging** owns Source Event ingestion, Channel placement, Reply/Service Action intent, provider routing, provenance, Outbox, and post-commit facts.
- **Attention/Inbox** owns Inbox Trigger evaluation, Inbox Admission, Attention Unit, Attention Decision, Observation, and Wake Policy selection.
- **Bot Runtime** resolves PersonaBot → Orchestrator Session → live/cold Agent and applies Delivery Policy.
- **BotWork Runtime** owns Work Session Directory queries, Work AgentHandles, Work Requests, Work Delivery Intents, reports/notices, stop convergence, and concurrency admission.

Provider boundaries remain capability seams. A Feishu Provider declares Provider Capabilities and resolves non-secret account/Chat/Thread references; Reply is Host-routed from trusted provenance, while proactive Service Action requires a matching Service Grant.

## Commands, facts, and events

Use Services for commands/queries and Events for post-commit notification.

```text
Messaging command
-> validate Messaging Policy / Provider Capability / Service Grant as applicable
-> persist Source Event, references, Outbox Intent, and policy revision atomically
-> commit
-> emit live post-commit notification
```

Cordis notifications are not durable authority. Source Events, Admissions, Attention Decisions, Work Delivery Intents, reports/notices, Outbox, and audit facts remain in the operational database.

External edit and recall events become Source Revisions. They may update an existing unobserved Attention Unit or produce new attention after Observation. Reading current provider state does not replace recording a received fact when audit/order matters.

## Tool boundaries

Orchestrator-facing Tools adapt messaging, Inbox, and Work-control capabilities for the model. Work control is exactly `list_work`, `inspect_work`, `create_work`, `send_work_request`, and `stop_work`; waking compatible idle Work is a Work Request, so there is no separate resume tool. Work-facing Tools adapt filesystem, Shell, LSP, web, code runtime, and DSH Subagents. A Work Session receives `report_to_orchestrator`; its Subagents do not receive that Tool by default.

Default posture:

- Orchestrator owns external social identity and outbound Channel actions.
- Work Sessions get only source-scoped Channel reads when needed.
- Work Sessions do not receive arbitrary Bot Inbox or top-level Work-control authority; Work-to-Work coordination is mediated by the Orchestrator in v1.
- Tool visibility is Agent Scope; authorization is still enforced by the Service Provider.

## Persistence boundaries

- DSH Session Persistence owns Agent execution SessionEvents.
- One profile-scoped `$DSH_HOME/botharness/botharness.db` physically owns every BotHarness operational record: PersonaBot registry/Session Ownership, Channels, Source Events/Revisions, Admissions/Attention, policies, grants, Outbox, Work metadata, and audit.
- Deep modules remain separate through small interfaces and explicit table ownership; callers never receive generic SQL or compose transactions themselves.
- Soul/Memory files, Attachment CAS bytes, DSH Session logs, credentials, and DSH-native Settings remain outside this database under their own authorities.
- Projections and search indexes are derived and rebuildable.
- External side effects use idempotency and an outbox/reconciliation contract; a local transaction cannot make an external provider call exactly once.

The database owner holds the Profile Writer Lease, serializes writes, owns one Schema Generation, and emits Cordis notifications only after commit. `botharness.db` is not a DSH Storage Domain and a live raw file copy is not the backup interface.

## Loop prevention

Multi-PersonaBot communication needs deterministic controls such as causation/correlation/root message identifiers, hop count, per-Channel rate limits, cooldown, and budget. Prompt instructions may complement these controls but do not replace them.

## Native/proposed map

DSH-native building blocks:

```text
ctx.agents create/resume and Agent delivery methods
ctx.subagents delegation APIs
ctx.tools scoped Registrations/restrictions
Workspace registry and Session attachment
Session, SessionEvent, Session Persistence, Projection
```

BotHarness-proposed layer:

```text
Messaging, Attention/Inbox, Bot Runtime, BotWork Runtime capability seams
PersonaBot/Channel/Source Event/Inbox Admission/Attention Decision
Inbox Trigger/Wake Policy/Delivery Policy
Orchestrator Session and Work Session product roles
Work Session Directory/Continuity Key/Work Request/Work Report/Work Lifecycle Notice
botharness.db operational authority and model-facing Tools
```

Always keep the label when discussing an API that does not exist upstream.
